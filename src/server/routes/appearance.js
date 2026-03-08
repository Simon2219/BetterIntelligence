const express = require('express');
const router = express.Router();
const appearanceService = require('../services/appearanceService');
const { safeErrorMessage } = require('../utils/httpErrors');

router.get('/', (req, res) => {
    try {
        const { dark, light } = appearanceService.getResolvedAppearance();
        res.json({ success: true, data: { dark, light } });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

module.exports = router;
