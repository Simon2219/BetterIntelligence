export function createOnboardingView(deps) {
    const {
        api,
        showToast,
        navigate,
        escapeHtml,
        getCurrentUser,
        setCurrentUser,
        getAuthenticatedDefaultRoute
    } = deps;

    async function persistOnboardingCompleted() {
        const currentUser = getCurrentUser?.();
        if (!currentUser) return currentUser;

        const settings = currentUser.settings && typeof currentUser.settings === 'object'
            ? currentUser.settings
            : {};

        if (settings.onboardingCompleted === true) return currentUser;

        const { data } = await api('/users/me', {
            method: 'PUT',
            body: JSON.stringify({
                settings: {
                    ...settings,
                    onboardingCompleted: true
                }
            })
        });

        if (data && typeof setCurrentUser === 'function') {
            const updatedUser = {
                ...currentUser,
                ...data
            };
            setCurrentUser(updatedUser);
            return updatedUser;
        }

        return currentUser;
    }

    function renderOnboardingStep(container, step, agentName, agentPrompt, onNext, onSkip) {
        const steps = [
            {
                title: 'Name your first agent',
                body: `
                    <div class="form-group">
                        <label class="form-label">Agent name</label>
                        <input type="text" id="onboard-name" class="form-input" value="${escapeHtml(agentName || '')}" placeholder="My Assistant">
                    </div>
                `
            },
            {
                title: 'Add a short prompt',
                body: `
                    <div class="form-group">
                        <label class="form-label">System prompt</label>
                        <textarea id="onboard-prompt" class="form-input" rows="4" placeholder="You are a helpful assistant...">${escapeHtml(agentPrompt || '')}</textarea>
                    </div>
                `
            },
            {
                title: 'You\'re all set!',
                body: '<p class="text-muted">Create your agent and start chatting.</p>'
            }
        ];

        const currentStep = steps[step - 1];
        container.innerHTML = `
            <div class="container">
                <div class="auth-container onboarding-card">
                    <h2 class="auth-title">Getting started</h2>
                    <p class="auth-subtitle">Step ${step} of 3</p>
                    <div class="mt-2">
                        <h4 class="onboarding-step-title">${currentStep.title}</h4>
                        ${currentStep.body}
                        <div class="onboarding-actions">
                            <button type="button" class="btn btn-primary" id="onboard-next">${step === 3 ? 'Create & Chat' : 'Next'}</button>
                            ${step > 1 ? '<a href="#" class="btn btn-ghost" data-route="/agents">Skip</a>' : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;

        container.querySelector('#onboard-next').addEventListener('click', onNext);
        container.querySelector('[data-route]')?.addEventListener('click', async (event) => {
            event.preventDefault();
            await onSkip?.();
        });
    }

    async function renderOnboarding(container) {
        let step = 1;
        let agentName = '';
        let agentPrompt = '';

        const skip = async () => {
            try {
                const updatedUser = await persistOnboardingCompleted();
                navigate(getAuthenticatedDefaultRoute?.(updatedUser) || '/agents', { replace: true });
            } catch (err) {
                showToast(err.message || 'Unable to save onboarding state', 'error');
            }
        };

        const next = async () => {
            if (step === 1) {
                agentName = container.querySelector('#onboard-name')?.value?.trim() || 'My Agent';
                step = 2;
            } else if (step === 2) {
                agentPrompt = container.querySelector('#onboard-prompt')?.value?.trim() || 'You are a helpful assistant.';
                step = 3;
            } else if (step === 3) {
                try {
                    const { data } = await api('/agents', {
                        method: 'POST',
                        body: JSON.stringify({
                            name: agentName,
                            systemPrompt: agentPrompt
                        })
                    });
                    try {
                        await persistOnboardingCompleted();
                    } catch (persistError) {
                        showToast(persistError.message || 'Agent created, but onboarding state could not be saved.', 'error');
                    }
                    showToast('Agent created!', 'success');
                    navigate(`/chat?agent=${data.id}`, { replace: true });
                    return;
                } catch (err) {
                    showToast(err.message, 'error');
                    return;
                }
            }

            renderOnboardingStep(container, step, agentName, agentPrompt, next, skip);
        };

        renderOnboardingStep(container, step, agentName, agentPrompt, next, skip);
    }

    return {
        renderOnboarding,
        renderOnboardingStep
    };
}
