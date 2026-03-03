const express = require('express');
const router = express.Router();
const appearanceService = require('../services/appearanceService');

router.get('/', (req, res) => {
    try {
        const { dark, light } = appearanceService.getResolvedAppearance();
        res.json({ success: true, data: { dark, light } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
