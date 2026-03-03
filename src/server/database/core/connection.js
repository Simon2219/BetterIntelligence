const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const Config = require('../../../../config/Config');
const log = require('../../services/Logger')('db');
const { setDb, getDb, clearDb } = require('./dbState');
const { run, get } = require('./query');

async function seedDefaults() {
    const rc = get('SELECT COUNT(*) as c FROM roles');
    if (rc.c > 0) return;

    log.info('Seeding default roles');
    run(`INSERT INTO roles (name, is_admin) VALUES ('User', 0), ('Admin', 1)`);
}

async function initDb() {
    const rawPath = Config.get('db.path', './data/db/betterintelligence.db');
    const dbPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);

    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const db = new Database(dbPath);
    db.pragma('journal_mode=WAL');
    db.pragma('foreign_keys=ON');
    setDb(db);

    const migrations = require('../migrations');
    migrations.runRegisteredMigrations();
    await seedDefaults();

    log.info('Database ready', { path: dbPath });
    return db;
}

function shutdown() {
    try {
        const db = getDb();
        db.close();
    } catch {
        // no-op: db not initialized or already closed
    } finally {
        clearDb();
        log.info('Database shutdown');
    }
}

module.exports = {
    initDb,
    shutdown
};
