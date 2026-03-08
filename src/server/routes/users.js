const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const Config = require('../../../config/Config');
const { UserRepository } = require('../database');
const { authenticate } = require('../middleware/auth');
const jwtService = require('../services/jwtService');
const socketSessionRegistry = require('../services/socketSessionRegistry');
const notificationService = require('../services/notificationService');
const { sanitizeUser, validatePassword } = require('../utils/helperFunctions');
const { safeErrorMessage } = require('../utils/httpErrors');

router.get('/me', authenticate, (req, res) => {
    const u = UserRepository.getWithRole(req.user.id);
    res.json({ success: true, data: sanitizeUser(u) });
});

router.put('/me', authenticate, (req, res) => {
    try {
        const allowed = ['displayName', 'avatarUrl', 'bio', 'settings'];
        const updates = {};
        for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];
        UserRepository.update(req.user.id, updates);
        const u = UserRepository.getWithRole(req.user.id);
        res.json({ success: true, data: sanitizeUser(u) });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.post('/me/password', authenticate, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, error: 'currentPassword and newPassword required' });
        }
        const pwError = validatePassword(newPassword);
        if (pwError) return res.status(400).json({ success: false, error: pwError });
        const user = UserRepository.getById(req.user.id);
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });
        const valid = await bcrypt.compare(currentPassword, user.password_hash);
        if (!valid) return res.status(401).json({ success: false, error: 'Current password is incorrect' });
        const hash = await bcrypt.hash(newPassword, 12);
        UserRepository.updatePassword(req.user.id, hash);
        jwtService.revokeAllUserTokens(req.user.id);
        socketSessionRegistry.disconnectUserSockets(req.user.id);
        res.json({ success: true, message: 'Password updated. All active sessions were revoked.' });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) || 'Update failed' });
    }
});

router.get('/me/notifications', authenticate, (req, res) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20;
        const notifications = notificationService.listNotifications(req.user.id, limit);
        const unreadCount = notificationService.getUnreadCount(req.user.id);
        res.json({
            success: true,
            data: {
                unreadCount,
                notifications
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) || 'Failed to load notifications' });
    }
});

router.post('/me/notifications/:id/ack', authenticate, (req, res) => {
    try {
        const notificationId = String(req.params.id || '').trim();
        if (!notificationId) {
            return res.status(400).json({ success: false, error: 'notification id required' });
        }
        const acked = notificationService.ackNotification(req.user.id, notificationId);
        if (!acked) {
            return res.status(404).json({ success: false, error: 'Notification not found' });
        }
        res.json({
            success: true,
            data: {
                unreadCount: notificationService.getUnreadCount(req.user.id)
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) || 'Failed to acknowledge notification' });
    }
});

router.post('/me/notifications/read-all', authenticate, (req, res) => {
    try {
        notificationService.ackAllNotifications(req.user.id);
        res.json({
            success: true,
            data: {
                unreadCount: notificationService.getUnreadCount(req.user.id)
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) || 'Failed to acknowledge all notifications' });
    }
});

module.exports = router;
