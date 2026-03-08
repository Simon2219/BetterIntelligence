/**
 * MainAIManager - Single entry point for all AI operations.
 * Designed for future public API exposure.
 *
 * Callers handle side effects (message storage, socket emission, analytics, hooks).
 * This module handles only AI execution logic and returns structured results.
 */
const Config = require('../../../config/Config');
const ContextBuilder = require('./context/ContextBuilder');
const AIExecution = require('./execution/AIExecution');
const ProviderRegistry = require('./providers/ProviderRegistry');
const { generateThreadSummary } = require('./services/contextSummaryService');

const IMAGE_TAG_REGEX = /\[IMAGE:\s*([^\]]+)\]/gi;
const INVOKE_TIMEOUT = 90000;

function isAIEnabled() {
    return !!(Config.get('ai.enabled', false) || process.env.AI_ENABLED === '1' || process.env.AI_ENABLED === 'true');
}

/**
 * Generate a text response from an AI agent.
 * @returns {{ text: string, aiMetadata: object, status: string }}
 */
async function generateTextResponse({ agent, user, chatId, message, overrides, usageContext }) {
    if (!isAIEnabled()) {
        return { text: null, aiMetadata: null, status: 'ai_disabled' };
    }

    const textProvider = ProviderRegistry.getTextProvider(agent?.text_provider);
    if (!textProvider) {
        return { text: null, aiMetadata: null, status: 'no_provider' };
    }

    const { systemPrompt, messages } = ContextBuilder.buildTextContext(agent, user, chatId, message);

    const result = await Promise.race([
        AIExecution.executeText({
            agent,
            systemPrompt,
            messages,
            overrides,
            usageContext: usageContext || { source: 'api', agentId: agent?.id, chatId }
        }),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('AI generation timed out after 90s')), INVOKE_TIMEOUT)
        )
    ]);

    return { text: result.text, aiMetadata: result.aiMetadata, status: 'ok' };
}

/**
 * Detect an [IMAGE:...] tag and generate an image if the agent supports it.
 * @returns {{ media: Array, aiMetadata: object }|null}
 */
async function generateImageFromTag({ agent, chatId, imageDescription, usageContext }) {
    if (!imageDescription || imageDescription.length < 2) return null;
    if (!agent?.image_provider) return null;

    const imageProvider = ProviderRegistry.getImageProvider(agent.image_provider);
    if (!imageProvider) return null;

    const imagePrompt = ContextBuilder.buildImagePrompt(imageDescription, agent);
    const imgResult = await AIExecution.executeImage({
        agent,
        conversationId: chatId,
        prompt: imagePrompt,
        usageContext: usageContext || { source: 'api-image', agentId: agent?.id, chatId }
    });

    return { media: imgResult.media, aiMetadata: imgResult.aiMetadata || null };
}

/**
 * Full pipeline: text generation + optional image extraction.
 * @returns {{ text: string, media: Array, aiMetadata: object, imageResult: object|null, status: string }}
 */
async function runAgentPipeline({ agent, user, chatId, message, usageContext, overrides }) {
    const textResult = await generateTextResponse({
        agent, user, chatId, message, overrides, usageContext
    });

    if (textResult.status !== 'ok' || !textResult.text) {
        return {
            text: textResult.text,
            media: [],
            aiMetadata: textResult.aiMetadata,
            imageResult: null,
            status: textResult.status
        };
    }

    let displayText = textResult.text;
    const allMedia = [];
    const imageResults = [];

    let match;
    const tagRegex = new RegExp(IMAGE_TAG_REGEX.source, IMAGE_TAG_REGEX.flags);
    while ((match = tagRegex.exec(displayText)) !== null) {
        const desc = match[1]?.trim();
        if (!desc) continue;
        try {
            const imgRes = await generateImageFromTag({
                agent,
                chatId,
                imageDescription: desc,
                usageContext: usageContext
                    ? { ...usageContext, source: `${usageContext.source}-image` }
                    : { source: 'api-image', agentId: agent?.id, chatId }
            });
            if (imgRes?.media?.length) allMedia.push(...imgRes.media);
            if (imgRes) imageResults.push(imgRes);
        } catch {
            // Image generation failure doesn't break the pipeline
        }
    }

    displayText = displayText.replace(IMAGE_TAG_REGEX, '').trim();

    return {
        text: displayText,
        media: allMedia,
        aiMetadata: textResult.aiMetadata,
        imageResult: imageResults[0] || null,
        status: 'ok'
    };
}

module.exports = {
    IMAGE_TAG_REGEX,
    INVOKE_TIMEOUT,
    isAIEnabled,
    generateTextResponse,
    generateImageFromTag,
    runAgentPipeline,
    generateThreadSummary
};
