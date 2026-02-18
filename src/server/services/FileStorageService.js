const fs = require('fs');
const path = require('path');

class FileStorageService {
    constructor(basePath) {
        this._base = path.resolve(basePath);
        if (!fs.existsSync(this._base)) fs.mkdirSync(this._base, { recursive: true });
    }
    _resolve(rel) {
        const full = path.join(this._base, rel);
        if (!path.resolve(full).startsWith(path.resolve(this._base))) throw new Error('Path traversal');
        return full;
    }
    _ensureDir(p) { const d = path.dirname(p); if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }
    write(rel, content) { const p = this._resolve(rel); this._ensureDir(p); fs.writeFileSync(p, content); }
    append(rel, content) { const p = this._resolve(rel); this._ensureDir(p); fs.appendFileSync(p, content); }
    read(rel) { const p = this._resolve(rel); return fs.existsSync(p) ? fs.readFileSync(p) : null; }
    exists(rel) { return fs.existsSync(this._resolve(rel)); }
    delete(rel) { const p = this._resolve(rel); if (fs.existsSync(p)) fs.unlinkSync(p); }
}

module.exports = FileStorageService;
