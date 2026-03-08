const { run, all, get } = require('../core/query');
const { transaction } = require('../core/transaction');
const { generateId } = require('../core/ids');


const CHUNK_SIZE = 1500;

function chunkContent(content) {
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
    return chunks;
}

const KnowledgeRepository = {
    addDocumentWithChunks(agentId, title, content, source = '') {
        const chunks = chunkContent(content);
        return this.addDocument(agentId, title, source, content, chunks);
    },

    addDocument(agentId, title, source, content, chunks) {
        const id = generateId(10);
        const totalTokens = chunks.reduce((s, c) => s + c.tokenCount, 0);
        transaction(() => {
            run(`INSERT INTO knowledge_documents (id, agent_id, title, source, content, chunk_count, token_count) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [id, agentId, title, source || '', content, chunks.length, totalTokens]);
            for (let i = 0; i < chunks.length; i++) {
                const cid = generateId(12);
                run(`INSERT INTO knowledge_chunks (id, document_id, chunk_index, content, token_count) VALUES (?, ?, ?, ?, ?)`,
                    [cid, id, i, chunks[i].content, chunks[i].tokenCount]);
            }
        });
        return this.getDocument(id);
    },

    getDocument(id) { return get('SELECT * FROM knowledge_documents WHERE id = ?', [id]); },

    listDocuments(agentId) {
        return all('SELECT id, agent_id, title, source, chunk_count, token_count, created_at FROM knowledge_documents WHERE agent_id = ? ORDER BY created_at DESC', [agentId]);
    },

    deleteDocument(id) {
        transaction(() => {
            run('DELETE FROM knowledge_chunks WHERE document_id = ?', [id]);
            run('DELETE FROM knowledge_documents WHERE id = ?', [id]);
        });
    },

    searchChunks(agentId, keywords, limit = 5) {
        if (!keywords || !keywords.length) return [];
        const terms = keywords.map(k => `%${k.toLowerCase()}%`);
        const conditions = terms.map(() => `LOWER(kc.content) LIKE ?`).join(' OR ');
        return all(`SELECT kc.*, kd.title as document_title FROM knowledge_chunks kc JOIN knowledge_documents kd ON kc.document_id = kd.id WHERE kd.agent_id = ? AND (${conditions}) ORDER BY kc.chunk_index ASC LIMIT ?`,
            [agentId, ...terms, limit]);
    },

    getChunksForDocument(documentId) {
        return all('SELECT * FROM knowledge_chunks WHERE document_id = ? ORDER BY chunk_index ASC', [documentId]);
    }
};


module.exports = KnowledgeRepository;
