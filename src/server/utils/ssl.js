/**
 * SSL Utilities - HTTPS certificate generation
 *
 * Creates certs if missing. Order: mkcert → OpenSSL → selfsigned package.
 * Delete certs/ and restart if you get "cannot provide secure connection".
 * Used when USE_HTTPS=1 for mobile camera testing.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const selfsigned = require('selfsigned');

function getLocalIPs() {
    const ips = [];
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
        for (const iface of ifaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                ips.push(iface.address);
            }
        }
    }
    return ips;
}

/**
 * Get SSL credentials for HTTPS. Creates certs if missing.
 * @param {string} projectRoot - Path to project root (for certs dir)
 * @param {Function} log - Logger function for messages
 * @returns {Promise<{cert: string, key: string}>}
 */
async function getSSLCredentials(projectRoot, log) {
    const certsDir = path.join(projectRoot, 'certs');
    const certPath = path.join(certsDir, 'cert.pem');
    const keyPath = path.join(certsDir, 'key.pem');

    if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
        const cert = fs.readFileSync(certPath, 'utf8');
        const key = fs.readFileSync(keyPath, 'utf8');
        return { cert, key };
    }

    fs.mkdirSync(certsDir, { recursive: true });
    const localIPs = getLocalIPs();

    // 1. Try mkcert (trusted local certs; no browser warnings when installed)
    const mkcertPaths = ['mkcert'];
    if (process.platform === 'win32') {
        const projectMkcert = path.join(projectRoot, 'tools', 'mkcert.exe');
        const localAppData = process.env.LOCALAPPDATA;
        if (fs.existsSync(projectMkcert)) mkcertPaths.unshift(`"${projectMkcert}"`);
        if (localAppData) {
            const scoopMkcert = path.join(localAppData, 'Programs', 'Scoop', 'shims', 'mkcert.exe');
            const chocoMkcert = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'mkcert', 'mkcert.exe');
            if (fs.existsSync(scoopMkcert)) mkcertPaths.unshift(`"${scoopMkcert}"`);
            if (fs.existsSync(chocoMkcert)) mkcertPaths.unshift(`"${chocoMkcert}"`);
        }
    }
    for (const mkcert of mkcertPaths) {
        try {
            const names = ['localhost', '127.0.0.1', ...localIPs].join(' ');
            execSync(
                `${mkcert} -cert-file "${certPath}" -key-file "${keyPath}" ${names}`,
                { stdio: 'pipe', shell: true, cwd: certsDir }
            );
            if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
                if (log) log.info('Generated HTTPS certs via mkcert');
                return { cert: fs.readFileSync(certPath, 'utf8'), key: fs.readFileSync(keyPath, 'utf8') };
            }
        } catch { continue; }
    }

    // 2. Try OpenSSL
    const sanParts = ['DNS:localhost', 'IP:127.0.0.1'];
    localIPs.forEach(ip => sanParts.push(`IP:${ip}`));
    const subjectAltName = sanParts.join(',');

    const opensslPaths = ['openssl'];
    if (process.platform === 'win32') {
        const gitUsrBin = process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'Git', 'usr', 'bin', 'openssl.exe') : null;
        if (gitUsrBin && fs.existsSync(gitUsrBin)) opensslPaths.unshift(`"${gitUsrBin}"`);
    }
    for (const openssl of opensslPaths) {
        try {
            execSync(
                `${openssl} req -x509 -nodes -newkey rsa:2048 -sha256 -days 365 ` +
                `-keyout "${keyPath}" -out "${certPath}" ` +
                `-subj "/CN=localhost" -addext "subjectAltName=${subjectAltName}"`,
                { stdio: 'pipe', shell: true }
            );
            if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
                if (log) log.info('Generated self-signed SSL certs via OpenSSL');
                return { cert: fs.readFileSync(certPath, 'utf8'), key: fs.readFileSync(keyPath, 'utf8') };
            }
        } catch { continue; }
    }

    // 3. Fallback: selfsigned package
    const attrs = [{ name: 'commonName', value: 'localhost' }];
    const altNames = [
        { type: 2, value: 'localhost' },
        { type: 7, ip: '127.0.0.1' },
        ...localIPs.map(ip => ({ type: 7, ip }))
    ];
    const pems = await selfsigned.generate(attrs, {
        days: 365,
        keySize: 2048,
        keyType: 'rsa',
        algorithm: 'sha256',
        extensions: [{ name: 'subjectAltName', altNames }]
    });
    fs.writeFileSync(certPath, pems.cert);
    fs.writeFileSync(keyPath, pems.private);
    if (log) log.info('Generated self-signed SSL certs (selfsigned package)');
    return { cert: pems.cert, key: pems.private };
}

module.exports = { getSSLCredentials, getLocalIPs };
