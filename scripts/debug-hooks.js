#!/usr/bin/env node
/** Quick debug: signup, login, create deploy, then hit hooks and log full response */
const http = require('http');
const BASE = process.argv[2] || 'http://localhost:3001';

function req(method, path, body, token) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE);
        const opts = {
            method, hostname: url.hostname, port: url.port || 80,
            path: url.pathname + url.search,
            headers: { 'Content-Type': 'application/json' }
        };
        if (token) opts.headers['Authorization'] = `Bearer ${token}`;
        const r = http.request(opts, (res) => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => resolve({ status: res.statusCode, data: d ? JSON.parse(d) : {} }));
        });
        r.on('error', reject);
        if (body) r.write(JSON.stringify(body));
        r.end();
    });
}

async function run() {
    const ts = Date.now();
    const email = 'debug-' + ts + '@x.com';
    const user = 'debug' + ts;
    await req('POST', '/api/auth/signup', { email, password: 'Test123!', displayName: 'D', username: user });
    const login = await req('POST', '/api/auth/login', { login: email, password: 'Test123!' });
    const token = login.data?.data?.accessToken;
    if (!token) { console.log('No token:', login); return; }
    const agentRes = await req('POST', '/api/agents', { name: 'Debug Agent', system_prompt: 'Hi', temperature: 0.7 }, token);
    const agentId = agentRes.data?.data?.id;
    const slug = 'debug-' + ts;
    await req('POST', '/api/deploy', { agentId, slug }, token);
    console.log('Slug:', slug);
    const hooksRes = await req('GET', '/api/deploy/' + slug + '/hooks', null, token);
    console.log('Hooks GET status:', hooksRes.status);
    console.log('Hooks GET body:', JSON.stringify(hooksRes.data, null, 2));
}

run().catch(e => console.error(e));
