const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const Config = require('../../../config/Config');
const { UserRepository } = require('../database');
const jwtService = require('../services/jwtService');
const socketSessionRegistry = require('../services/socketSessionRegistry');
const log = require('../services/Logger')('auth');
const { authenticate } = require('../middleware/auth');
const { sanitizeUser, validatePassword } = require('../utils/helperFunctions');
const { safeErrorMessage } = require('../utils/httpErrors');

function getRefreshCookieOptions(withMaxAge = true) {
    const opts = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/'
    };
    if (withMaxAge) {
        opts.maxAge = Config.get('auth.refreshTokenExpiryDays', 30) * 864e5;
    }
    return opts;
}

function setRefreshCookie(res, refreshToken) {
    res.cookie('refresh_token', refreshToken, getRefreshCookieOptions(true));
}

function clearRefreshCookie(res) {
    res.clearCookie('refresh_token', getRefreshCookieOptions(false));
}

router.post('/signup', async (req, res) => {
    try {
        const { email, password, username, displayName } = req.body;
        if (!email || !password || !username || !displayName) {
            return res.status(400).json({ success: false, error: 'email, password, username, displayName required' });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ success: false, error: 'Invalid email' });
        }
        if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
            return res.status(400).json({ success: false, error: 'Username: 3-30 alphanumeric/underscore' });
        }
        const pwError = validatePassword(password);
        if (pwError) return res.status(400).json({ success: false, error: pwError });

        if (UserRepository.getByEmail(email) || UserRepository.getByUsername(username)) {
            return res.status(409).json({ success: false, error: 'An account with this email or username already exists' });
        }

        const hash = await bcrypt.hash(password, 12);
        const createdUser = UserRepository.create({
            email: email.toLowerCase().trim(),
            username: username.trim(),
            displayName: displayName.trim(),
            passwordHash: hash,
            roleId: 1,
            settings: { theme: 'dark' }
        });

        const user = UserRepository.getByEmail(email);
        const tokens = jwtService.generateTokens(user);

        setRefreshCookie(res, tokens.refreshToken);

        res.status(201).json({
            success: true,
            data: {
                userId: createdUser?.id || null,
                accessToken: tokens.accessToken,
                expiresIn: tokens.expiresIn,
                user: sanitizeUser(user)
            }
        });
    } catch (err) {
        log.error('Signup error', { err: err.message });
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { login, password } = req.body;
        if (!login || !password) return res.status(400).json({ success: false, error: 'Login and password required' });

        let user = UserRepository.getByEmail(login) || UserRepository.getByUsername(login);
        if (!user) return res.status(401).json({ success: false, error: 'Invalid credentials' });
        if (!user.is_active) return res.status(403).json({ success: false, error: 'Account deactivated' });

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return res.status(401).json({ success: false, error: 'Invalid credentials' });

        const tokens = jwtService.generateTokens(user);
        setRefreshCookie(res, tokens.refreshToken);

        UserRepository.setOnline(user.id, true);
        const full = UserRepository.getWithRole(user.id);
        res.json({ success: true, data: { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn, user: sanitizeUser(full) } });
    } catch (err) {
        log.error('Login error', { err: err.message });
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.post('/refresh', (req, res) => {
    try {
        const rt = req.cookies?.refresh_token;
        if (!rt) return res.status(401).json({ success: false, error: 'Refresh token required' });

        const refreshPayload = jwtService.verifyRefreshToken(rt);
        if (!refreshPayload?.userId) return res.status(401).json({ success: false, error: 'Invalid token' });

        const user = UserRepository.getById(refreshPayload.userId);
        if (!user) return res.status(401).json({ success: false, error: 'User not found' });

        const tokens = jwtService.refreshTokens(rt, user);
        if (!tokens) return res.status(401).json({ success: false, error: 'Invalid or expired refresh token' });

        setRefreshCookie(res, tokens.refreshToken);

        const full = UserRepository.getWithRole(user.id);
        res.json({ success: true, data: { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn, user: sanitizeUser(full) } });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.post('/logout', (req, res) => {
    try {
        const rt = req.cookies?.refresh_token;
        if (rt) {
            jwtService.revokeToken(rt);
        }
    } catch (err) {
        log.warn('Logout revoke failed', { err: err.message });
    } finally {
        clearRefreshCookie(res);
        res.json({ success: true });
    }
});

router.post('/logout-all', authenticate, (req, res) => {
    try {
        jwtService.revokeAllUserTokens(req.user.id);
        socketSessionRegistry.disconnectUserSockets(req.user.id);
        clearRefreshCookie(res);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.get('/session', authenticate, (req, res) => {
    const full = UserRepository.getWithRole(req.user.id);
    res.json({ success: true, data: { user: sanitizeUser(full) } });
});

module.exports = router;
