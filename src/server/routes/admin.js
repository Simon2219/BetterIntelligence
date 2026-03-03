/**
 * Admin Routes - Dashboard, settings, colors, config
 */
const express = require('express');
const router = express.Router();
const Config = require('../../../config/Config');
const { UserRepository, RoleRepository, SettingsRepository } = require('../database');
const { authenticate, requirePermission } = require('../middleware/auth');
const appearanceService = require('../services/appearanceService');
const aiModelCatalogService = require('../services/aiModelCatalogService');
const Logger = require('../services/Logger');
const realtimeBus = require('../services/realtimeBus');

function notifyAdminAction(req, title, body, meta = {}) {
    realtimeBus.createNotification({
        userId: req?.user?.id,
        type: 'admin_action',
        title,
        body,
        severity: 'info',
        meta
    });
}

router.get('/dashboard', authenticate, requirePermission('can_access_admin'), (req, res) => {
    try {
        const userCount = UserRepository.getUserCount();
        const roleCount = RoleRepository.getRoleCount();
        const stats = {
            userCount,
            roleCount
        };
        res.json({ success: true, data: stats });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/settings', authenticate, requirePermission('can_manage_settings'), (req, res) => {
    try {
        const settings = SettingsRepository.getAll();
        const config = Config.getAll();
        res.json({ success: true, data: { settings, config } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.put('/settings', authenticate, requirePermission('can_manage_settings'), (req, res) => {
    try {
        const { settings } = req.body;
        if (!settings || typeof settings !== 'object') {
            return res.status(400).json({ success: false, error: 'Settings object required' });
        }
        for (const [key, val] of Object.entries(settings)) {
            const value = typeof val === 'object' ? JSON.stringify(val) : String(val);
            SettingsRepository.set(key, value, req.body.category || 'general');
            Config.set(key, val);
        }
        notifyAdminAction(req, 'Settings updated', 'Application settings were updated.', { category: req.body.category || 'general' });
        res.json({ success: true, message: 'Settings updated' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/colors', authenticate, requirePermission('can_manage_settings'), (req, res) => {
    try {
        const data = appearanceService.getAdminColorsPayload();
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.put('/colors', authenticate, requirePermission('can_manage_settings'), (req, res) => {
    try {
        const { theme, colors } = req.body;
        if (!theme || !colors) {
            return res.status(400).json({ success: false, error: 'Theme and colors required' });
        }
        const data = appearanceService.updateThemeColors(theme, colors);
        notifyAdminAction(req, 'Theme colors updated', `Updated ${theme} theme colors.`, { theme });
        res.json({ success: true, data });
    } catch (err) {
        res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
});

router.post('/palettes', authenticate, requirePermission('can_manage_settings'), (req, res) => {
    try {
        const { name, colors } = req.body || {};
        const data = appearanceService.createPalette({ name, colors });
        notifyAdminAction(req, 'Palette created', `Created palette "${data?.palette?.name || name || 'untitled'}".`, { paletteId: data?.palette?.id || null });
        res.status(201).json({ success: true, data });
    } catch (err) {
        res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
});

router.put('/palettes/reorder', authenticate, requirePermission('can_manage_settings'), (req, res) => {
    try {
        const order = req.body?.order;
        const data = appearanceService.reorderPalettes(order);
        notifyAdminAction(req, 'Palettes reordered', 'Palette order was updated.');
        res.json({ success: true, data });
    } catch (err) {
        res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
});

router.put('/palettes/:id', authenticate, requirePermission('can_manage_settings'), (req, res) => {
    try {
        const { name, colors } = req.body || {};
        const data = appearanceService.updatePalette(req.params.id, { name, colors });
        notifyAdminAction(req, 'Palette updated', `Updated palette "${data?.palette?.name || req.params.id}".`, { paletteId: req.params.id });
        res.json({ success: true, data });
    } catch (err) {
        res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
});

router.delete('/palettes/:id', authenticate, requirePermission('can_manage_settings'), (req, res) => {
    try {
        const data = appearanceService.deletePalette(req.params.id);
        notifyAdminAction(req, 'Palette deleted', `Deleted palette "${req.params.id}".`, { paletteId: req.params.id });
        res.json({ success: true, data });
    } catch (err) {
        res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
});

router.put('/palette-assignments', authenticate, requirePermission('can_manage_settings'), (req, res) => {
    try {
        const { darkPaletteId, lightPaletteId } = req.body || {};
        const data = appearanceService.updateAssignments({ darkPaletteId, lightPaletteId });
        notifyAdminAction(req, 'Palette assignments updated', 'Updated dark/light theme assignments.', { darkPaletteId, lightPaletteId });
        res.json({ success: true, data });
    } catch (err) {
        res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
});

router.get('/models', authenticate, requirePermission('can_manage_settings'), async (req, res) => {
    try {
        const days = req.query.days ? parseInt(req.query.days, 10) : 30;
        const data = await aiModelCatalogService.getAdminCatalog({ days });
        res.json({ success: true, data });
    } catch (err) {
        res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
});

router.post('/models/refresh', authenticate, requirePermission('can_manage_settings'), async (req, res) => {
    try {
        await aiModelCatalogService.refreshCatalog({ force: true });
        const days = req.body?.days ? parseInt(req.body.days, 10) : 30;
        const data = await aiModelCatalogService.getAdminCatalog({ days, forceRefresh: true });
        notifyAdminAction(req, 'Model catalog refreshed', 'Refreshed provider/model catalog from runtime providers.');
        res.json({ success: true, data });
    } catch (err) {
        res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
});

router.patch('/models/providers/:provider', authenticate, requirePermission('can_manage_settings'), (req, res) => {
    try {
        const providerName = String(req.params.provider || '');
        const data = aiModelCatalogService.updateProviderConfig(providerName, req.body || {});
        notifyAdminAction(req, 'Provider updated', `Updated provider "${providerName}".`, { providerName });
        res.json({ success: true, data });
    } catch (err) {
        res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
});

router.patch('/models/:provider/:modelId', authenticate, requirePermission('can_manage_settings'), (req, res) => {
    try {
        const providerName = String(req.params.provider || '');
        const modelId = String(req.params.modelId || '');
        const data = aiModelCatalogService.updateModelConfig(providerName, modelId, req.body || {});
        notifyAdminAction(req, 'Model updated', `Updated model "${providerName}/${modelId}".`, { providerName, modelId });
        res.json({ success: true, data });
    } catch (err) {
        res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
});

router.get('/models/:provider/:modelId/usage', authenticate, requirePermission('can_manage_settings'), (req, res) => {
    try {
        const providerName = String(req.params.provider || '');
        const modelId = String(req.params.modelId || '');
        const days = req.query.days ? parseInt(req.query.days, 10) : 30;
        const bucket = req.query.bucket === 'hour' ? 'hour' : 'day';
        const data = aiModelCatalogService.getModelUsage(providerName, modelId, { days, bucket });
        res.json({ success: true, data });
    } catch (err) {
        res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
});

router.get('/config', authenticate, requirePermission('can_access_admin'), (req, res) => {
    try {
        const config = Config.getAll();
        if (config.auth) {
            if (config.auth.accessSecret) delete config.auth.accessSecret;
            if (config.auth.refreshSecret) delete config.auth.refreshSecret;
        }
        res.json({ success: true, data: config });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/logging', authenticate, requirePermission('can_manage_settings'), (req, res) => {
    try {
        res.json({ success: true, data: Logger.getStatus ? Logger.getStatus() : {} });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/logging', authenticate, requirePermission('can_manage_settings'), (req, res) => {
    try {
        const { enabled, level, console: consoleOut, file } = req.body;
        if (enabled !== undefined && Logger.setEnabled) Logger.setEnabled(enabled);
        if (level !== undefined && Logger.setLevel) Logger.setLevel(level);
        if (consoleOut !== undefined && Logger.setConsoleOutput) Logger.setConsoleOutput(consoleOut);
        if (file !== undefined && Logger.setFileOutput) Logger.setFileOutput(file);
        notifyAdminAction(req, 'Logging settings updated', 'Application logging settings were changed.');
        res.json({ success: true, data: Logger.getStatus ? Logger.getStatus() : {} });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;


