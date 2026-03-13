export function createRouterController({
    state,
    triggerChatSummaryOnClose,
    clearChatSocketListeners,
    renderNav,
    createChatForAgent,
    getAuthenticatedDefaultRoute,
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

        const url = new URL(path || '/', location.origin);
        const pathname = url.pathname || '/';
        const fullPath = `${pathname}${url.search}`;

        const currentUser = state.getCurrentUser();
        const authenticatedDefaultRoute = typeof getAuthenticatedDefaultRoute === 'function'
            ? getAuthenticatedDefaultRoute(currentUser)
            : '/agents';

        if (currentUser && (pathname === '/' || pathname === '/login' || pathname === '/signup')) {
            navigate(authenticatedDefaultRoute, { replace: true });
            return;
        }

        if (currentUser && pathname === '/onboarding' && authenticatedDefaultRoute !== '/onboarding') {
            navigate(authenticatedDefaultRoute, { replace: true });
            return;
        }

        if (pathname === '/') {
            state.setCurrentView('landing');
            renderLandingView({
                main,
                isAuthenticated: !!state.getCurrentUser(),
                navigate: (nextPath) => navigate(nextPath)
            });
        } else if (pathname === '/login' || pathname === '/signup') {
            state.setCurrentView('auth');
            renderAuth(main, pathname === '/signup');
        } else if (pathname.match(/^\/agents\/[^/]+\/analytics/)) {
            if (!state.getCurrentUser()) {
                navigate('/login');
                return;
            }
            state.setCurrentView('analytics');
            const agentId = pathname.split('/')[2];
            await renderAnalytics(main, agentId);
        } else if (pathname.match(/^\/agents\/[^/]+\/chat/)) {
            if (!state.getCurrentUser()) {
                navigate('/login');
                return;
            }
            const agentId = pathname.split('/')[2];
            try { await createChatForAgent(agentId); } catch {}
            return;
        } else if (pathname === '/chat' || pathname.startsWith('/chat/')) {
            if (!state.getCurrentUser()) {
                navigate('/login');
                return;
            }
            state.setCurrentView('chat');
            main.classList.add('main--chat');
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
            const params = new URLSearchParams(url.search || '');
            const agentParam = params.get('agent');
            if (agentParam) {
                try { await createChatForAgent(agentParam, { replace: true }); } catch {}
                return;
            }
            const pathParts = pathname.split('/').filter(Boolean);
            const chatId = pathParts[0] === 'chat' && pathParts[1] ? pathParts[1] : null;
            await renderChatHub(main, chatId);
        } else if (pathname === '/agentBuilder' || pathname.startsWith('/agentBuilder/')) {
            if (!state.getCurrentUser()) {
                navigate('/login');
                return;
            }
            state.setCurrentView('agentBuilder');
            await renderAgentBuilder(main, fullPath);
        } else if (pathname === '/agents') {
            if (!state.getCurrentUser()) {
                navigate('/login');
                return;
            }
            state.setCurrentView('agents');
            await renderAcc(main, fullPath);
        } else if (pathname === '/skills' || pathname.startsWith('/skills/')) {
            if (!state.getCurrentUser()) {
                navigate('/login');
                return;
            }
            await renderSkills(main, fullPath);
        } else if (pathname === '/hub' || pathname.startsWith('/hub/')) {
            if (!state.getCurrentUser()) {
                navigate('/login');
                return;
            }
            await renderHub(main, fullPath);
        } else if (pathname === '/settings') {
            if (!state.getCurrentUser()) {
                navigate('/login');
                return;
            }
            await renderSettings(main);
        } else if (pathname === '/admin') {
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
        } else if (pathname === '/onboarding') {
            if (!state.getCurrentUser()) {
                navigate('/login');
                return;
            }
            await renderOnboarding(main);
        } else if (pathname === '/deploy' || pathname.startsWith('/deploy/')) {
            if (!state.getCurrentUser()) {
                navigate('/login');
                return;
            }
            await renderDeploy(main, fullPath);
        } else {
            main.innerHTML = '<div class="container"><p class="text-muted">Not found</p></div>';
        }

        renderNav?.();
        state.setLastRenderedPath(fullPath);
    }

    return {
        navigate,
        render
    };
}
