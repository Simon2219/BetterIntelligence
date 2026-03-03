const { getDb } = require('./dbState');

function transaction(fn) {
    const db = getDb();
    const tx = db.transaction(fn);
    return tx();
}

module.exports = {
    transaction
};
