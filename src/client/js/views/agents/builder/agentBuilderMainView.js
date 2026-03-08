import { createAgentBuilderProvidersService } from './agentBuilderProvidersService.js';
import { createAgentBuilderState, validateBuilderStep, AGENT_BUILDER_DEFAULTS } from './agentBuilderState.js';
import { renderIdentityStep as renderIdentityStepModule } from './steps/agentBuilderIdentityStep.js';
import { renderPersonalityStep as renderPersonalityStepModule } from './steps/agentBuilderPersonalityStep.js';
import { renderReviewStep as renderReviewStepModule } from './steps/agentBuilderReviewStep.js';
import { renderKnowledgeStep as renderKnowledgeStepModule } from './steps/agentBuilderKnowledgeStep.js';
import { renderModelStep as renderModelStepModule } from './steps/agentBuilderModelStep.js';
import { renderSkillsStep as renderSkillsStepModule } from './steps/agentBuilderSkillsStep.js';
import { renderBehaviorStep as renderBehaviorStepModule } from './steps/agentBuilderBehaviorStep.js';

export function createAgentFormRenderer(deps) {
    const { api, navigate, showToast, showConfirm, getAgentAvatarUrl, escapeHtml, getToken, API_BASE, makeDropZone } = deps;

async function renderAgentForm(container, agentId) {
    let agent = null;
    if (agentId) {
        try {
            const { data } = await api(`/agents/${agentId}`);
            agent = data;
        } catch {
            showToast('Agent not found', 'error');
            navigate('/agents');
            return;
        }
    }

    const state = createAgentBuilderState(agent);
    const providersService = createAgentBuilderProvidersService({ api });
    let _builderCleanup = null;

    function onBeforeUnload(e) { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } }
    window.addEventListener('beforeunload', onBeforeUnload);

    function renderStep() {
        const steps = [
            { id: 'identity', title: 'Identity', desc: 'Name & appearance' },
            { id: 'personality', title: 'Personality', desc: 'Prompt & style' },
            { id: 'skills', title: 'Skills', desc: 'Drag & drop pipeline' },
            { id: 'knowledge', title: 'Knowledge', desc: 'Document context' },
            { id: 'behavior', title: 'Behavior', desc: 'Rules & guardrails' },
            { id: 'model', title: 'Model', desc: 'AI providers' },
            { id: 'review', title: 'Review', desc: 'Test & finish' }
        ];
        container.innerHTML = `
            <div class="container">
                <a href="#" class="btn btn-ghost btn-chevron btn-chevron--back" data-route="/agents"><span class="ui-chevron ui-chevron--left" aria-hidden="true"></span><span>Back to Agents</span></a>
                <h2 class="agent-builder-title">${agent ? 'Edit Agent' : 'Create New Agent'}</h2>
                <p class="text-muted agent-builder-subtitle">Step ${state.step} of ${state.totalSteps} &mdash; ${steps[state.step - 1].desc}${state.tutorialComplete ? ' <a href="#" class="builder-tour-link" id="agent-builder-tour">Take tour again</a>' : ''}</p>
                <div class="agent-builder">
                    <div class="agent-builder__stepper">
                        ${steps.map((s, i) => `
                            <button class="stepper-step ${i + 1 === state.step ? 'stepper-step--active' : ''} ${i + 1 < state.step ? 'stepper-step--completed' : ''}" data-step="${i + 1}" type="button" ${!state.tutorialComplete && i + 1 > state.step ? 'disabled' : ''}>
                                <div class="stepper-step__number">${i + 1 < state.step ? '&#10003;' : i + 1}</div>
                                <div class="stepper-step__info">
                                    <div class="stepper-step__label">${s.title}</div>
                                    <div class="stepper-step__desc">${s.desc}</div>
                                </div>
                                ${i < steps.length - 1 ? '<div class="stepper-step__connector"></div>' : ''}
                            </button>
                        `).join('')}
                    </div>
                    <div class="agent-builder__content card">
                        <div id="agent-step-content"></div>
                        <div class="agent-builder__actions">
                            ${state.step > 1 ? '<button type="button" class="btn btn-ghost" id="agent-back">Back</button>' : '<span></span>'}
                            ${state.step === state.totalSteps ? `
                                ${agent ? '<button type="button" class="btn btn-ghost" id="agent-save-open">Save & Open Chat</button>' : ''}
                                <button type="button" class="btn btn-primary" id="agent-next">${agent ? 'Save Changes' : 'Save & Open Chat'}</button>
                                ${agent ? '<a href="#" class="btn btn-ghost" id="agent-view-stats">View Stats</a>' : ''}
                            ` : '<button type="button" class="btn btn-primary" id="agent-next">Continue</button>'}
                        </div>
                    </div>
                </div>
            </div>
        `;

        container.querySelector('[data-route]').addEventListener('click', (e) => { e.preventDefault(); navigate('/agents'); });
        container.querySelector('#agent-builder-tour')?.addEventListener('click', (e) => {
            e.preventDefault();
            state.tutorialComplete = false;
            renderStep();
        });

        container.querySelectorAll('.stepper-step:not([disabled])').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = parseInt(btn.dataset.step, 10);
                if (target !== state.step) { captureCurrentStep(); state.step = target; renderStep(); }
            });
        });
        if (!container.dataset.tooltipInit) {
            container.dataset.tooltipInit = '1';
            container.addEventListener('click', (e) => {
                if (e.target.closest('.builder-tooltip__trigger')) {
                    e.preventDefault();
                    const tooltip = e.target.closest('.builder-tooltip');
                    if (tooltip) {
                        tooltip.classList.toggle('builder-tooltip--open');
                        container.querySelectorAll('.builder-tooltip').forEach(t => { if (t !== tooltip) t.classList.remove('builder-tooltip--open'); });
                    }
                } else if (!e.target.closest('.builder-tooltip')) {
                    container.querySelectorAll('.builder-tooltip--open').forEach(t => t.classList.remove('builder-tooltip--open'));
                }
            });
        }

        const content = container.querySelector('#agent-step-content');
        const { formData } = state;

        if (state.step === 1) renderIdentityStepModule(content, { formData, getAgentAvatarUrl, escapeHtml, api, getToken, API_BASE, showToast });
        else if (state.step === 2) renderPersonalityStepModule(content, { formData, escapeHtml, markDirty: () => state.markDirty(), promptTemplates: PROMPT_TEMPLATES });
        else if (state.step === 3) renderSkillsStepModule(content, { api, container, escapeHtml, makeDropZone, getSkillIds: () => state.skillIds, setSkillIds: (next) => { state.skillIds = next; } });
        else if (state.step === 4) renderKnowledgeStepModule(content, { agentId, api, showToast, escapeHtml });
        else if (state.step === 5) renderBehaviorStepModule(content, { formData, escapeHtml, showToast, makeDropZone, getBehaviorRules: () => state.behaviorRules, setBehaviorRules: (next) => { state.behaviorRules = next; }, getSampleDialogues: () => state.sampleDialogues, setSampleDialogues: (next) => { state.sampleDialogues = next; }, getAllowedTopics: () => state.allowedTopics, setAllowedTopics: (next) => { state.allowedTopics = next; }, getBlockedTopics: () => state.blockedTopics, setBlockedTopics: (next) => { state.blockedTopics = next; } });
        else if (state.step === 6) renderModelStepModule(content, { formData, fetchProviders: providersService.fetchProviders, configuredModelStatuses: state.configuredModelStatuses, escapeHtml, normalizeModelOptions: providersService.normalizeModelOptions });
        else renderReviewStepModule(content, { formData, agent, skillIds: state.skillIds, behaviorRules: state.behaviorRules, sampleDialogues: state.sampleDialogues, getAgentAvatarUrl, escapeHtml, navigate });

        container.querySelector('#agent-back')?.addEventListener('click', () => {
            captureCurrentStep();
            state.step--;
            renderStep();
        });

        container.querySelector('#agent-next').addEventListener('click', async () => {
            captureCurrentStep();
            const warnings = validateBuilderStep(formData, state.step);
            if (warnings.block) { showToast(warnings.block, 'error'); return; }
            if (warnings.warn) showToast(warnings.warn, 'info');
            if (state.step < state.totalSteps) { state.step++; renderStep(); return; }
            await saveAgent(agent ? false : true);
        });
        container.querySelector('#agent-save-open')?.addEventListener('click', async () => {
            captureCurrentStep();
            const warnings = validateBuilderStep(formData, state.step);
            if (warnings.block) { showToast(warnings.block, 'error'); return; }
            if (warnings.warn) showToast(warnings.warn, 'info');
            await saveAgent(true);
        });
        container.querySelector('#agent-view-stats')?.addEventListener('click', async (e) => {
            e.preventDefault();
            if (state.dirty) {
                const { showConfirm3 } = await import('../../../components/Dialog.js');
                const choice = await showConfirm3({
                    title: 'Unsaved Changes',
                    message: 'You have unsaved changes. Save before viewing stats?',
                    discardText: 'Discard Changes',
                    keepText: 'Keep Editing',
                    saveText: 'Save Changes'
                });
                if (choice === 'save') {
                    await saveAgent(false);
                    navigate(`/agents/${agent.id}/analytics`);
                } else if (choice === 'discard') {
                    cleanupBuilder();
                    navigate(`/agents/${agent.id}/analytics`);
                }
                return;
            }
            navigate(`/agents/${agent.id}/analytics`);
        });

        function handleBuilderKeydown(e) {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
            if (e.key === 'ArrowRight' && state.step < state.totalSteps) {
                captureCurrentStep();
                const w = validateBuilderStep(formData, state.step);
                if (!w.block) { state.step++; renderStep(); }
            } else if (e.key === 'ArrowLeft' && state.step > 1) {
                captureCurrentStep();
                state.step--;
                renderStep();
            }
        }
        document.addEventListener('keydown', handleBuilderKeydown);
        _builderCleanup = () => document.removeEventListener('keydown', handleBuilderKeydown);
    }

    function captureCurrentStep() {
        const { formData } = state;
        if (state.step === 1) {
            formData.name = container.querySelector('#agent-name')?.value || '';
            formData.tagline = container.querySelector('#agent-tagline')?.value || '';
            formData.avatarUrl = container.querySelector('#agent-avatarUrl')?.value || '';
            const tagList = container.querySelector('#agent-tags-list');
            if (tagList) formData.tagNames = [...tagList.querySelectorAll('.tag-chip')].map(c => c.dataset.value).filter(Boolean);
        } else if (state.step === 2) {
            formData.systemPrompt = container.querySelector('#agent-systemPrompt')?.value || '';
            formData.temperature = parseFloat(container.querySelector('#agent-temperature')?.value) || 0.8;
            formData.maxTokens = parseInt(container.querySelector('#agent-maxTokens')?.value, 10) || 512;
            formData.greetingMessage = container.querySelector('#agent-greetingMessage')?.value || '';
            formData.responseFormat = container.querySelector('#agent-responseFormat')?.value || 'auto';
            formData.memoryStrategy = container.querySelector('#agent-memoryStrategy')?.value || 'full';
            formData.formality = parseInt(container.querySelector('#agent-formality')?.value, 10) ?? 5;
            formData.verbosity = parseInt(container.querySelector('#agent-verbosity')?.value, 10) ?? 5;
            formData.responseLength = container.querySelector('#agent-responseLength')?.value || 'medium';
            formData.creativityFactuality = parseInt(container.querySelector('#agent-creativityFactuality')?.value, 10) ?? 5;
            formData.roleplayMode = container.querySelector('#agent-roleplayMode')?.value || 'assistant';
            formData.topP = parseFloat(container.querySelector('#agent-topP')?.value) ?? 0.9;
            formData.topK = parseInt(container.querySelector('#agent-topK')?.value, 10) ?? 40;
            formData.repeatPenalty = parseFloat(container.querySelector('#agent-repeatPenalty')?.value) ?? 1.1;
            formData.presencePenalty = parseFloat(container.querySelector('#agent-presencePenalty')?.value) ?? 0;
            formData.frequencyPenalty = parseFloat(container.querySelector('#agent-frequencyPenalty')?.value) ?? 0;
            formData.contextWindow = parseInt(container.querySelector('#agent-contextWindow')?.value, 10) ?? 50;
            const stopEl = container.querySelector('#stop-sequences-list');
            if (stopEl) {
                formData.stopSequences = [...stopEl.querySelectorAll('.tag-chip')].map(c => c.dataset.value).filter(Boolean);
            }
        } else if (state.step === 5) {
            formData.responseDelayMin = Math.max(0, parseInt(container.querySelector('#agent-responseDelayMin')?.value, 10) || 0);
            formData.responseDelayMax = Math.max(0, parseInt(container.querySelector('#agent-responseDelayMax')?.value, 10) || 0);
            formData.profanityFilter = container.querySelector('#agent-profanityFilter')?.value || 'allow';
        } else if (state.step === 6) {
            const textProviderSelect = container.querySelector('#agent-textProvider');
            const textModelSelect = container.querySelector('#agent-textModel');
            const imageProviderSelect = container.querySelector('#agent-imageProvider');
            const imageModelSelect = container.querySelector('#agent-imageModel');

            formData.textProvider = textProviderSelect?.value || '';
            formData.textModel = textModelSelect?.value || '';
            formData.imageProvider = imageProviderSelect?.value || '';
            formData.imageModel = imageModelSelect?.value || '';

            formData.textProviderDisplay = textProviderSelect?.selectedOptions?.[0]?.dataset?.displayName || formData.textProvider;
            formData.textModelDisplay = textModelSelect?.selectedOptions?.[0]?.dataset?.displayName || formData.textModel;
            formData.imageProviderDisplay = imageProviderSelect?.selectedOptions?.[0]?.dataset?.displayName || formData.imageProvider;
            formData.imageModelDisplay = imageModelSelect?.selectedOptions?.[0]?.dataset?.displayName || formData.imageModel;
        }
    }

    async function saveAgent(openChat = false) {
        const { formData } = state;
        if (formData.textProvider) {
            try {
                const { data: providers } = await api('/ai/providers');
                const provider = (providers || []).find((entry) => entry.name === formData.textProvider);
                const modelEntries = providersService.normalizeModelOptions(provider?.models);
                if (provider && formData.textModel && !modelEntries.some((m) => m.id === formData.textModel)) {
                    const providerLabel = provider.displayName || provider.name || formData.textProvider;
                    showToast(`Model "${formData.textModel}" may not be available for ${providerLabel}. Please select from the list.`, 'warning');
                    state.step = 6;
                    renderStep();
                    return;
                }
            } catch {}
        }

        const body = {
            name: formData.name,
            tagline: formData.tagline,
            avatarUrl: formData.avatarUrl || '',
            systemPrompt: formData.systemPrompt,
            textProvider: formData.textProvider,
            textModel: formData.textModel,
            imageProvider: formData.imageProvider || '',
            imageModel: formData.imageModel || '',
            temperature: formData.temperature,
            maxTokens: formData.maxTokens,
            skillIds: state.skillIds,
            topP: formData.topP,
            topK: formData.topK,
            repeatPenalty: formData.repeatPenalty,
            presencePenalty: formData.presencePenalty,
            frequencyPenalty: formData.frequencyPenalty,
            stopSequences: formData.stopSequences,
            responseFormat: formData.responseFormat,
            greetingMessage: formData.greetingMessage,
            contextWindow: formData.contextWindow,
            memoryStrategy: formData.memoryStrategy,
            formality: formData.formality,
            verbosity: formData.verbosity,
            behaviorRules: { rules: state.behaviorRules, allowedTopics: state.allowedTopics, blockedTopics: state.blockedTopics },
            sampleDialogues: state.sampleDialogues,
            tagNames: formData.tagNames || [],
            hubPublished: formData.hubPublished,
            metadata: {
                responseLength: formData.responseLength,
                creativityFactuality: formData.creativityFactuality,
                roleplayMode: formData.roleplayMode,
                responseDelayMin: formData.responseDelayMin,
                responseDelayMax: formData.responseDelayMax,
                profanityFilter: formData.profanityFilter
            }
        };

        const saveBtn = container.querySelector('#agent-next');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = agent ? 'Saving...' : 'Creating...';
        }

        try {
            if (agent) {
                await api(`/agents/${agent.id}`, { method: 'PUT', body: JSON.stringify(body) });
                state.tutorialComplete = true;
                showToast('Agent updated', 'success');
                navigate(openChat ? `/chat?agent=${agent.id}` : '/agents');
            } else {
                const { data } = await api('/agents', { method: 'POST', body: JSON.stringify(body) });
                state.tutorialComplete = true;
                showToast('Agent created! Opening chat...', 'success');
                navigate(`/chat?agent=${data.id}`);
            }
        } catch (err) {
            showToast(err.message, 'error');
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = agent ? 'Save Changes' : 'Create Agent';
            }
        }
    }

    renderStep();

    const origNavRef = navigate;
    const navOverride = (path) => {
        if (state.dirty && !confirm('You have unsaved changes. Leave anyway?')) return;
        cleanupBuilder();
        origNavRef(path);
    };
    function cleanupBuilder() {
        state.clearDirty();
        window.removeEventListener('beforeunload', onBeforeUnload);
        if (_builderCleanup) _builderCleanup();
    }
    container.querySelectorAll('[data-route="/agents"]').forEach(el => {
        el.removeEventListener('click', el._navHandler);
        el._navHandler = (e) => { e.preventDefault(); navOverride('/agents'); };
        el.addEventListener('click', el._navHandler);
    });
}

    return { renderAgentForm };
}
