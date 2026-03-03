/**
 * AIExecution - canonical AI provider execution boundary for text/image generation.
 */
const ProviderRegistry = require('../providers/ProviderRegistry');
const mediaService = require('../../services/mediaService');
const AIUsageTracker = require('../usage/AIUsageTracker');
const { AIModelRepository } = require('../../database');

function assertModelRuntimeAllowed({ providerName, modelId, modelType }) {
    const provider = String(providerName || '').trim().toLowerCase();
    const model = String(modelId || '').trim();
    if (!provider || !model) return;

    const row = AIModelRepository.getByProviderAndModel(provider, model);
    if (!row) return;

    const isActive = (row.is_active ?? 1) === 1;
    const isUserVisible = (row.is_user_visible ?? 1) === 1;
    if (!isActive || !isUserVisible) {
        const unavailableState = !isActive ? 'inactive' : 'hidden';
        const modelKind = modelType === 'image' ? 'image' : 'text';
        throw new Error(`Selected ${modelKind} model is ${unavailableState}`);
    }
}

async function executeText(ctx) {
    const { agent, systemPrompt, messages, usageContext = {}, overrides = {} } = ctx;
    assertModelRuntimeAllowed({
        providerName: agent.text_provider,
        modelId: agent.text_model,
        modelType: 'text'
    });
    const provider = ProviderRegistry.getTextProvider(agent.text_provider);
    if (!provider) throw new Error('No text provider available');

    const genOpts = {
        model: agent.text_model || undefined,
        temperature: agent.temperature,
        maxTokens: agent.max_tokens,
        systemPrompt
    };
    if (agent.top_p !== undefined && agent.top_p !== null) genOpts.topP = agent.top_p;
    if (agent.top_k !== undefined && agent.top_k !== null) genOpts.topK = agent.top_k;
    if (agent.repeat_penalty !== undefined && agent.repeat_penalty !== null) genOpts.repeatPenalty = agent.repeat_penalty;
    if (agent.presence_penalty !== undefined && agent.presence_penalty !== null) genOpts.presencePenalty = agent.presence_penalty;
    if (agent.frequency_penalty !== undefined && agent.frequency_penalty !== null) genOpts.frequencyPenalty = agent.frequency_penalty;
    const stops = agent.stop_sequences;
    if (Array.isArray(stops) && stops.length) genOpts.stop = stops;

    const generationOptions = (overrides && typeof overrides === 'object')
        ? { ...genOpts, ...overrides }
        : genOpts;
    const invokeStart = Date.now();

    let result;
    try {
        result = await provider.generateText(messages, generationOptions);
    } catch (err) {
        AIUsageTracker.recordTextFailure({
            agent,
            startedAt: invokeStart,
            usageContext,
            error: err
        });
        throw err;
    }
    AIUsageTracker.recordTextSuccess({
        agent,
        result,
        startedAt: invokeStart,
        usageContext
    });

    const promptTokens = result.usage?.promptTokens || 0;
    const completionTokens = result.usage?.completionTokens || 0;
    const totalTokens = result.usage?.totalTokens || (promptTokens + completionTokens);

    return {
        text: result.text,
        aiMetadata: {
            provider: result.provider,
            model: result.model,
            promptTokens,
            completionTokens,
            totalTokens
        }
    };
}

async function executeImage(ctx) {
    const { agent, conversationId, prompt, usageContext = {}, overrides = {} } = ctx;
    assertModelRuntimeAllowed({
        providerName: agent.image_provider,
        modelId: agent.image_model,
        modelType: 'image'
    });
    const provider = ProviderRegistry.getImageProvider(agent.image_provider);
    if (!provider) throw new Error('No image provider available');

    const imgWidth = overrides.width || agent.metadata?.imageWidth || 1024;
    const imgHeight = overrides.height || agent.metadata?.imageHeight || 1024;
    const imageOptions = {
        model: agent.image_model || undefined,
        width: imgWidth,
        height: imgHeight,
        ...((overrides && typeof overrides === 'object') ? overrides : {})
    };
    const invokeStart = Date.now();
    let result;
    try {
        result = await provider.generateImage(prompt, imageOptions);

        const saved = mediaService.saveMedia(result.buffer, {
            conversationId: conversationId || 'temp',
            mimeType: result.mimeType
        });

        AIUsageTracker.recordImageSuccess({
            agent,
            result,
            startedAt: invokeStart,
            usageContext
        });

        return {
            media: [{ type: 'image', url: saved.url }],
            aiMetadata: {
                provider: result.provider,
                model: result.model || agent.image_model || undefined
            }
        };
    } catch (err) {
        AIUsageTracker.recordImageFailure({
            agent,
            providerName: result?.provider || provider?.name,
            modelId: result?.model || imageOptions.model,
            startedAt: invokeStart,
            usageContext,
            error: err
        });
        throw err;
    }
}

module.exports = { executeText, executeImage };
