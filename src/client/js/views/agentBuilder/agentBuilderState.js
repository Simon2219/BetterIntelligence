export const AGENT_BUILDER_DEFAULTS = {
    temperature: 0.8,
    maxTokens: 512,
    topP: 0.9,
    topK: 40,
    repeatPenalty: 1.1,
    presencePenalty: 0,
    frequencyPenalty: 0,
    contextWindow: 50,
    formality: 5,
    verbosity: 5
};

export function validateBuilderStep(formData, step) {
    if (step === 1 && !String(formData?.name || '').trim()) {
        return { block: 'Agent name is required' };
    }
    if (step === 2 && !String(formData?.systemPrompt || '').trim()) {
        return { warn: 'No system prompt set. Your agent may give generic responses.' };
    }
    if (step === 6 && !String(formData?.textProvider || '').trim()) {
        return { warn: 'No text provider selected. The agent will not generate responses.' };
    }
    return {};
}

export function createAgentBuilderState(agent) {
    let step = 1;
    const totalSteps = 7;

    let skillIds = [...(agent?.skillIds || [])];
    let behaviorRules = Array.isArray(agent?.behavior_rules?.rules)
        ? [...agent.behavior_rules.rules]
        : (Array.isArray(agent?.behavior_rules) ? [...agent.behavior_rules] : []);
    let allowedTopics = agent?.behavior_rules?.allowedTopics || [];
    let blockedTopics = agent?.behavior_rules?.blockedTopics || [];
    let sampleDialogues = Array.isArray(agent?.sample_dialogues) ? [...agent.sample_dialogues] : [];
    let configuredModelStatuses = Array.isArray(agent?.modelStatuses) ? agent.modelStatuses : [];

    let formData = {
        name: agent?.name || '',
        tagline: agent?.tagline || '',
        tagNames: (agent?.tags || []).map(t => t.name || t),
        avatarUrl: agent?.avatar_url || agent?.avatarUrl || '',
        systemPrompt: agent?.system_prompt || '',
        textProvider: agent?.text_provider || 'ollama',
        textProviderDisplay: agent?.text_provider_display || agent?.textProviderDisplayName || agent?.text_provider || 'ollama',
        textModel: agent?.text_model || '',
        textModelDisplay: agent?.text_model_display || agent?.textModelDisplayName || agent?.text_model || '',
        imageProvider: agent?.image_provider || '',
        imageProviderDisplay: agent?.image_provider_display || agent?.imageProviderDisplayName || agent?.image_provider || '',
        imageModel: agent?.image_model || '',
        imageModelDisplay: agent?.image_model_display || agent?.imageModelDisplayName || agent?.image_model || '',
        temperature: agent?.temperature ?? AGENT_BUILDER_DEFAULTS.temperature,
        maxTokens: agent?.max_tokens || AGENT_BUILDER_DEFAULTS.maxTokens,
        topP: agent?.top_p ?? AGENT_BUILDER_DEFAULTS.topP,
        topK: agent?.top_k ?? AGENT_BUILDER_DEFAULTS.topK,
        repeatPenalty: agent?.repeat_penalty ?? AGENT_BUILDER_DEFAULTS.repeatPenalty,
        presencePenalty: agent?.presence_penalty ?? AGENT_BUILDER_DEFAULTS.presencePenalty,
        frequencyPenalty: agent?.frequency_penalty ?? AGENT_BUILDER_DEFAULTS.frequencyPenalty,
        stopSequences: agent?.stop_sequences || [],
        responseFormat: agent?.response_format || 'auto',
        greetingMessage: agent?.greeting_message || '',
        contextWindow: agent?.context_window ?? AGENT_BUILDER_DEFAULTS.contextWindow,
        memoryStrategy: agent?.memory_strategy || 'full',
        formality: agent?.formality ?? AGENT_BUILDER_DEFAULTS.formality,
        verbosity: agent?.verbosity ?? AGENT_BUILDER_DEFAULTS.verbosity,
        responseLength: agent?.metadata?.responseLength || 'medium',
        creativityFactuality: agent?.metadata?.creativityFactuality ?? 5,
        roleplayMode: agent?.metadata?.roleplayMode || 'assistant',
        responseDelayMin: agent?.metadata?.responseDelayMin ?? 0,
        responseDelayMax: agent?.metadata?.responseDelayMax ?? 0,
        profanityFilter: agent?.metadata?.profanityFilter || 'allow'
    };

    let dirty = false;
    let tutorialComplete = sessionStorage.getItem('agentBuilderTutorialComplete') === 'true';

    return {
        get step() { return step; },
        set step(v) { step = v; },
        get totalSteps() { return totalSteps; },
        get formData() { return formData; },
        set formData(v) { formData = v; },
        get skillIds() { return skillIds; },
        set skillIds(v) { skillIds = v; },
        get behaviorRules() { return behaviorRules; },
        set behaviorRules(v) { behaviorRules = v; },
        get allowedTopics() { return allowedTopics; },
        set allowedTopics(v) { allowedTopics = v; },
        get blockedTopics() { return blockedTopics; },
        set blockedTopics(v) { blockedTopics = v; },
        get sampleDialogues() { return sampleDialogues; },
        set sampleDialogues(v) { sampleDialogues = v; },
        get configuredModelStatuses() { return configuredModelStatuses; },
        set configuredModelStatuses(v) { configuredModelStatuses = Array.isArray(v) ? v : []; },
        get dirty() { return dirty; },
        markDirty() { dirty = true; },
        clearDirty() { dirty = false; },
        get tutorialComplete() { return tutorialComplete; },
        set tutorialComplete(v) {
            tutorialComplete = v;
            if (v) sessionStorage.setItem('agentBuilderTutorialComplete', 'true');
            else sessionStorage.removeItem('agentBuilderTutorialComplete');
        },
        defaults: AGENT_BUILDER_DEFAULTS
    };
}
