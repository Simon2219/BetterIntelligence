export function createOnboardingView(deps) {
    const { api, showToast, navigate, escapeHtml } = deps;

async function renderOnboarding(container) {
    let step = 1;
    let agentName = '', agentPrompt = '';
    const next = async () => {
        if (step === 1) {
            agentName = container.querySelector('#onboard-name')?.value?.trim() || 'My Agent';
            step = 2;
        } else if (step === 2) {
            agentPrompt = container.querySelector('#onboard-prompt')?.value?.trim() || 'You are a helpful assistant.';
            step = 3;
        } else if (step === 3) {
            try {
                const { data } = await api('/agents', { method: 'POST', body: JSON.stringify({ name: agentName, systemPrompt: agentPrompt }) });
                showToast('Agent created!', 'success');
                navigate(`/chat?agent=${data.id}`);
                return;
            } catch (err) { showToast(err.message, 'error'); return; }
        }
        renderOnboardingStep(container, step, agentName, agentPrompt, next);
    };
    renderOnboardingStep(container, step, agentName, agentPrompt, next);
}

function renderOnboardingStep(container, step, agentName, agentPrompt, onNext) {
    const steps = [
        { title: 'Name your first agent', body: `<div class="form-group"><label class="form-label">Agent name</label><input type="text" id="onboard-name" class="form-input" value="${escapeHtml(agentName || '')}" placeholder="My Assistant"></div>` },
        { title: 'Add a short prompt', body: `<div class="form-group"><label class="form-label">System prompt</label><textarea id="onboard-prompt" class="form-input" rows="4" placeholder="You are a helpful assistant...">${escapeHtml(agentPrompt || '')}</textarea></div>` },
        { title: 'You\'re all set!', body: '<p class="text-muted">Create your agent and start chatting.</p>' }
    ];
    const s = steps[step - 1];
    container.innerHTML = `
        <div class="container">
            <div class="auth-container onboarding-card">
                <h2 class="auth-title">Getting started</h2>
                <p class="auth-subtitle">Step ${step} of 3</p>
                <div class="mt-2">
                    <h4 class="onboarding-step-title">${s.title}</h4>
                    ${s.body}
                    <div class="onboarding-actions">
                        <button type="button" class="btn btn-primary" id="onboard-next">${step === 3 ? 'Create & Chat' : 'Next'}</button>
                        ${step > 1 ? '<a href="#" class="btn btn-ghost" data-route="/agents">Skip</a>' : ''}
                    </div>
                </div>
            </div>
        </div>
    `;
    container.querySelector('#onboard-next').addEventListener('click', onNext);
    container.querySelector('[data-route]')?.addEventListener('click', (e) => { e.preventDefault(); navigate('/agents'); });
}

// ─── Init ────────────────────────────────────────────────────────────────────

    return { renderOnboarding, renderOnboardingStep };
}
