export function createAuthView(deps) {
    const { api, navigate, showToast, setCurrentUser, escapeHtml } = deps;

function renderAuth(container, isSignup) {
    container.innerHTML = `
        <div class="auth-container">
            <h2 class="auth-title">${isSignup ? 'Create account' : 'Welcome back'}</h2>
            <p class="auth-subtitle">${isSignup ? 'Start building AI agents in minutes' : 'Sign in to your account'}</p>
            <div class="auth-tabs">
                <button class="auth-tab ${!isSignup ? 'active' : ''}" data-tab="login">Login</button>
                <button class="auth-tab ${isSignup ? 'active' : ''}" data-tab="signup">Sign up</button>
            </div>
            <form id="auth-form">
                ${isSignup ? `
                    <div class="form-group">
                        <label class="form-label">Display name</label>
                        <input type="text" name="displayName" class="form-input" placeholder="Your name" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Email</label>
                        <input type="email" name="email" class="form-input" placeholder="you@example.com" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Username</label>
                        <input type="text" name="username" class="form-input" placeholder="username" pattern="[a-zA-Z0-9_]{3,30}" required>
                    </div>
                ` : `
                <div class="form-group">
                    <label class="form-label">Email or username</label>
                    <input type="text" name="login" class="form-input" placeholder="Email or username" required>
                </div>
                `}
                <div class="form-group">
                    <label class="form-label">Password</label>
                    <input type="password" name="password" class="form-input" placeholder="********" required>
                </div>
                <button type="submit" class="btn btn-primary auth-submit-btn">${isSignup ? 'Sign up' : 'Login'}</button>
            </form>
        </div>
    `;

    container.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => navigate(tab.dataset.tab === 'signup' ? '/signup' : '/login'));
    });

    container.querySelector('#auth-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;
        try {
            if (isSignup) {
                const { data } = await api('/auth/signup', {
                    method: 'POST',
                    body: JSON.stringify({
                        email: form.email.value,
                        username: form.username.value,
                        displayName: form.displayName.value,
                        password: form.password.value
                    })
                });
                setCurrentUser({ ...data.user, _token: data.accessToken });
                showToast('Account created!', 'success');
                sessionStorage.setItem('onboarding', '1');
                navigate('/onboarding');
            } else {
                const { data } = await api('/auth/login', {
                    method: 'POST',
                    body: JSON.stringify({ login: form.login.value, password: form.password.value })
                });
                setCurrentUser({ ...data.user, _token: data.accessToken });
                showToast('Logged in', 'success');
                navigate('/agents');
            }
        } catch (err) {
            showToast(err.message, 'error');
            btn.disabled = false;
        }
    });
}

// ─── Agents List ──────────────────────────────────────────────────────────────

    return { renderAuth };
}

