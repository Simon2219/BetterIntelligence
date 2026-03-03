const express = require('express');
const router = express.Router();
const { AIAgentRepository, KnowledgeRepository } = require('../database');
const { authenticate } = require('../middleware/auth');

function checkAgentOwnership(req, res) {
    const agent = AIAgentRepository.getById(req.params.agentId);
    if (!agent) { res.status(404).json({ success: false, error: 'Agent not found' }); return null; }
    if (agent.user_id && agent.user_id.toUpperCase() !== req.user.id.toUpperCase()) {
        res.status(403).json({ success: false, error: 'Forbidden' }); return null;
    }
    return agent;
}

router.get('/:agentId/documents', authenticate, (req, res) => {
    try {
        if (!checkAgentOwnership(req, res)) return;
        const docs = KnowledgeRepository.listDocuments(req.params.agentId);
        res.json({ success: true, data: docs });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/:agentId/documents', authenticate, (req, res) => {
    try {
        if (!checkAgentOwnership(req, res)) return;
        const { title, content, source } = req.body;
        if (!title || !content) return res.status(400).json({ success: false, error: 'title and content required' });
        if (typeof title !== 'string' || title.trim().length < 1 || title.length > 200) return res.status(400).json({ success: false, error: 'Title must be 1-200 characters' });
        const MAX_CONTENT_SIZE = 512000;
        if (typeof content !== 'string' || content.length > MAX_CONTENT_SIZE) return res.status(400).json({ success: false, error: `Content must be under ${MAX_CONTENT_SIZE / 1000}KB` });

        const CHUNK_SIZE = 1500;
        const words = content.split(/\s+/);
        const chunks = [];
        let current = [];
        let currentLen = 0;
        for (const word of words) {
            current.push(word);
            currentLen += word.length + 1;
            if (currentLen >= CHUNK_SIZE) {
                const text = current.join(' ');
                chunks.push({ content: text, tokenCount: Math.ceil(text.length / 4) });
                current = [];
                currentLen = 0;
            }
        }
        if (current.length) {
            const text = current.join(' ');
            chunks.push({ content: text, tokenCount: Math.ceil(text.length / 4) });
        }

        const doc = KnowledgeRepository.addDocument(req.params.agentId, title, source || '', content, chunks);
        res.status(201).json({ success: true, data: doc });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/:agentId/documents/:docId/chunks', authenticate, (req, res) => {
    try {
        if (!checkAgentOwnership(req, res)) return;
        const chunks = KnowledgeRepository.getChunksForDocument(req.params.docId);
        res.json({ success: true, data: chunks.map(c => ({ id: c.id, index: c.chunk_index, preview: c.content.substring(0, 200), tokenCount: c.token_count })) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.delete('/:agentId/documents/:docId', authenticate, (req, res) => {
    try {
        if (!checkAgentOwnership(req, res)) return;
        KnowledgeRepository.deleteDocument(req.params.docId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;


