export function renderLandingView({ main, isAuthenticated, navigate } = {}) {
    if (!main) return;
    main.innerHTML = `
        <div class="landing">
            <h1>Build AI agents.</h1>
            <h1>Share skills. Deploy bots.</h1>
            <p>Create no-code AI agents, install skills from the Hub, and deploy chatbots in minutes.</p>
            ${isAuthenticated ? `
                <a href="#" class="btn btn-primary" data-route="/agents">Go to Agents</a>
            ` : `
                <a href="#" class="btn btn-primary" data-route="/login">Get Started</a>
            `}
        </div>
    `;

    main.querySelector('[data-route]')?.addEventListener('click', (event) => {
        event.preventDefault();
        const route = event.currentTarget?.dataset?.route;
        if (route) navigate(route);
    });
}
