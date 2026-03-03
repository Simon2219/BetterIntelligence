/**
 * ComfyUIProcessManager - Starts and manages the ComfyUI process as a child of the main server.
 *
 * When COMFYUI_START_WITH_SERVER=1, spawns ComfyUI on startup and terminates it on shutdown.
 * ComfyUI stdout/stderr are forwarded to the ComfyUI logger.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const log = require('../../services/Logger')('comfyui');

let _process = null;
let _intentionalStop = false;
let _restartCount = 0;
let _lastStartOptions = {};
const MAX_RESTARTS = 5;
const RESTART_DELAY_MS = 5000;

/**
 * Parse port from ComfyUI URL (e.g. http://localhost:8188 -> 8188)
 */
function parsePortFromUrl(url) {
    if (!url) return 8188;
    try {
        const u = new URL(url);
        return parseInt(u.port, 10) || 8188;
    } catch {
        return 8188;
    }
}

/**
 * Poll ComfyUI until it responds (with timeout).
 */
async function waitForReady(url, maxWaitMs = 120000, intervalMs = 2000) {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitMs) {
        try {
            const res = await fetch(`${url}/object_info`, { signal: AbortSignal.timeout(5000) });
            if (res.ok) {
                log.info('ComfyUI is ready');
                return true;
            }
        } catch {
            /* not ready yet */
        }
        await new Promise(r => setTimeout(r, intervalMs));
    }
    log.warn('ComfyUI did not become ready within timeout');
    return false;
}

/**
 * Start ComfyUI as a child process.
 * @param {Object} options
 * @param {string} [options.comfyuiPath] - Path to ComfyUI directory (default: project/comfyui or COMFYUI_PATH)
 * @param {string} [options.url] - ComfyUI URL for host/port (default from config)
 * @param {boolean} [options.waitForReady=true] - Wait for ComfyUI to respond before resolving
 * @returns {Promise<void>} Resolves when process is spawned (and ready if waitForReady)
 */
async function start(options = {}) {
    if (_process) {
        log.warn('ComfyUI already running');
        return;
    }
    _intentionalStop = false;
    _lastStartOptions = options;

    const projectRoot = path.resolve(__dirname, '../../..');
    const comfyuiPath = options.comfyuiPath || process.env.COMFYUI_PATH || path.join(projectRoot, 'comfyui');
    const url = options.url || process.env.COMFYUI_URL || 'http://localhost:8188';
    const port = parsePortFromUrl(url);
    const host = '0.0.0.0';

    const mainPy = path.join(comfyuiPath, 'main.py');
    if (!fs.existsSync(mainPy)) {
        log.error('ComfyUI not found', { path: comfyuiPath, mainPy });
        throw new Error(`ComfyUI main.py not found at ${comfyuiPath}. Clone ComfyUI into ./comfyui or set COMFYUI_PATH (e.g. COMFYUI_PATH=../RealChat/RealChat/comfyui).`);
    }

    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const vramMode = (process.env.COMFYUI_VRAM_MODE || 'lowvram').toLowerCase();
    const args = ['main.py', '--listen', host, '--port', String(port)];
    if (vramMode === 'novram') {
        args.push('--novram', '--cpu-vae');
    } else if (vramMode === 'lowvram') {
        args.push('--lowvram');
    } else if (vramMode !== 'normal') {
        args.push('--novram', '--cpu-vae');
    }

    log.info('Starting ComfyUI subsystem', { cwd: comfyuiPath, port, vramMode, cmd: `${pythonCmd} ${args.join(' ')}` });

    _process = spawn(pythonCmd, args, {
        cwd: comfyuiPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env }
    });

    _process.stdout.on('data', (data) => {
        const lines = String(data).split('\n').filter(Boolean);
        for (const line of lines) {
            log.debug('[ComfyUI stdout]', { stdout: line.trim() });
        }
    });

    _process.stderr.on('data', (data) => {
        const lines = String(data).split('\n').filter(Boolean);
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const isRealError = /^(error|exception|traceback|fatal|crash)/i.test(trimmed)
                || /Traceback \(most recent/i.test(trimmed);
            if (isRealError) {
                log.warn('[ComfyUI]', { stderr: trimmed });
            } else {
                log.debug('[ComfyUI]', { stderr: trimmed });
            }
        }
    });

    _process.on('error', (err) => {
        log.error('ComfyUI process error', { err: err.message });
    });

    _process.on('exit', (code, signal) => {
        const crashed = !_intentionalStop && code !== 0 && code !== null;
        log.info('ComfyUI process exited', { code, signal, intentional: _intentionalStop });
        _process = null;

        if (crashed && _restartCount < MAX_RESTARTS) {
            _restartCount++;
            log.warn('ComfyUI crashed, auto-restarting', {
                exitCode: code,
                attempt: _restartCount,
                maxRestarts: MAX_RESTARTS,
                delayMs: RESTART_DELAY_MS
            });
            setTimeout(() => {
                start({ ..._lastStartOptions, waitForReady: true }).catch(err => {
                    log.error('ComfyUI auto-restart failed', { err: err.message });
                });
            }, RESTART_DELAY_MS);
        } else if (crashed) {
            log.error('ComfyUI crashed too many times, giving up', {
                restartCount: _restartCount,
                maxRestarts: MAX_RESTARTS
            });
        }
    });

    log.info('ComfyUI subsystem started', { pid: _process.pid, url });

    const shouldWait = options.waitForReady !== false;
    if (shouldWait) {
        const ready = await waitForReady(url);
        if (ready) _restartCount = 0;
    }
}

/**
 * Stop the ComfyUI process gracefully.
 * @returns {Promise<void>}
 */
async function stop() {
    if (!_process) {
        return;
    }

    _intentionalStop = true;
    const pid = _process.pid;
    log.info('Stopping ComfyUI subsystem', { pid });

    return new Promise((resolve) => {
        const forceKill = () => {
            if (_process) {
                try {
                    _process.kill('SIGKILL');
                } catch (e) {
                    log.warn('ComfyUI force kill failed', { err: e.message });
                }
                _process = null;
            }
            resolve();
        };

        _process.once('exit', () => {
            _process = null;
            log.info('ComfyUI subsystem stopped', { pid });
            resolve();
        });

        try {
            _process.kill('SIGTERM');
        } catch (e) {
            log.warn('ComfyUI SIGTERM failed', { err: e.message });
            forceKill();
            return;
        }

        setTimeout(forceKill, 5000);
    });
}

/**
 * Check if ComfyUI is running (managed by this subsystem).
 */
function isRunning() {
    return _process != null && _process.exitCode == null;
}

module.exports = {
    start,
    stop,
    isRunning
};
