const { run, get } = require('../core/query');

const { listMigrations } = require('./registry');

function ensureMigrationsTable() {
    run(`CREATE TABLE IF NOT EXISTS _migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        applied_at TEXT DEFAULT (datetime('now'))
    )`);
}

function hasMigration(name) {
    return !!get('SELECT id FROM _migrations WHERE name = ?', [name]);
}

function applyMigration(name, up) {
    if (hasMigration(name)) return false;
    up();
    run('INSERT INTO _migrations (name) VALUES (?)', [name]);
    return true;
}

function runRegisteredMigrations() {
    ensureMigrationsTable();
    const migrations = listMigrations();
    migrations.forEach((migration) => {
        applyMigration(`${migration.id}_${migration.name}`, migration.up);
    });
}

module.exports = {
    ensureMigrationsTable,
    hasMigration,
    applyMigration,
    runRegisteredMigrations,
    listMigrations
};
