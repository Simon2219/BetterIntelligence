export function createRouterController({
    state,
    triggerChatSummaryOnClose,
    clearChatSocketListeners,
    renderNav,
    createChatForAgent,
    viewRenderers
} = {}) {
    const {
        renderLandingView,
        renderAuth,
        renderAcc,
        renderAgentBuilder,
        renderChatHub,
        renderChatView,
        renderAnalytics,
        renderSkills,
        renderSkillForm,
        renderHub,
        renderDeploy,
        renderAdmin,
        renderSettings,
        renderOnboarding
    } = viewRenderers || {};

    function navigate(path, opts = {}) {
        const fromPath = state.getLastRenderedPath() || (location.pathname + location.search);
        triggerChatSummaryOnClose?.(fromPath, path);
        if (state.getCurrentView() === 'chat' && state.getActiveSocket()) {
            clearChatSocketListeners?.(state.getActiveSocket());
        }
        if (opts.replace) history.replaceState({}, '', path);
        else history.pushState({}, '', path);
        render(path);
    }

    async function render(path) {
        const app = document.getElementById('app');
        const main = app.querySelector('.main') || (() => {
            const node = document.createElement('main');
            node.className = 'main';
            app.appendChild(node);
            return node;
        })();
        main.classList.remove('main--chat');

        if (path === '/' || path === '') {
            state.setCurrentView('landing');
            renderLandingView({
                main,
                isAuthenticated: !!state.getCurrentUser(),
                navigate: (nextPath) => navigate(nextPath)
            });
        } else if (path === '/login' || path === '/signup') {
            state.setCurrentView('auth');
            renderAuth(main, path === '/signup');
        } else if (path.match(/^\/agents\/[^/]+\/analytics/)) {
            if (!state.getCurrentUser()) {
                navigate('/login');
                return;
            }
            state.setCurrentView('analytics');
            const agentId = path.split('/')[2];
            await renderAnalytics(main, agentId);
        } else if (path.match(/^\/agents\/[^/]+\/chat/)) {
            if (!state.getCurrentUser()) {
                navigate('/login');
                return;
            }
            const agentId = path.split('/')[2];
            try { await createChatForAgent(agentId); } catch {}
            return;
        } else if (path === '/chat' || path.startsWith('/chat/') || path.startsWith('/chat?')) {
            if (!state.getCurrentUser()) {
                navigate('/login');
                return;
            }
            state.setCurrentView('chat');
            main.classList.add('main--chat');
            const pathname = path.split('?')[0];
            const directNewMatch = pathname.match(/^\/chat\/new\/([^/]+)$/);
            if (pathname === '/chat/new') {
                navigate('/chat', { replace: true });
                return;
            }
            if (directNewMatch?.[1]) {
                const routeAgentId = decodeURIComponent(directNewMatch[1]);
                try { await createChatForAgent(routeAgentId, { replace: true }); } catch {}
                return;
            }
            const params = new URLSearchParams(path.includes('?') ? path.split('?')[1] : (location.search || ''));
            const agentParam = params.get('agent');
            if (agentParam) {
                try { await createChatForAgent(agentParam, { replace: true }); } catch {}
                return;
            }
            const pathParts = pathname.split('/').filter(Boolean);
            const chatId = pathParts[0] === 'chat' && pathParts[1] ? pathParts[1] : null;
            await renderChatHub(main, chatId);
        } else if (path === '/agentBuilder' || path.startsWith('/agentBuilder/') || path.startsWith('/agentBuilder?')) {
            if (!state.getCurrentUser()) {
                navigate('/login');
                return;
            }
            state.setCurrentView('agentBuilder');
            await renderAgentBuilder(main, path);
        } else if (path === '/agents' || path.startsWith('/agents?')) {
            if (!state.getCurrentUser()) {
                navigate('/login');
                return;
            }
            state.setCurrentView('agents');
            await renderAcc(main, path);
        } else if (path === '/skills' || path.startsWith('/skills')) {
            if (!state.getCurrentUser()) {
                navigate('/login');
                return;
            }
            await renderSkills(main, path);
        } else if (path === '/hub' || path.startsWith('/hub/')) {
            if (!state.getCurrentUser()) {
                navigate('/login');
                return;
            }
            await renderHub(main, path);
        } else if (path === '/settings') {
            if (!state.getCurrentUser()) {
                navigate('/login');
                return;
            }
            await renderSettings(main);
        } else if (path === '/admin') {
            if (!state.getCurrentUser()) {
                navigate('/login');
                return;
            }
            const role = state.getCurrentUser().role;
            if (!(role?.is_admin || role?.can_access_admin)) {
                navigate('/agents');
                return;
            }
            await renderAdmin(main);
        } else if (path === '/onboarding') {
            if (!state.getCurrentUser()) {
                navigate('/login');
                return;
            }
            await renderOnboarding(main);
        } else if (path === '/deploy' || path.startsWith('/deploy')) {
            if (!state.getCurrentUser()) {
                navigate('/login');
                return;
            }
            await renderDeploy(main, path);
        } else {
            main.innerHTML = '<div class="container"><p class="text-muted">Not found</p></div>';
        }

        renderNav?.();
        state.setLastRenderedPath(path);
    }

    return {
        navigate,
        render
    };
}
