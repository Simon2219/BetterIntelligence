/**
 * Kill any process using the given port.
 * Cross-platform: Windows (netstat + taskkill) and Unix (lsof + kill).
 * @param {number} port
 * @returns {boolean} true if something was killed or port was free
 */
function killPort(port) {
    const { execSync } = require('child_process');
    const isWin = process.platform === 'win32';

    try {
        if (isWin) {
            const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
            const lines = out.trim().split(/\r?\n/).filter(Boolean);
            const pids = new Set();
            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                const pid = parts[parts.length - 1];
                if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
            }
            for (const pid of pids) {
                try {
                    execSync(`taskkill /PID ${pid} /F`, { stdio: 'pipe' });
                    console.log(`[Start] Killed process ${pid} on port ${port}`);
                } catch {}
            }
            return true;
        } else {
            execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, { stdio: 'pipe' });
            return true;
        }
    } catch {
        return true;
    }
}

if (require.main === module) {
    const port = parseInt(process.argv[2] || process.env.PORT || '3000', 10);
    killPort(port);
}

module.exports = { killPort };
