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
const { initializeDatabase, shutdown, SettingsRepository } = require('./src/server/database');
const { seedAdminUser } = require('./src/server/database/seed');
const { getSSLCredentials, getLocalIPs } = require('./src/server/utils/ssl');
const log = require('./src/server/services/Logger')('server');

const requestLogger = require('./src/server/middleware/requestLogger');
const authRoutes = require('./src/server/routes/auth');
const userRoutes = require('./src/server/routes/users');
const agentRoutes = require('./src/server/routes/agents');
const skillsRoutes = require('./src/server/routes/skills');
const chatsRoutes = require('./src/server/routes/chats');
const deployRoutes = require('./src/server/routes/deploy');
const hubRoutes = require('./src/server/routes/hub');
const aiRoutes = require('./src/server/routes/ai');
const knowledgeRoutes = require('./src/server/routes/knowledge');
const analyticsRoutes = require('./src/server/routes/analytics');
const adminRoutes = require('./src/server/routes/admin');
const appearanceRoutes = require('./src/server/routes/appearance');
const mediaRoutes = require('./src/server/routes/media');
const rolesRoutes = require('./src/server/routes/roles');
const privateTagsRoutes = require('./src/server/routes/privateTags');
const { initGatewaySocket } = require('./src/server/socket/gatewaySocket');
const { initDeploySocket } = require('./src/server/socket/deploySocket');
const { initNotificationsSocket } = require('./src/server/socket/notificationsSocket');
const { initAdminSocket } = require('./src/server/socket/adminSocket');
const { initAnalyticsSocket } = require('./src/server/socket/analyticsSocket');
const notificationService = require('./src/server/services/notificationService');
const socketSessionRegistry = require('./src/server/services/socketSessionRegistry');
const { buildOriginMatcher } = require('./src/server/utils/helperFunctions');

const app = express();
const useHTTPS = process.env.USE_HTTPS === '1' || process.env.USE_HTTPS === 'true';
let server, io;

/**
 * Startup guard: prevents production server from starting without JWT secrets.
 * This is a basic sanity check -- it verifies that secrets are present (truthy)
 * but does NOT validate secret strength, entropy, or minimum length.
 * Secret quality should be enforced through deployment docs and .env.example guidance.
 */
function assertProductionAuthSecrets() {
    if (process.env.NODE_ENV !== 'production') return;
    const accessSecret = Config.get('auth.accessSecret', process.env.JWT_ACCESS_SECRET);
    const refreshSecret = Config.get('auth.refreshSecret', process.env.JWT_REFRESH_SECRET);
    if (!accessSecret || !refreshSecret) {
        throw new Error('JWT access/refresh secrets must be configured in production');
    }
}

// ─── Middleware ──────────────────────────────────────────────────────────────

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            imgSrc: ["'self'", 'data:', 'blob:'],
            connectSrc: ["'self'", 'ws:', 'wss:']
        }
    },
    crossOriginEmbedderPolicy: false
}));

const corsOrigins = Config.get('security.httpCorsOrigins', ['*']);
if (process.env.NODE_ENV === 'production' && corsOrigins.includes('*')) {
    log.warn('CORS is configured with wildcard "*" in production — restrict security.httpCorsOrigins');
}
app.use(cors({
    origin: buildOriginMatcher(corsOrigins, { allowNoOrigin: true }),
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const limiter = rateLimit({
    windowMs: Config.get('rateLimit.windowMs', 900000),
    max: Config.get('rateLimit.maxRequests', 1000),
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
app.use('/api/chats', chatsRoutes);
app.use('/api/deploy', deployRoutes);
app.use('/api/hub', hubRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/appearance', appearanceRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/user/private-tags', privateTagsRoutes);
app.use('/api/media', mediaRoutes);

// ─── Static & SPA ────────────────────────────────────────────────────────────

app.get('/favicon.ico', (req, res) => { res.status(204).end(); });
app.use(express.static(path.join(__dirname, 'src/client'), { extensions: ['html'] }));
app.use('/lib/cropperjs', express.static(path.join(__dirname, 'node_modules/cropperjs/dist')));
const mediaPath = path.resolve(process.cwd(), Config.get('media.path', './data/media'));
app.use('/media', express.static(mediaPath));

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

// ─── Startup ──────────────────────────────────────────────────────────────────

async function start() {
    try {
        const Logger = require('./src/server/services/Logger');
        Logger.setConsoleOutput(false);

        assertProductionAuthSecrets();

        await initializeDatabase();

        const settings = SettingsRepository.getAll();
        const overrides = {};
        for (const row of settings) overrides[row.key] = row.value;
        Config.applyRuntimeOverrides(overrides);

        await seedAdminUser(log);
        const SkillLoader = require('./src/server/services/SkillLoader');
        SkillLoader.initFilesystem();

        const ProviderRegistry = require('./src/server/ai/providers/ProviderRegistry');
        ProviderRegistry.init();
        try {
            await ProviderRegistry.startManagedProcesses();
        } catch (err) {
            log.error('Managed provider process startup failed', { err: err.message });
        }

        if (useHTTPS) {
            const creds = await getSSLCredentials(__dirname, log);
            server = https.createServer({ cert: creds.cert, key: creds.key, minVersion: 'TLSv1.2' }, app);
        } else {
            server = http.createServer(app);
        }

        io = new Server(server, {
            cors: {
                origin: buildOriginMatcher(Config.get('security.socketCorsOrigins', ['*']), { allowNoOrigin: true }),
                methods: ['GET', 'POST'],
                credentials: true
            }
        });
        notificationService.bindIO(io);
        socketSessionRegistry.bindIO(io);
        initGatewaySocket(io);
        initDeploySocket(io);
        initNotificationsSocket(io);
        initAdminSocket(io);
        initAnalyticsSocket(io);

        const HooksService = require('./src/server/services/HooksService');
        HooksService.loadFromDb();

        const port = process.env.PORT || Config.get('server.port', 3000);
        const host = process.env.HOST || (useHTTPS ? '0.0.0.0' : Config.get('server.host', 'localhost'));

        server.listen(port, host, () => {
            Logger.setConsoleOutput(true);
            const protocol = useHTTPS ? 'https' : 'http';
            const ips = getLocalIPs();
            const url = host === '0.0.0.0' && ips[0] ? `${protocol}://${ips[0]}:${port}` : `${protocol}://${host}:${port}`;
            const comfyStatus = Config.get('ai.comfyuiStartWithServer', false) ? 'ComfyUI auto-start' : 'ComfyUI manual';
            console.log(`\n  BetterIntelligence v${Config.get('app.version')} — ${url}\n  ${comfyStatus}\n`);
        });
    } catch (err) {
        try { require('./src/server/services/Logger').setConsoleOutput(true); } catch {}
        console.error('\n  BetterIntelligence — Failed:', err.message, '\n');
        process.exit(1);
    }
}

async function gracefulShutdown() {
    log.info('Shutting down...');
    try {
        const ProviderRegistry = require('./src/server/ai/providers/ProviderRegistry');
        await ProviderRegistry.stopManagedProcesses();
    } catch (err) {
        log.warn('Managed provider process shutdown failed', { err: err.message });
    }
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
