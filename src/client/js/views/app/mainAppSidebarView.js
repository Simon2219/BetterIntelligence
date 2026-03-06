import { buildSidebarHtml } from '../../components/AppShellMarkup.js';

export function createSidebarView({ navigate } = {}) {
    function renderSidebar(sidebar, { path, canAccessAdmin }) {
        if (!sidebar) return;
        sidebar.innerHTML = buildSidebarHtml({ path, canAccessAdmin });
    }

    function bindSidebarRouteLinks(root) {
        root.querySelectorAll('[data-route]').forEach((element) => {
            if (element.dataset.routeBound === '1') return;
            element.dataset.routeBound = '1';
            element.addEventListener('click', (event) => {
                event.preventDefault();
                navigate(element.dataset.route);
            });
        });
    }

    function applySidebarSizing(body, sidebarWrap) {
        if (!body || !sidebarWrap) return;
        body.style.setProperty('--main-sidebar-width', `${sidebarWrap.offsetWidth || 220}px`);
    }

    return {
        renderSidebar,
        bindSidebarRouteLinks,
        applySidebarSizing
    };
}
