const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const mediaService = require('../services/mediaService');

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
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/capture', authenticate, (req, res) => {
    try {
        const { imageData, chatId, mimeType } = req.body;
        if (!imageData) return res.status(400).json({ success: false, error: 'No image data provided' });
        const result = mediaService.saveBase64(imageData, {
            userId: req.user.id,
            chatId: chatId || null,
            mimeType: mimeType || 'image/jpeg'
        });
        res.json({ success: true, data: { url: result.url, filename: result.filename } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
