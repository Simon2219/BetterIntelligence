function killPort(port) {
    const { execSync } = require('child_process');
    const win = process.platform === 'win32';
    try {
        if (win) {
            const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
            const pids = new Set();
            for (const line of out.trim().split(/\r?\n/).filter(Boolean)) {
                const p = line.trim().split(/\s+/).pop();
                if (p && /^\d+$/.test(p) && p !== '0') pids.add(p);
            }
            for (const pid of pids) { try { execSync(`taskkill /PID ${pid} /F`, { stdio: 'pipe' }); } catch {} }
        } else {
            execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, { stdio: 'pipe' });
        }
        return true;
    } catch { return true; }
}
if (require.main === module) killPort(parseInt(process.argv[2] || process.env.PORT || '3000'));
module.exports = { killPort };
