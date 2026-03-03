/**
 * Roles API - List, create, update, delete roles
 */
const express = require('express');
const router = express.Router();
const { RoleRepository } = require('../database');
const { authenticate, requirePermission } = require('../middleware/auth');

router.get('/', authenticate, requirePermission('can_manage_roles'), (req, res) => {
    try {
        const roles = RoleRepository.getAllRoles();
        const permissionColumns = RoleRepository.getPermissionColumns();
        res.json({ success: true, data: { roles, permissionColumns } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/permissions/list', authenticate, requirePermission('can_manage_roles'), (req, res) => {
    try {
        res.json({ success: true, data: RoleRepository.getPermissionColumns() });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/:id', authenticate, requirePermission('can_manage_roles'), (req, res) => {
    try {
        const role = RoleRepository.getById(parseInt(req.params.id, 10));
        if (!role) return res.status(404).json({ success: false, error: 'Role not found' });
        res.json({ success: true, data: role });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/', authenticate, requirePermission('can_manage_roles'), (req, res) => {
    try {
        const { name, description, ...perms } = req.body;
        if (!name?.trim()) return res.status(400).json({ success: false, error: 'Name required' });
        const role = RoleRepository.create({ name: name.trim(), description: description?.trim() || '', ...perms });
        res.status(201).json({ success: true, data: role });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.put('/:id', authenticate, requirePermission('can_manage_roles'), (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const role = RoleRepository.getById(id);
        if (!role) return res.status(404).json({ success: false, error: 'Role not found' });
        const updates = req.body;
        const updated = RoleRepository.update(id, updates);
        res.json({ success: true, data: updated });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.delete('/:id', authenticate, requirePermission('can_manage_roles'), (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const role = RoleRepository.getById(id);
        if (!role) return res.status(404).json({ success: false, error: 'Role not found' });
        RoleRepository.delete(id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;


