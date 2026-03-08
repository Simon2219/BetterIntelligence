/**
 * ContextSummaryService - AI-powered thread summary generation.
 */
const ProviderRegistry = require('../providers/ProviderRegistry');
const AIExecution = require('../execution/AIExecution');
const MAX_THREAD_SUMMARY_CHARS = 30;

function mediaPlaceholders(message) {
    const media = Array.isArray(message?.media) ? message.media : [];
    if (media.length) {
        const placeholders = media.map((m) => (m?.type === 'video' ? '[video]' : '[image]')).filter(Boolean);
        return placeholders.join(' ');
    }
    if (message?.type === 'image') return '[image]';
    if (message?.type === 'video') return '[video]';
    if (message?.type === 'media') return '[media]';
    if (message?.mediaUrl) return '[media]';
    return '';
}

function toTranscriptLine(message, agentId) {
    const fromAgent = agentId && String(message?.senderId || '').toUpperCase() === String(agentId).toUpperCase();
    const role = fromAgent ? 'Assistant' : 'User';
    const text = String(message?.content || '').trim();
    const media = mediaPlaceholders(message);
    const body = [text, media].filter(Boolean).join(' ').trim();
    if (!body) return '';
    return `${role}: ${body}`;
}

function sanitizeSummary(rawText) {
    const firstLine = String(rawText || '').split('\n')[0].trim();
    if (!firstLine) return '';
    return firstLine
        .replace(/^["'`]+|["'`]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_THREAD_SUMMARY_CHARS);
}

async function generateThreadSummary({ agent, messages }) {
    const transcriptLines = (messages || [])
        .map((m) => toTranscriptLine(m, agent?.id))
        .filter(Boolean)
        .slice(-60);

    if (!transcriptLines.length) return '';

    const provider = ProviderRegistry.getTextProvider(agent?.text_provider);
    if (!provider) return '';

    const systemPrompt = [
        'You summarize chat threads for sidebar previews.',
        'Return exactly one short plain-text line.',
        `Maximum ${MAX_THREAD_SUMMARY_CHARS} characters.`,
        'No emojis. No markdown. No prefixed labels.'
    ].join(' ');

    const userPrompt = [
        'Summarize this message thread into a simple one-liner describing what it is about:',
        '',
        transcriptLines.join('\n')
    ].join('\n');

    const result = await AIExecution.executeText({
        agent,
        systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        overrides: {
            model: agent?.text_model || undefined,
            temperature: 0.2,
            maxTokens: 20
        },
        usageContext: {
            source: 'chat-summary',
            agentId: agent?.id || null,
            metadata: { purpose: 'thread_summary' }
        }
    });

    return sanitizeSummary(result?.text || '');
}

const MIN_MESSAGES_BETWEEN_SUMMARIES = 50;
const SHORT_THREAD_DYNAMIC_LIMIT = 5;

function shouldRegenerateSummary({ chat, currentMessageCount, force = false }) {
    const existingSummary = String(chat?.thread_summary || '').trim();
    const summaryMessageCount = parseInt(chat?.thread_summary_message_count, 10) || 0;

    if (force) return true;
    if (!existingSummary) return true;

    const shortThreadNeedsRefresh = currentMessageCount > 0
        && currentMessageCount <= SHORT_THREAD_DYNAMIC_LIMIT
        && summaryMessageCount < currentMessageCount;
    if (shortThreadNeedsRefresh) return true;

    if ((currentMessageCount - summaryMessageCount) >= MIN_MESSAGES_BETWEEN_SUMMARIES) return true;

    return false;
}

module.exports = {
    generateThreadSummary,
    sanitizeSummary,
    shouldRegenerateSummary,
    MAX_THREAD_SUMMARY_CHARS,
    MIN_MESSAGES_BETWEEN_SUMMARIES,
    SHORT_THREAD_DYNAMIC_LIMIT
};
