/**
 * BetterIntelligence - Client App
 */

const API_BASE = '/api';

let currentUser = null;
let currentView = null;

function getToken() {
    return localStorage.getItem('accessToken');
}

async function api(path, opts = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json', ...opts.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
}

function showToast(msg, type = 'info') {
    const c = document.getElementById('toast-container');
    if (!c) return;
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

function setCurrentUser(user) {
    currentUser = user;
    if (user) localStorage.setItem('accessToken', user._token);
}

function renderNav() {
    const app = document.getElementById('app');
    let nav = document.querySelector('.nav');
    if (!nav) {
        nav = document.createElement('nav');
        nav.className = 'nav';
        app.insertBefore(nav, app.firstChild);
    }
    nav.innerHTML = `
        <span class="nav-brand">BetterIntelligence</span>
        <div class="nav-links">
            ${currentUser ? `
                <a href="#" data-route="/agents">Agents</a>
                <a href="#" data-route="/skills">Skills</a>
                <a href="#" data-route="/hub">Hub</a>
                <a href="#" data-route="/deploy">Deploy</a>
                <span class="text-muted">${currentUser.display_name || currentUser.username}</span>
                <button class="btn btn-ghost" data-action="logout">Logout</button>
            ` : `
                <a href="#" data-route="/login">Login</a>
                <a href="#" data-route="/login" class="btn btn-primary">Get Started</a>
            `}
        </div>
    `;
    nav.querySelectorAll('[data-route]').forEach(el => {
        el.addEventListener('click', (e) => { e.preventDefault(); navigate(el.dataset.route); });
    });
    nav.querySelector('[data-action="logout"]')?.addEventListener('click', logout);
}

async function logout() {
    try { await api('/auth/logout', { method: 'POST' }); } catch {}
    localStorage.removeItem('accessToken');
    currentUser = null;
    navigate('/');
}

async function checkSession() {
    if (!getToken()) return false;
    try {
        const { data } = await api('/auth/session');
        if (data?.user) {
            currentUser = data.user;
            return true;
        }
    } catch {}
    localStorage.removeItem('accessToken');
    return false;
}

function navigate(path) {
    history.pushState({}, '', path);
    render(path);
}

async function render(path) {
    const app = document.getElementById('app');
    const main = app.querySelector('.main') || (() => { const m = document.createElement('main'); m.className = 'main'; app.appendChild(m); return m; })();

    if (path === '/' || path === '') {
        currentView = 'landing';
        main.innerHTML = `
            <div class="landing">
                <h1>Build AI agents.</h1>
                <h1>Share skills. Deploy bots.</h1>
                <p>Create no-code AI agents, install skills from the Hub, and deploy chatbots in minutes.</p>
                ${currentUser ? `
                    <a href="#" class="btn btn-primary" data-route="/agents">Go to Agents</a>
                ` : `
                    <a href="#" class="btn btn-primary" data-route="/login">Get Started</a>
                `}
            </div>
        `;
        main.querySelector('[data-route]')?.addEventListener('click', (e) => { e.preventDefault(); navigate(e.target.dataset.route); });
    } else if (path === '/login' || path === '/signup') {
        currentView = 'auth';
        renderAuth(main, path === '/signup');
    } else if (path === '/agents' || path.startsWith('/agents')) {
        if (!currentUser) { navigate('/login'); return; }
        currentView = 'agents';
        await renderAgents(main, path);
    } else if (path === '/skills' || path.startsWith('/skills')) {
        if (!currentUser) { navigate('/login'); return; }
        await renderSkills(main, path);
    } else if (path === '/hub') {
        if (!currentUser) { navigate('/login'); return; }
        await renderHub(main);
    } else if (path === '/onboarding') {
        if (!currentUser) { navigate('/login'); return; }
        await renderOnboarding(main);
    } else if (path === '/deploy' || path.startsWith('/deploy')) {
        if (!currentUser) { navigate('/login'); return; }
        await renderDeploy(main, path);
    } else if (path.match(/^\/agents\/[^/]+\/chat/)) {
        if (!currentUser) { navigate('/login'); return; }
        const agentId = path.split('/')[2];
        const convParam = new URLSearchParams(location.search).get('conv');
        await renderChat(main, agentId, convParam);
    } else {
        main.innerHTML = '<div class="container"><p class="text-muted">Not found</p></div>';
    }

    renderNav();
}

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
                    <input type="password" name="password" class="form-input" placeholder="••••••••" required>
                </div>
                <button type="submit" class="btn btn-primary" style="width:100%;margin-top:0.5rem">${isSignup ? 'Sign up' : 'Login'}</button>
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
                localStorage.setItem('accessToken', data.accessToken);
                showToast('Account created!', 'success');
                sessionStorage.setItem('onboarding', '1');
                navigate('/onboarding');
            } else {
                const { data } = await api('/auth/login', {
                    method: 'POST',
                    body: JSON.stringify({ login: form.login.value, password: form.password.value })
                });
                setCurrentUser({ ...data.user, _token: data.accessToken });
                localStorage.setItem('accessToken', data.accessToken);
                showToast('Logged in', 'success');
                navigate('/agents');
            }
        } catch (err) {
            showToast(err.message, 'error');
            btn.disabled = false;
        }
    });
}

async function renderAgents(container, path) {
    const parts = path.split('/').filter(Boolean);
    const isNew = parts[1] === 'new';
    const editId = parts[1] && parts[1] !== 'new' ? parts[1] : null;

    if (isNew || editId) {
        await renderAgentForm(container, editId);
        return;
    }

    try {
        const { data: agents } = await api('/agents');
        container.innerHTML = `
            <div class="container">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem">
                    <h2 style="font-size:1.5rem;font-weight:700">My Agents</h2>
                    <a href="#" class="btn btn-primary" data-route="/agents/new">+ New Agent</a>
                </div>
                ${agents.length === 0 ? `
                    <div class="card empty-state">
                        <div class="empty-state-icon">🤖</div>
                        <h3>No agents yet</h3>
                        <p>Create your first AI agent to get started</p>
                        <a href="#" class="btn btn-primary" data-route="/agents/new">Create Agent</a>
                    </div>
                ` : `
                    <div class="card-grid">
                        ${agents.map(a => `
                            <div class="card">
                                <div class="card-header">
                                    <img class="card-avatar" src="${a.avatar_url || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"%3E%3Ccircle fill="%236366f1" cx="24" cy="24" r="24"/%3E%3Ctext fill="white" x="50%25" y="50%25" dominant-baseline="central" text-anchor="middle" font-size="20"%3E${(a.name||'A')[0]}%3C/text%3E%3C/svg%3E'}" alt="">
                                    <div>
                                        <div class="card-title">${a.name || 'Agent'}</div>
                                        <div class="card-meta">${a.tagline || a.text_model || 'No model'}</div>
                                    </div>
                                </div>
                                <div class="card-actions">
                                    <a href="#" class="btn btn-primary btn-sm" data-route="/agents/${a.id}/chat">Chat</a>
                                    <a href="#" class="btn btn-ghost btn-sm" data-route="/agents/${a.id}">Edit</a>
                                    <button class="btn btn-ghost btn-sm btn-delete" data-id="${a.id}">Delete</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        `;

        container.querySelectorAll('[data-route]').forEach(el => {
            el.addEventListener('click', (e) => { e.preventDefault(); navigate(el.dataset.route); });
        });
        container.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Delete this agent?')) return;
                try {
                    await api(`/agents/${btn.dataset.id}`, { method: 'DELETE' });
                    showToast('Agent deleted', 'success');
                    renderAgents(container, '/agents');
                } catch (err) { showToast(err.message, 'error'); }
            });
        });
    } catch (err) {
        container.innerHTML = `<div class="container"><p class="toast error">${err.message}</p></div>`;
    }
}

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

    container.innerHTML = `
        <div class="container">
            <div style="margin-bottom:1.5rem">
                <a href="#" class="btn btn-ghost" data-route="/agents">← Back</a>
            </div>
            <div class="card" style="max-width:600px">
                <h3 style="margin-bottom:1rem;font-size:1.25rem">${agent ? 'Edit Agent' : 'New Agent'}</h3>
                <form id="agent-form">
                    <div class="form-group">
                        <label class="form-label">Name</label>
                        <input type="text" name="name" class="form-input" value="${agent?.name || ''}" placeholder="My Assistant" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Tagline</label>
                        <input type="text" name="tagline" class="form-input" value="${agent?.tagline || ''}" placeholder="Short description">
                    </div>
                    <div class="form-group">
                        <label class="form-label">System prompt</label>
                        <textarea name="systemPrompt" class="form-input" placeholder="You are a helpful assistant...">${agent?.system_prompt || ''}</textarea>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Model</label>
                        <input type="text" name="textModel" class="form-input" value="${agent?.text_model || 'llama3.2'}" placeholder="e.g. llama3.2">
                    </div>
                    <button type="submit" class="btn btn-primary mt-2">${agent ? 'Save' : 'Create'}</button>
                </form>
            </div>
        </div>
    `;

    container.querySelector('[data-route]').addEventListener('click', (e) => { e.preventDefault(); navigate('/agents'); });

    container.querySelector('#agent-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;
        const body = {
            name: form.name.value,
            tagline: form.tagline.value,
            systemPrompt: form.systemPrompt.value,
            textModel: form.textModel.value
        };
        try {
            if (agent) {
                await api(`/agents/${agent.id}`, { method: 'PUT', body: JSON.stringify(body) });
                showToast('Agent updated', 'success');
            } else {
                await api('/agents', { method: 'POST', body: JSON.stringify(body) });
                showToast('Agent created', 'success');
            }
            navigate('/agents');
        } catch (err) {
            showToast(err.message, 'error');
            btn.disabled = false;
        }
    });
}

async function renderSkills(container, path) {
    const parts = path.split('/').filter(Boolean);
    const isNew = parts[1] === 'new';
    const editSlug = parts[1] && parts[1] !== 'new' ? parts[1] : null;
    if (isNew || editSlug) {
        await renderSkillForm(container, editSlug);
        return;
    }
    try {
        const { data: skills } = await api('/skills');
        const installed = skills.filter(s => s.source === 'installed');
        const mine = skills.filter(s => s.source === 'workspace');
        container.innerHTML = `
            <div class="container">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem">
                    <h2 style="font-size:1.5rem;font-weight:700">My Skills</h2>
                    <a href="#" class="btn btn-primary" data-route="/skills/new">+ Create Skill</a>
                </div>
                ${installed.length || mine.length ? `
                    ${installed.length ? `<h4 class="mt-2 text-muted" style="font-size:0.9rem;margin-bottom:0.75rem">Installed from Hub</h4>
                        <div class="card-grid">${installed.map(s => `
                            <div class="card">
                                <div class="card-title">${s.name}</div>
                                <div class="card-meta">${s.description || 'No description'}</div>
                            </div>
                        `).join('')}</div>` : ''}
                    ${mine.length ? `<h4 class="mt-2 text-muted" style="font-size:0.9rem;margin-bottom:0.75rem">My Skills (created)</h4>
                        <div class="card-grid">${mine.map(s => `
                            <div class="card">
                                <div class="card-title">${s.name}</div>
                                <div class="card-meta">${s.description || 'No description'}</div>
                                <div class="card-actions"><a href="#" class="btn btn-primary btn-sm" data-route="/skills/${(s.slug||s.name)}/edit">Edit</a></div>
                            </div>
                        `).join('')}</div>` : ''}
                ` : `
                    <div class="card empty-state">
                        <div class="empty-state-icon">📦</div>
                        <h3>No skills yet</h3>
                        <p>Create a skill or install one from the Hub</p>
                        <a href="#" class="btn btn-primary" data-route="/skills/new">Create Skill</a>
                        <a href="#" class="btn btn-ghost mt-1" data-route="/hub">Browse Hub</a>
                    </div>
                `}
            </div>
        `;
        container.querySelectorAll('[data-route]').forEach(el => {
            el.addEventListener('click', (e) => { e.preventDefault(); navigate(el.dataset.route); });
        });
    } catch (err) {
        container.innerHTML = `<div class="container"><p class="toast error">${err.message}</p></div>`;
    }
}

async function renderSkillForm(container, slug) {
    let skill = null;
    if (slug) {
        try {
            const { data } = await api(`/skills/${encodeURIComponent(slug)}`);
            skill = data;
        } catch {
            showToast('Skill not found', 'error');
            navigate('/skills');
            return;
        }
    }
    container.innerHTML = `
        <div class="container">
            <a href="#" class="btn btn-ghost" data-route="/skills">← Back</a>
            <div class="card mt-2" style="max-width:600px">
                <h3>${skill ? 'Edit Skill' : 'Create Skill'}</h3>
                <form id="skill-form" class="mt-2">
                    <div class="form-group">
                        <label class="form-label">Name</label>
                        <input type="text" name="name" class="form-input" value="${skill?.name || ''}" placeholder="web-search" required ${skill ? 'readonly' : ''}>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Slug</label>
                        <input type="text" name="slug" class="form-input" value="${skill?.name || ''}" placeholder="web-search" required ${skill ? 'readonly' : ''}>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Description</label>
                        <input type="text" name="description" class="form-input" value="${skill?.description || ''}" placeholder="Brief description">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Instructions (markdown)</label>
                        <textarea name="instructions" class="form-input" rows="6" placeholder="When the user asks about X, do Y...">${skill?.instructions || ''}</textarea>
                    </div>
                    <button type="submit" class="btn btn-primary">${skill ? 'Save' : 'Create'}</button>
                </form>
            </div>
        </div>
    `;
    container.querySelector('[data-route]').addEventListener('click', (e) => { e.preventDefault(); navigate('/skills'); });
    container.querySelector('#skill-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target;
        const btn = f.querySelector('button[type="submit"]');
        btn.disabled = true;
        const body = { name: f.name.value, slug: (f.slug?.value || f.name.value).toLowerCase().replace(/\s+/g, '-'), description: f.description?.value || '', instructions: f.instructions?.value || '' };
        try {
            if (skill) await api(`/skills/${encodeURIComponent(slug || skill.slug || skill.name)}`, { method: 'PUT', body: JSON.stringify(body) });
            else await api('/skills', { method: 'POST', body: JSON.stringify(body) });
            showToast(skill ? 'Skill updated' : 'Skill created', 'success');
            navigate('/skills');
        } catch (err) { showToast(err.message, 'error'); btn.disabled = false; }
    });
}

async function renderHub(container) {
    try {
        const { data: skills } = await api('/hub/skills');
        const { data: mySkills } = await api('/skills');
        const installed = new Set(mySkills.filter(s => s.source === 'installed').map(s => s.name));
        container.innerHTML = `
            <div class="container">
                <h2 style="font-size:1.5rem;font-weight:700;margin-bottom:1.5rem">Skills Hub</h2>
                <div class="card-grid">
                    ${skills.map(s => `
                        <div class="card">
                            <div class="card-title">${s.name}</div>
                            <div class="card-meta">${s.description || ''}</div>
                            <div class="card-actions">
                                ${installed.has(s.name) ? '<span class="text-muted">Installed</span>' : `<button class="btn btn-primary btn-sm btn-install" data-slug="${s.name}">Install</button>`}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        container.querySelectorAll('.btn-install').forEach(btn => {
            btn.addEventListener('click', async () => {
                try {
                    await api(`/hub/skills/${btn.dataset.slug}/install`, { method: 'POST' });
                    showToast('Skill installed', 'success');
                    renderHub(container);
                } catch (err) { showToast(err.message, 'error'); }
            });
        });
    } catch (err) {
        container.innerHTML = `<div class="container"><p class="toast error">${err.message}</p></div>`;
    }
}

async function renderDeploy(container, path) {
    try {
        const { data: agents } = await api('/agents');
        const parts = path.split('/').filter(Boolean);
        const slug = parts[1];
        container.innerHTML = `
            <div class="container">
                <h2 style="font-size:1.5rem;font-weight:700;margin-bottom:1.5rem">Deploy Bot</h2>
                <div class="card" style="max-width:500px">
                    <div class="form-group">
                        <label class="form-label">Agent</label>
                        <select id="deploy-agent" class="form-input">${agents.map(a => `<option value="${a.id}">${a.name}</option>`).join('')}</select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Slug (e.g. my-support-bot)</label>
                        <input type="text" id="deploy-slug" class="form-input" placeholder="my-bot" value="${slug || ''}">
                    </div>
                    <button id="deploy-btn" class="btn btn-primary mt-2">Create Deployment</button>
                </div>
                <div id="deploy-result" class="card mt-2" style="max-width:500px;display:none">
                    <h4>Embed code</h4>
                    <pre id="embed-code" style="background:#12121a;padding:1rem;border-radius:8px;font-size:0.85rem;overflow-x:auto"></pre>
                    <a href="#" id="embed-link" target="_blank" class="btn btn-ghost mt-1">Open embed</a>
                </div>
            </div>
        `;
        const agentSel = container.querySelector('#deploy-agent');
        const slugInput = container.querySelector('#deploy-slug');
        const resultEl = container.querySelector('#deploy-result');
        container.querySelector('#deploy-btn').addEventListener('click', async () => {
            const agentId = agentSel.value;
            const s = slugInput.value.trim().toLowerCase().replace(/\s+/g, '-');
            if (!s) { showToast('Enter a slug', 'error'); return; }
            try {
                const { data } = await api('/deploy', { method: 'POST', body: JSON.stringify({ agentId, slug: s }) });
                resultEl.style.display = 'block';
                const origin = location.origin;
                resultEl.querySelector('#embed-code').textContent = `<iframe src="${origin}/embed/${data.slug}" width="400" height="500"></iframe>`;
                resultEl.querySelector('#embed-link').href = `${origin}/embed/${data.slug}`;
                showToast('Deployment created', 'success');
            } catch (err) { showToast(err.message, 'error'); }
        });
    } catch (err) {
        container.innerHTML = `<div class="container"><p class="toast error">${err.message}</p></div>`;
    }
}

async function renderChat(container, agentId, convParam) {
    try {
        const { data: agent } = await api(`/agents/${agentId}`);
        const { data: convs } = await api('/conversations?agentId=' + agentId);
        let messages = [];
        let convId = convParam || (convs.length ? convs[0].id : null);
        if (convId) {
            const r = await api(`/conversations/${convId}/messages`);
            messages = r.data;
        }
        container.innerHTML = `
            <div class="container">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;flex-wrap:wrap;gap:0.5rem">
                    <div style="display:flex;align-items:center;gap:1rem">
                        <a href="#" class="btn btn-ghost" data-route="/agents">← Back</a>
                        <h3>${agent.name}</h3>
                    </div>
                    ${convs.length > 0 ? `
                        <select id="conv-selector" class="form-input" style="max-width:200px">
                            <option value="">New conversation</option>
                            ${convs.map(c => `<option value="${c.id}" ${c.id===convId?'selected':''}>${new Date(c.updated_at).toLocaleDateString()}</option>`).join('')}
                        </select>
                    ` : ''}
                </div>
                <div class="card" style="max-width:700px">
                    <div id="chat-msgs" style="min-height:200px;max-height:400px;overflow-y:auto;padding:1rem;display:flex;flex-direction:column;gap:0.75rem">
                        ${messages.length ? messages.map(m => `<div class="msg ${m.role}" style="align-self:${m.role==='user'?'flex-end':'flex-start'};padding:0.6rem 1rem;border-radius:8px;background:${m.role==='user'?'#6366f1':'#16161f'}">${escapeHtml(m.content)}</div>`).join('') : '<p class="text-muted">No messages yet. Send one below.</p>'}
                    </div>
                    <div style="display:flex;gap:0.5rem;margin-top:1rem">
                        <input type="text" id="chat-input" class="form-input" placeholder="Type a message..." style="flex:1">
                        <button id="chat-send" class="btn btn-primary">Send</button>
                    </div>
                </div>
            </div>
        `;
        container.querySelector('[data-route]').addEventListener('click', (e) => { e.preventDefault(); navigate('/agents'); });
        container.querySelector('#conv-selector')?.addEventListener('change', (e) => {
            const id = e.target.value;
            if (id) navigate(`/agents/${agentId}/chat?conv=${id}`);
        });
        const msgEl = container.querySelector('#chat-msgs');
        const inputEl = container.querySelector('#chat-input');
        const sendBtn = container.querySelector('#chat-send');
        const token = getToken();
        let socket = null;
        if (typeof io !== 'undefined' && token) {
            socket = io({ auth: { token } });
            socket.on('agent:stream', d => {
                if (d.conversationId === convId && d.chunk) {
                    let last = msgEl.querySelector('.msg.streaming');
                    if (!last) { last = document.createElement('div'); last.className = 'msg assistant streaming'; msgEl.appendChild(last); }
                    last.textContent = (last.textContent || '') + d.chunk;
                    msgEl.scrollTop = msgEl.scrollHeight;
                }
            });
            socket.on('agent:done', d => {
                if (d.conversationId === convId) {
                    const s = msgEl.querySelector('.msg.streaming');
                    if (s) s.classList.remove('streaming');
                    msgEl.scrollTop = msgEl.scrollHeight;
                }
            });
        }
        sendBtn.addEventListener('click', async () => {
            const t = inputEl.value.trim();
            if (!t) return;
            if (!convId) {
                const { data } = await api('/conversations', { method: 'POST', body: JSON.stringify({ agentId }) });
                convId = data.id;
            }
            const userMsg = document.createElement('div');
            userMsg.className = 'msg user';
            userMsg.style.cssText = 'align-self:flex-end;padding:0.6rem 1rem;border-radius:8px;background:#6366f1';
            userMsg.textContent = t;
            msgEl.querySelector('.text-muted')?.remove();
            msgEl.appendChild(userMsg);
            inputEl.value = '';
            msgEl.scrollTop = msgEl.scrollHeight;
            if (socket) {
                socket.emit('agent:invoke', { agentId, conversationId: convId, message: t });
            } else {
                const place = document.createElement('div');
                place.className = 'msg assistant';
                place.style.cssText = 'align-self:flex-start;padding:0.6rem 1rem;border-radius:8px;background:#16161f';
                place.textContent = 'Connect with Socket.io for streaming. Using placeholder.';
                msgEl.appendChild(place);
            }
        });
        inputEl.addEventListener('keypress', e => { if (e.key === 'Enter') sendBtn.click(); });
    } catch (err) {
        container.innerHTML = `<div class="container"><p class="toast error">${err.message}</p></div>`;
    }
}

function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

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
                const { data } = await api('/agents', { method: 'POST', body: JSON.stringify({ name: agentName, systemPrompt: agentPrompt, textModel: 'llama3.2' }) });
                showToast('Agent created!', 'success');
                navigate(`/agents/${data.id}/chat`);
                return;
            } catch (err) { showToast(err.message, 'error'); return; }
        }
        renderOnboardingStep(container, step, agentName, agentPrompt, next);
    };
    renderOnboardingStep(container, step, agentName, agentPrompt, next);
}

function renderOnboardingStep(container, step, agentName, agentPrompt, onNext) {
    const steps = [
        { title: 'Name your first agent', body: '<div class="form-group"><label class="form-label">Agent name</label><input type="text" id="onboard-name" class="form-input" value="' + (agentName || '') + '" placeholder="My Assistant"></div>' },
        { title: 'Add a short prompt', body: '<div class="form-group"><label class="form-label">System prompt</label><textarea id="onboard-prompt" class="form-input" rows="4" placeholder="You are a helpful assistant...">' + (agentPrompt || '') + '</textarea></div>' },
        { title: 'You\'re all set!', body: '<p class="text-muted">Create your agent and start chatting.</p><p class="text-muted mt-1">You can install skills from the Hub later.</p>' }
    ];
    const s = steps[step - 1];
    container.innerHTML = `
        <div class="container">
            <div class="auth-container" style="max-width:480px;margin:4rem auto">
                <h2 class="auth-title">Getting started</h2>
                <p class="auth-subtitle">Step ${step} of 3</p>
                <div class="mt-2">
                    <h4 style="margin-bottom:0.75rem">${s.title}</h4>
                    ${s.body}
                    <div style="display:flex;gap:0.5rem;margin-top:1.5rem">
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

window.addEventListener('popstate', () => render(location.pathname || '/'));

(async () => {
    await checkSession();
    render(location.pathname || '/');
})();

window.BetterIntelligence = { navigate, getToken, api, showToast };
