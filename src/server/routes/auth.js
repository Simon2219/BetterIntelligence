const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const Config = require('../../../config/Config');
const { UserSystem } = require('../database/Database');
const jwtService = require('../services/jwtService');
const log = require('../services/Logger')('auth');
const { authenticate } = require('../middleware/auth');

function sanitizeUser(u) {
    if (!u) return null;
    const { password_hash, ...safe } = u;
    try { safe.settings = JSON.parse(safe.settings || '{}'); } catch { safe.settings = {}; }
    return safe;
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
        const minLen = Config.get('auth.passwordMinLength', 8);
        if (password.length < minLen) return res.status(400).json({ success: false, error: `Password min ${minLen} chars` });

        if (UserSystem.getByEmail(email)) return res.status(409).json({ success: false, error: 'Email taken' });
        if (UserSystem.getByUsername(username)) return res.status(409).json({ success: false, error: 'Username taken' });

        const hash = await bcrypt.hash(password, 12);
        const userId = UserSystem.create({
            email: email.toLowerCase().trim(),
            username: username.trim(),
            displayName: displayName.trim(),
            passwordHash: hash,
            roleId: 1,
            settings: { theme: 'dark' }
        });

        const user = UserSystem.getByEmail(email);
        const tokens = jwtService.generateTokens(user);

        res.cookie('refresh_token', tokens.refreshToken, {
            httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
            maxAge: Config.get('auth.refreshTokenExpiryDays', 30) * 864e5
        });

        res.status(201).json({ success: true, data: { userId, accessToken: tokens.accessToken, expiresIn: tokens.expiresIn, user: sanitizeUser(user) } });
    } catch (err) {
        log.error('Signup error', { err: err.message });
        res.status(500).json({ success: false, error: 'Signup failed' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { login, password } = req.body;
        if (!login || !password) return res.status(400).json({ success: false, error: 'Login and password required' });

        let user = UserSystem.getByEmail(login) || UserSystem.getByUsername(login);
        if (!user) return res.status(401).json({ success: false, error: 'Invalid credentials' });
        if (!user.is_active) return res.status(403).json({ success: false, error: 'Account deactivated' });

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return res.status(401).json({ success: false, error: 'Invalid credentials' });

        const tokens = jwtService.generateTokens(user);
        res.cookie('refresh_token', tokens.refreshToken, {
            httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
            maxAge: Config.get('auth.refreshTokenExpiryDays', 30) * 864e5
        });

        UserSystem.setOnline(user.id, true);
        const full = UserSystem.getWithRole(user.id);
        res.json({ success: true, data: { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn, user: sanitizeUser(full) } });
    } catch (err) {
        log.error('Login error', { err: err.message });
        res.status(500).json({ success: false, error: 'Login failed' });
    }
});

router.post('/refresh', (req, res) => {
    try {
        const rt = req.cookies?.refresh_token || req.body.refreshToken;
        if (!rt) return res.status(401).json({ success: false, error: 'Refresh token required' });

        const decoded = require('jsonwebtoken').decode(rt);
        if (!decoded?.userId) return res.status(401).json({ success: false, error: 'Invalid token' });

        const user = UserSystem.getById(decoded.userId);
        if (!user) return res.status(401).json({ success: false, error: 'User not found' });

        const tokens = jwtService.refreshTokens(rt, user);
        if (!tokens) return res.status(401).json({ success: false, error: 'Invalid or expired refresh token' });

        res.cookie('refresh_token', tokens.refreshToken, {
            httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
            maxAge: Config.get('auth.refreshTokenExpiryDays', 30) * 864e5
        });

        const full = UserSystem.getWithRole(user.id);
        res.json({ success: true, data: { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn, user: sanitizeUser(full) } });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Refresh failed' });
    }
});

router.post('/logout', authenticate, (req, res) => {
    try {
        if (req.cookies?.refresh_token) jwtService.revokeToken(req.cookies.refresh_token);
        res.clearCookie('refresh_token');
        res.json({ success: true });
    } catch {
        res.json({ success: true });
    }
});

router.get('/session', authenticate, (req, res) => {
    const full = UserSystem.getWithRole(req.user.id);
    res.json({ success: true, data: { user: sanitizeUser(full) } });
});

module.exports = router;
module.exports.sanitizeUser = sanitizeUser;
