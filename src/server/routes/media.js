const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const mediaService = require('../services/mediaService');
const { safeErrorMessage } = require('../utils/httpErrors');

const ALLOWED_MIME_TYPES = new Set([
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/webm'
]);

const maxSize = 25 * 1024 * 1024;
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxSize },
    fileFilter: (req, file, cb) => {
        const ok = /^image\/(jpeg|jpg|png|gif|webp)$/i.test(file.mimetype) ||
            /^video\/(mp4|webm)$/i.test(file.mimetype);
        cb(null, ok);
    }
});

router.post('/upload', authenticate, upload.single('file'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
        const chatId = req.body.chatId || null;
        const result = mediaService.saveMedia(req.file.buffer, {
            userId: req.user.id,
            chatId,
            mimeType: req.file.mimetype
        });
        res.json({ success: true, data: { url: result.url, filename: result.filename } });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.post('/capture', authenticate, (req, res) => {
    try {
        const { imageData, chatId, mimeType } = req.body;
        if (!imageData) return res.status(400).json({ success: false, error: 'No image data provided' });
        const resolvedMime = mimeType || 'image/jpeg';
        if (!ALLOWED_MIME_TYPES.has(resolvedMime)) {
            return res.status(400).json({ success: false, error: 'Unsupported media type' });
        }
        const result = mediaService.saveBase64(imageData, {
            userId: req.user.id,
            chatId: chatId || null,
            mimeType: resolvedMime
        });
        res.json({ success: true, data: { url: result.url, filename: result.filename } });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

module.exports = router;
