/**
 * ContextBuilder - Build system prompt and messages for AI text generation.
 * Supports personality dimensions, response format, behavior rules, sample dialogues,
 * knowledge base injection, and configurable memory strategies.
 */
const Config = require('../../../../config/Config');
const { ChatRepository, KnowledgeRepository, SkillRepository } = require('../../database');
const SkillLoader = require('../../services/SkillLoader');

const FORMALITY_LABELS = ['extremely casual, use slang and abbreviations', 'very casual', 'casual and friendly', 'slightly casual', 'neutral tone', 'balanced', 'slightly formal', 'formal and professional', 'very formal', 'highly formal, use precise language', 'extremely formal, academic register'];
const VERBOSITY_LABELS = ['ultra-terse, one-sentence max', 'very brief, 1-2 sentences', 'brief, 2-3 sentences', 'concise', 'moderate length', 'balanced', 'somewhat detailed', 'detailed with examples', 'very detailed explanations', 'comprehensive and thorough', 'exhaustive, cover every angle'];

function buildHistory(chatId, limit = 50) {
    const chat = ChatRepository.getById(chatId);
    if (!chat) return [];
    const raw = ChatRepository.getMessages(chatId, limit);
    return raw
        .filter(m => m.content || m.type === 'image' || m.type === 'video' || m.type === 'media')
        .map(m => {
            const isUser = (chat.participant_1 && String(m.senderId).toUpperCase() === String(chat.participant_1).toUpperCase()) ||
                String(m.senderId || '').startsWith('embed:');
            let content = m.content || '';
            if (m.type === 'image' || m.type === 'video' || m.type === 'media') {
                const media = m.media && Array.isArray(m.media) ? m.media : (m.mediaUrl ? [{ type: m.type || 'image', url: m.mediaUrl }] : []);
                const placeholders = media.length
                    ? media.map(med => `[${med.type || 'image'}]`).join(' ')
                    : (m.type === 'video' ? '[video]' : '[image]');
                content = (placeholders + (content ? ' ' + content : '')).trim();
            }
            return { role: isUser ? 'user' : 'assistant', content };
        })
        .filter(m => m.content);
}

function buildSystemPrompt(agent, user, knowledgeContext = '') {
    const parts = [];
    parts.push(agent.system_prompt || 'You are a helpful AI assistant.');

    const formality = agent.formality ?? 5;
    const verbosity = agent.verbosity ?? 5;
    if (formality !== 5 || verbosity !== 5) {
        parts.push(`\nCOMMUNICATION STYLE:\n- Formality: ${FORMALITY_LABELS[formality] || 'balanced'}\n- Verbosity: ${VERBOSITY_LABELS[verbosity] || 'balanced'}`);
    }

    const responseFormat = agent.response_format || 'auto';
    if (responseFormat !== 'auto') {
        const formatMap = { plain: 'Respond in plain text only, no formatting.', markdown: 'Format responses using Markdown.', json: 'Respond with valid JSON objects.' };
        if (formatMap[responseFormat]) parts.push(`\nRESPONSE FORMAT: ${formatMap[responseFormat]}`);
    }

    const meta = agent.metadata || {};
    const responseLength = meta.responseLength || 'medium';
    if (responseLength !== 'medium') {
        const lengthMap = { short: 'Keep responses brief (1-3 sentences). Be concise.', long: 'Provide detailed, comprehensive responses when appropriate.' };
        if (lengthMap[responseLength]) parts.push(`\nRESPONSE LENGTH: ${lengthMap[responseLength]}`);
    }
    const creativityFactuality = meta.creativityFactuality ?? 5;
    if (creativityFactuality !== 5) {
        const bias = creativityFactuality < 5 ? 'Prefer factual, accurate information. Stick to known facts.' : 'You may be more creative and exploratory in responses.';
        parts.push(`\nCREATIVITY vs FACTUALITY: ${bias}`);
    }
    const roleplayMode = meta.roleplayMode || 'assistant';
    if (roleplayMode === 'roleplay') {
        parts.push('\nROLEPLAY MODE: Stay in character. Respond as the persona, not as an assistant breaking character.');
    }
    const profanityFilter = meta.profanityFilter || 'allow';
    if (profanityFilter === 'warn') {
        parts.push('\nPROFANITY: Avoid profane or crude language. If the user uses it, acknowledge politely without repeating it.');
    } else if (profanityFilter === 'block') {
        parts.push('\nPROFANITY: Do not use or repeat profane, crude, or offensive language. Politely decline if the user requests such content.');
    }

    const rules = agent.behavior_rules;
    if (rules && typeof rules === 'object') {
        const rulesList = Array.isArray(rules) ? rules : rules.rules || [];
        if (rulesList.length) {
            parts.push('\nBEHAVIOR RULES (in priority order):');
            rulesList.forEach((r, i) => {
                const cond = r.condition || r.when || '';
                const action = r.action || r.then || '';
                if (cond && action) parts.push(`${i + 1}. When: "${cond}" -> ${action}`);
            });
        }
        const allowed = rules.allowedTopics || [];
        const blocked = rules.blockedTopics || [];
        if (allowed.length) parts.push(`\nALLOWED TOPICS: ${allowed.join(', ')}`);
        if (blocked.length) parts.push(`\nBLOCKED TOPICS (politely decline): ${blocked.join(', ')}`);
    }

    const dialogues = agent.sample_dialogues;
    if (Array.isArray(dialogues) && dialogues.length) {
        parts.push('\nEXAMPLE CONVERSATIONS:');
        dialogues.forEach(d => {
            if (d.user && d.assistant) {
                parts.push(`User: ${d.user}\nAssistant: ${d.assistant}`);
            }
        });
    }

    const skillIds = SkillRepository.getAgentSkillIds(agent.id);
    const skillsBlock = SkillLoader.getSkillsForContextBySkillIds(skillIds, agent.id);
    if (skillsBlock) {
        parts.push('\n## Your Skills\nUse these capabilities when relevant:\n\n' + skillsBlock);
    }

    if (knowledgeContext) {
        parts.push('\n## Reference Material\nUse this information to answer questions when relevant:\n\n' + knowledgeContext);
    }

    const hasImageCapability = !!(agent.image_provider && String(agent.image_provider).trim());
    if (hasImageCapability) {
        parts.push(`
IMAGE GENERATION:
- You can create images for the user. When they ask to draw, create, generate, or show a picture (e.g. "draw me X", "create an image of Y", "generate a picture"), first ask for clarification if the request is vague. If already detailed, confirm briefly and proceed.
- To actually generate and send an image, you MUST include this exact tag: [IMAGE:your full image description here]
- CRITICAL: The format must be [IMAGE:description] with a colon. Write the full description inside the brackets. Never use [image] alone. Never use markdown like ![](url). The ONLY way to send an image is [IMAGE:detailed description].
- Example: [IMAGE:A sunset over mountains, photorealistic, golden hour, dramatic clouds]
- The tag is removed from what the user sees. Never mention it.
- If the user says "no" or changes their mind, respond normally without the tag.`);
    }

    parts.push(`
RULES:
- Stay in character. Keep responses conversational.
- Match the energy of the conversation.`);

    return parts.join('\n');
}

function extractKeywords(text, maxKeywords = 6) {
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'because', 'but', 'and', 'or', 'if', 'while', 'about', 'up', 'it', 'its', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'they', 'them', 'this', 'that', 'what', 'which', 'who', 'whom']);
    return text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w)).slice(0, maxKeywords);
}

function buildTextContext(agent, user, conversationId, latestMessage) {
    const contextWindow = agent.context_window || Config.get('ai.historyMessagesLimit', 50);
    const history = buildHistory(conversationId, contextWindow);

    let knowledgeContext = '';
    const KNOWLEDGE_CHAR_CAP = 8000;
    try {
        const keywords = extractKeywords(latestMessage);
        if (keywords.length) {
            const chunks = KnowledgeRepository.searchChunks(agent.id, keywords, 6);
            if (chunks.length) {
                let total = 0;
                const selected = [];
                for (const c of chunks) {
                    const entry = `[${c.document_title}]: ${c.content}`;
                    if (total + entry.length > KNOWLEDGE_CHAR_CAP) break;
                    selected.push(entry);
                    total += entry.length;
                }
                knowledgeContext = selected.join('\n\n');
            }
        }
    } catch {}

    const systemPrompt = buildSystemPrompt(agent, user, knowledgeContext);
    const messages = [...history, { role: 'user', content: latestMessage }];
    return { systemPrompt, messages };
}

function buildImagePrompt(description, agent = {}) {
    const style = agent.image_prompt_style || 'photorealistic, high quality, detailed';
    return `Generate a high-quality image. Style: ${style}. Description: ${description}`;
}

module.exports = { buildTextContext, buildImagePrompt, buildHistory, buildSystemPrompt, extractKeywords };


