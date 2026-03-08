const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const ProviderRegistry = require('../ai/providers/ProviderRegistry');
const aiModelCatalogService = require('../ai/services/aiModelCatalogService');
const { safeErrorMessage } = require('../utils/httpErrors');

router.get('/status', authenticate, (req, res) => {
    try {
        res.json({ success: true, data: ProviderRegistry.getStatus() });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.get('/providers', authenticate, async (req, res) => {
    try {
        const providers = await aiModelCatalogService.getUserFacingProviders();
        res.json({ success: true, data: providers });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.get('/providers/:name/models', authenticate, async (req, res) => {
    try {
        const data = await aiModelCatalogService.getUserFacingProviderModels(req.params.name);
        if (!data) return res.status(404).json({ success: false, error: 'Provider not found' });
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

module.exports = router;
