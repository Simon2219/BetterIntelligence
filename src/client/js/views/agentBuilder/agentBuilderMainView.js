import { createAgentBuilderProvidersService } from './agentBuilderProvidersService.js';
import { createAgentBuilderState, validateBuilderStep } from './agentBuilderState.js';
import { renderIdentityStep as renderIdentityStepModule } from './steps/agentBuilderIdentityStep.js';
import { renderPersonalityStep as renderPersonalityStepModule } from './steps/agentBuilderPersonalityStep.js';
import { renderReviewStep as renderReviewStepModule } from './steps/agentBuilderReviewStep.js';
import { renderKnowledgeStep as renderKnowledgeStepModule } from './steps/agentBuilderKnowledgeStep.js';
import { renderModelStep as renderModelStepModule } from './steps/agentBuilderModelStep.js';
import { renderSkillsStep as renderSkillsStepModule } from './steps/agentBuilderSkillsStep.js';
import { renderBehaviorStep as renderBehaviorStepModule } from './steps/agentBuilderBehaviorStep.js';

export function createAgentBuilderView(deps) {
    const { api, navigate, showToast, getAgentAvatarUrl, escapeHtml, getToken, API_BASE, makeDropZone } = deps;

async function renderAgentBuilderForm(container, editId) {
    let agentId = editId;
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
    let catalogListing = null;
    let catalogBusy = false;
    let _builderCleanup = null;

    function onBeforeUnload(e) { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } }
    window.addEventListener('beforeunload', onBeforeUnload);

    function buildCatalogSearchRoute(tab) {
        const params = new URLSearchParams({ tab });
        if (catalogListing?.title || state.formData?.name) params.set('q', catalogListing?.title || state.formData?.name || '');
        return `/agents?${params.toString()}`;
    }

    function buildListingPayload() {
        return {
            assetId: agent?.id,
            title: state.formData.name || agent?.name || 'Untitled Agent',
            summary: state.formData.tagline || agent?.tagline || '',
            description: state.formData.tagline || agent?.tagline || '',
            visibility: 'public'
        };
    }

    function normalizeCatalogComparableAgent(source) {
        if (!source) return null;
        const skillIds = Array.isArray(source.skillIds) ? [...source.skillIds].map(String).sort() : [];
        const tags = Array.isArray(source.tags)
            ? [...source.tags].map((tag) => String(tag?.name || tag || '').trim()).filter(Boolean).sort()
            : [];
        return {
            name: source.name || '',
            tagline: source.tagline || '',
            avatar_url: source.avatar_url || source.avatarUrl || '',
            system_prompt: source.system_prompt || '',
            text_provider: source.text_provider || '',
            text_model: source.text_model || '',
            image_provider: source.image_provider || '',
            image_model: source.image_model || '',
            temperature: source.temperature ?? 0.8,
            max_tokens: source.max_tokens ?? 512,
            top_p: source.top_p ?? 0.9,
            top_k: source.top_k ?? 40,
            repeat_penalty: source.repeat_penalty ?? 1.1,
            presence_penalty: source.presence_penalty ?? 0,
            frequency_penalty: source.frequency_penalty ?? 0,
            stop_sequences: Array.isArray(source.stop_sequences) ? [...source.stop_sequences] : [],
            response_format: source.response_format || 'auto',
            greeting_message: source.greeting_message || '',
            context_window: source.context_window ?? 50,
            memory_strategy: source.memory_strategy || 'full',
            formality: source.formality ?? 5,
            verbosity: source.verbosity ?? 5,
            behavior_rules: source.behavior_rules || {},
            sample_dialogues: Array.isArray(source.sample_dialogues) ? source.sample_dialogues : [],
            metadata: source.metadata || {},
            skillIds,
            tags
        };
    }

    function listingHasDrift(listing, currentAgent) {
        if (!listing?.currentRevision?.snapshot || !currentAgent) return false;
        const current = normalizeCatalogComparableAgent(currentAgent);
        const revision = normalizeCatalogComparableAgent(listing.currentRevision.snapshot);
        return JSON.stringify(current) !== JSON.stringify(revision);
    }

    async function loadCatalogListing() {
        if (!agent?.id) {
            catalogListing = null;
            return null;
        }
        const { data } = await api('/catalog/agents');
        const listing = (data || []).find((item) => String(item.asset_id) === String(agent.id)) || null;
        catalogListing = listing ? {
            ...listing,
            driftDetected: listingHasDrift(listing, agent)
        } : null;
        return catalogListing;
    }

    async function persistAgent({ openChat = false, navigateAfter = true, successMessage = null } = {}) {
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
                    return null;
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
        const previousLabel = saveBtn?.textContent || '';
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = agent ? 'Saving...' : 'Creating...';
        }

        try {
            if (agent) {
                const { data } = await api(`/agents/${agent.id}`, { method: 'PUT', body: JSON.stringify(body) });
                agent = data;
                state.clearDirty();
                await loadCatalogListing().catch(() => null);
                state.tutorialComplete = true;
                if (successMessage) showToast(successMessage, 'success');
                else if (navigateAfter || openChat) showToast('Agent updated', 'success');
                if (navigateAfter) {
                    navigate(openChat ? `/chat?agent=${agent.id}` : '/agents');
                } else {
                    renderStep();
                }
                return agent;
            }

            const { data } = await api('/agents', { method: 'POST', body: JSON.stringify(body) });
            agent = data;
            agentId = agent.id;
            history.replaceState(null, '', '/agentBuilder/' + agent.id);
            state.clearDirty();
            state.tutorialComplete = true;
            if (successMessage) showToast(successMessage, 'success');
            else showToast('Agent created! Opening chat...', 'success');
            if (navigateAfter || openChat) {
                navigate(`/chat?agent=${data.id}`);
            } else {
                await loadCatalogListing().catch(() => null);
                renderStep();
            }
            return agent;
        } catch (err) {
            showToast(err.message, 'error');
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = previousLabel || (agent ? 'Save Changes' : 'Create Agent');
            }
            return null;
        }
    }

    async function ensureSavedAgentForCatalogAction() {
        if (!agent?.id) {
            showToast('Save the agent before creating a listing.', 'info');
            return null;
        }
        if (!state.dirty) return agent;
        captureCurrentStep();
        const warnings = validateBuilderStep(state.formData, state.step);
        if (warnings.block) {
            showToast(warnings.block, 'error');
            return null;
        }
        if (warnings.warn) showToast(warnings.warn, 'info');
        return persistAgent({ navigateAfter: false, successMessage: 'Agent saved' });
    }

    async function handleCreateListing() {
        if (catalogBusy) return;
        const savedAgent = await ensureSavedAgentForCatalogAction();
        if (!savedAgent) return;
        let completed = false;
        catalogBusy = true;
        renderStep();
        try {
            if (!catalogListing) {
                await api('/catalog/agents', {
                    method: 'POST',
                    body: JSON.stringify(buildListingPayload())
                });
            }
            await loadCatalogListing();
            showToast('Listing created', 'success');
            completed = true;
            renderStep();
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            catalogBusy = false;
            if (!completed) renderStep();
        }
    }

    async function handleUpdateListing() {
        if (catalogBusy || !catalogListing?.id) return;
        const savedAgent = await ensureSavedAgentForCatalogAction();
        if (!savedAgent) return;
        let completed = false;
        catalogBusy = true;
        renderStep();
        try {
            await api(`/catalog/agents/${encodeURIComponent(catalogListing.id)}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    title: state.formData.name || agent?.name || catalogListing.title,
                    summary: state.formData.tagline || agent?.tagline || '',
                    description: state.formData.tagline || agent?.tagline || '',
                    visibility: 'public'
                })
            });
            await api(`/catalog/agents/${encodeURIComponent(catalogListing.id)}/revisions`, {
                method: 'POST',
                body: JSON.stringify({
                    title: state.formData.name || agent?.name || catalogListing.title,
                    summary: state.formData.tagline || agent?.tagline || '',
                    description: state.formData.tagline || agent?.tagline || ''
                })
            });
            await loadCatalogListing();
            showToast('Listing draft updated', 'success');
            completed = true;
            renderStep();
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            catalogBusy = false;
            if (!completed) renderStep();
        }
    }

    async function handleSubmitListing() {
        if (catalogBusy) return;
        if (!catalogListing?.id) {
            await handleCreateListing();
            if (!catalogListing?.id) return;
        }
        if (catalogListing?.driftDetected || state.dirty) {
            await handleUpdateListing();
            if (catalogListing?.driftDetected || state.dirty) return;
        }
        let completed = false;
        catalogBusy = true;
        renderStep();
        try {
            await api(`/catalog/agents/${encodeURIComponent(catalogListing.id)}/submit`, {
                method: 'POST',
                body: JSON.stringify({
                    revisionId: catalogListing.currentRevision?.id || null
                })
            });
            await loadCatalogListing();
            showToast('Listing submitted for review', 'success');
            completed = true;
            renderStep();
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            catalogBusy = false;
            if (!completed) renderStep();
        }
    }

    let _stepCleanup = null;

    async function renderStep() {
        if (_stepCleanup) { _stepCleanup(); _stepCleanup = null; }
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

        container.querySelector('[data-route="/agents"]')?.addEventListener('click', (e) => {
            e.preventDefault();
            if (state.dirty && !confirm('You have unsaved changes. Leave anyway?')) return;
            cleanupBuilder();
            navigate('/agents');
        });
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

        if (state.step === 1) {
            const cleanup = renderIdentityStepModule(content, { formData, getAgentAvatarUrl, escapeHtml, api, getToken, API_BASE, showToast });
            if (typeof cleanup === 'function') _stepCleanup = cleanup;
        }
        else if (state.step === 2) renderPersonalityStepModule(content, { formData, escapeHtml, markDirty: () => state.markDirty() });
        else if (state.step === 3) renderSkillsStepModule(content, { api, container, escapeHtml, makeDropZone, getSkillIds: () => state.skillIds, setSkillIds: (next) => { state.skillIds = next; } });
        else if (state.step === 4) renderKnowledgeStepModule(content, { agentId, api, showToast, escapeHtml });
        else if (state.step === 5) renderBehaviorStepModule(content, { formData, escapeHtml, showToast, makeDropZone, getBehaviorRules: () => state.behaviorRules, setBehaviorRules: (next) => { state.behaviorRules = next; }, getSampleDialogues: () => state.sampleDialogues, setSampleDialogues: (next) => { state.sampleDialogues = next; }, getAllowedTopics: () => state.allowedTopics, setAllowedTopics: (next) => { state.allowedTopics = next; }, getBlockedTopics: () => state.blockedTopics, setBlockedTopics: (next) => { state.blockedTopics = next; } });
        else if (state.step === 6) await renderModelStepModule(content, { formData, fetchProviders: providersService.fetchProviders, configuredModelStatuses: state.configuredModelStatuses, escapeHtml, normalizeModelOptions: providersService.normalizeModelOptions });
        else renderReviewStepModule(content, {
            formData,
            agent,
            skillIds: state.skillIds,
            behaviorRules: state.behaviorRules,
            sampleDialogues: state.sampleDialogues,
            getAgentAvatarUrl,
            escapeHtml,
            navigate,
            catalogListing,
            catalogBusy,
            hasUnsavedChanges: state.dirty,
            listingsRoute: buildCatalogSearchRoute('listings'),
            reviewsRoute: buildCatalogSearchRoute('reviews'),
            onCreateListing: handleCreateListing,
            onUpdateListing: handleUpdateListing,
            onSubmitListing: handleSubmitListing
        });

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
            await persistAgent({ navigateAfter: true, openChat: !agent });
        });
        container.querySelector('#agent-save-open')?.addEventListener('click', async () => {
            captureCurrentStep();
            const warnings = validateBuilderStep(formData, state.step);
            if (warnings.block) { showToast(warnings.block, 'error'); return; }
            if (warnings.warn) showToast(warnings.warn, 'info');
            await persistAgent({ navigateAfter: true, openChat: true });
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
                    await persistAgent({ navigateAfter: false, openChat: false, successMessage: 'Agent saved' });
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
        const prev = _builderCleanup;
        _builderCleanup = () => { prev?.(); document.removeEventListener('keydown', handleBuilderKeydown); };
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

    await loadCatalogListing().catch(() => null);
    renderStep();

    function cleanupBuilder() {
        state.clearDirty();
        if (_stepCleanup) { _stepCleanup(); _stepCleanup = null; }
        window.removeEventListener('beforeunload', onBeforeUnload);
        if (_builderCleanup) _builderCleanup();
    }
}

    async function renderAgentBuilder(container, path) {
        const pathOnly = String(path || '/agentBuilder').split('?')[0];
        const parts = pathOnly.split('/').filter(Boolean);
        const editId = parts[1] || null;
        await renderAgentBuilderForm(container, editId);
    }

    return { renderAgentBuilder };
}
