/**
 * BetterIntelligence - Main Server
 * Build AI agents. Share skills. Deploy bots.
 */

require('dotenv').config();

const express = require('express');
const http = require('http');
const https = require('https');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');

const Config = require('./config/Config');
const { initializeDatabase, shutdown, SettingsSystem } = require('./src/server/database');
const { seedAdminUser } = require('./src/server/database/seed');
const { getSSLCredentials, getLocalIPs } = require('./src/server/utils/ssl');
const log = require('./src/server/services/Logger')('server');

const requestLogger = require('./src/server/middleware/requestLogger');
const authRoutes = require('./src/server/routes/auth');
const userRoutes = require('./src/server/routes/users');
const agentRoutes = require('./src/server/routes/agents');
const skillsRoutes = require('./src/server/routes/skills');
const conversationsRoutes = require('./src/server/routes/conversations');
const deployRoutes = require('./src/server/routes/deploy');
const hubRoutes = require('./src/server/routes/hub');
const { initGatewaySocket } = require('./src/server/socket/gatewaySocket');

const app = express();
const useHTTPS = process.env.USE_HTTPS === '1' || process.env.USE_HTTPS === 'true';
let server, io;

// ─── Middleware ──────────────────────────────────────────────────────────────

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const limiter = rateLimit({
    windowMs: Config.get('rateLimit.windowMs', 900000),
    max: Config.get('rateLimit.maxRequests', 300),
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ success: false, error: 'Too many requests' })
});
app.use('/api/', limiter);
app.use('/api/', requestLogger);

// ─── API Routes ──────────────────────────────────────────────────────────────

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/skills', skillsRoutes);
app.use('/api/conversations', conversationsRoutes);
app.use('/api/deploy', deployRoutes);
app.use('/api/hub', hubRoutes);

// ─── Static & SPA ────────────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, 'src/client'), { extensions: ['html'] }));

app.get('/embed/:slug', (req, res) => {
    res.sendFile(path.join(__dirname, 'src/client/embed.html'));
});

app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ success: false, error: 'Not found' });
    res.sendFile(path.join(__dirname, 'src/client/index.html'));
});

// ─── Error Handler ───────────────────────────────────────────────────────────

app.use((err, req, res, next) => {
    log.error('Unhandled error', { err: err.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
});

// ─── Init Skills Filesystem ──────────────────────────────────────────────────

function initSkillsFilesystem() {
    const fs = require('fs');
    const base = path.resolve(Config.get('skills.basePath', './data/skills'));
    const dirs = [
        path.join(base, 'bundled'),
        path.join(base, 'workspace'),
        path.join(base, 'installed')
    ];
    for (const d of dirs) {
        if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    }
    // Seed bundled skills
    const greetingPath = path.join(base, 'bundled', 'greeting');
    if (!fs.existsSync(greetingPath)) {
        fs.mkdirSync(greetingPath, { recursive: true });
        fs.writeFileSync(path.join(greetingPath, 'SKILL.md'), `---
name: greeting
description: Friendly greeting and small talk
version: 1.0.0
---

When the user greets you or wants casual conversation, respond warmly and encourage dialogue.
`);
    }
    const summarizerPath = path.join(base, 'bundled', 'summarizer');
    if (!fs.existsSync(summarizerPath)) {
        fs.mkdirSync(summarizerPath, { recursive: true });
        fs.writeFileSync(path.join(summarizerPath, 'SKILL.md'), `---
name: summarizer
description: Summarize long text
version: 1.0.0
---

When the user asks you to summarize text, provide a concise summary that captures the main points.
`);
    }
    const qaPath = path.join(base, 'bundled', 'qa');
    if (!fs.existsSync(qaPath)) {
        fs.mkdirSync(qaPath, { recursive: true });
        fs.writeFileSync(path.join(qaPath, 'SKILL.md'), `---
name: qa
description: Answer questions from context
version: 1.0.0
---

When the user asks a question, answer based on the context provided. Be concise and accurate.
`);
    }
}

// ─── Startup ──────────────────────────────────────────────────────────────────

async function start() {
    try {
        const Logger = require('./src/server/services/Logger');
        Logger.setConsoleOutput(false);

        await initializeDatabase();

        const settings = SettingsSystem.getAll();
        const overrides = {};
        for (const row of settings) overrides[row.key] = row.value;
        Config.applyRuntimeOverrides(overrides);

        await seedAdminUser(log);
        initSkillsFilesystem();

        if (useHTTPS) {
            const creds = await getSSLCredentials(__dirname, log);
            server = https.createServer({ cert: creds.cert, key: creds.key, minVersion: 'TLSv1.2' }, app);
        } else {
            server = http.createServer(app);
        }

        io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });
        initGatewaySocket(io);

        const port = process.env.PORT || Config.get('server.port', 3000);
        const host = process.env.HOST || (useHTTPS ? '0.0.0.0' : Config.get('server.host', 'localhost'));

        server.listen(port, host, () => {
            Logger.setConsoleOutput(true);
            const protocol = useHTTPS ? 'https' : 'http';
            const ips = getLocalIPs();
            const url = host === '0.0.0.0' && ips[0] ? `${protocol}://${ips[0]}:${port}` : `${protocol}://${host}:${port}`;
            console.log(`\n  BetterIntelligence v${Config.get('app.version')} — ${url}\n`);
        });
    } catch (err) {
        try { require('./src/server/services/Logger').setConsoleOutput(true); } catch {}
        console.error('\n  BetterIntelligence — Failed:', err.message, '\n');
        process.exit(1);
    }
}

async function gracefulShutdown() {
    log.info('Shutting down...');
    if (io) io.close(() => {});
    if (server) {
        server.close(() => {
            setTimeout(() => { shutdown(); process.exit(0); }, 500);
        });
    } else {
        shutdown();
        process.exit(0);
    }
}

process.on('SIGINT', () => gracefulShutdown().catch(() => process.exit(1)));
process.on('SIGTERM', () => gracefulShutdown().catch(() => process.exit(1)));

start();
