let db = null;

function setDb(nextDb) {
    db = nextDb;
}

function getDb() {
    if (!db) throw new Error('Database not initialized');
    return db;
}

function clearDb() {
    db = null;
}

module.exports = {
    setDb,
    getDb,
    clearDb
};
