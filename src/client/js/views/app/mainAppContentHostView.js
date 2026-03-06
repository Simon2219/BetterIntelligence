import { ensureAppShellLayout, teardownAppShellLayout } from '../../components/AppShellMarkup.js';

export function createMainContentHostView() {
    function ensureHost({ app, main, toastContainer }) {
        return ensureAppShellLayout({ app, main, toastContainer });
    }

    function attachMainToBody({ main, body }) {
        if (main && main.parentElement !== body) {
            main.classList.add('main__content');
            body.appendChild(main);
        }
    }

    function teardownHost(app) {
        teardownAppShellLayout(app);
    }

    return {
        ensureHost,
        attachMainToBody,
        teardownHost
    };
}
