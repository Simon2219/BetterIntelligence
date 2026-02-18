const os = require('os');
const fs = require('fs');
const path = require('path');
const selfsigned = require('selfsigned');

function getLocalIPs() {
    const ips = [];
    for (const ifaces of Object.values(os.networkInterfaces())) {
        for (const i of ifaces || []) {
            if (i.family === 'IPv4' && !i.internal) ips.push(i.address);
        }
    }
    return ips;
}

async function getSSLCredentials(projectRoot, log) {
    const certsDir = path.join(projectRoot, 'certs');
    const certPath = path.join(certsDir, 'cert.pem');
    const keyPath = path.join(certsDir, 'key.pem');

    if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
        return { cert: fs.readFileSync(certPath, 'utf8'), key: fs.readFileSync(keyPath, 'utf8') };
    }

    fs.mkdirSync(certsDir, { recursive: true });
    const attrs = [{ name: 'commonName', value: 'localhost' }];
    const altNames = [{ type: 2, value: 'localhost' }, { type: 7, ip: '127.0.0.1' }, ...getLocalIPs().map(ip => ({ type: 7, ip }))];
    const pems = selfsigned.generate(attrs, { days: 365, keySize: 2048, extensions: [{ name: 'subjectAltName', altNames }] });
    fs.writeFileSync(certPath, pems.cert);
    fs.writeFileSync(keyPath, pems.private);
    if (log) log.info('Generated self-signed SSL certs');
    return { cert: pems.cert, key: pems.private };
}

module.exports = { getSSLCredentials, getLocalIPs };
