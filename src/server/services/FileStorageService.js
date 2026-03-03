/**
 * FileStorageService - Abstraction layer for file storage
 *
 * Backed by local filesystem. Supports media and logs.
 * When migrating to cloud storage, implement same interface and swap in.
 * Paths are relative to the configured base path.
 */

const fs = require('fs');
const path = require('path');

class FileStorageService {
    constructor(basePath) {
        this._basePath = path.resolve(basePath);
        if (!fs.existsSync(this._basePath)) fs.mkdirSync(this._basePath, { recursive: true });
    }

    _ensureDir(filePath) {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }

    _resolve(relativePath) {
        const full = path.resolve(this._basePath, String(relativePath || ''));
        const rel = path.relative(this._basePath, full);
        if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Path traversal not allowed');
        return full;
    }

    write(relativePath, content) {
        const fullPath = this._resolve(relativePath);
        this._ensureDir(fullPath);
        fs.writeFileSync(fullPath, content);
    }

    append(relativePath, content) {
        const fullPath = this._resolve(relativePath);
        this._ensureDir(fullPath);
        fs.appendFileSync(fullPath, content);
    }

    read(relativePath) {
        const fullPath = this._resolve(relativePath);
        if (!fs.existsSync(fullPath)) return null;
        return fs.readFileSync(fullPath);
    }

    exists(relativePath) {
        const fullPath = this._resolve(relativePath);
        return fs.existsSync(fullPath);
    }

    delete(relativePath) {
        const fullPath = this._resolve(relativePath);
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    }

    list(prefix = '') {
        const dir = prefix ? this._resolve(prefix) : this._basePath;
        if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
        const results = [];
        const walk = (d, rel) => {
            const entries = fs.readdirSync(d, { withFileTypes: true });
            for (const e of entries) {
                const r = rel ? `${rel}/${e.name}` : e.name;
                if (e.isDirectory()) walk(path.join(d, e.name), r);
                else results.push(r);
            }
        };
        walk(dir, prefix);
        return results;
    }

    getBasePath() {
        return this._basePath;
    }
}

module.exports = FileStorageService;
