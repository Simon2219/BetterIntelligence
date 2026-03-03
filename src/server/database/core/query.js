const log = require('../../services/Logger')('db');
const { getDb } = require('./dbState');

function run(sql, params = []) {
    try {
        const db = getDb();
        return { changes: db.prepare(sql).run(...params).changes };
    } catch (e) {
        log.error('Run error', { err: e.message });
        throw e;
    }
}

function all(sql, params = []) {
    try {
        const db = getDb();
        return db.prepare(sql).all(...params);
    } catch (e) {
        log.error('All error', { err: e.message });
        throw e;
    }
}

function get(sql, params = []) {
    try {
        const db = getDb();
        return db.prepare(sql).get(...params);
    } catch (e) {
        log.error('Get error', { err: e.message });
        throw e;
    }
}

module.exports = {
    run,
    all,
    get
};
