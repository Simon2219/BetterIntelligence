const { get } = require('./query');

function generateId(len = 8) {
    const cs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let r = '';
    for (let i = 0; i < len; i++) r += cs.charAt(Math.floor(Math.random() * cs.length));
    return r;
}

function generateUserId() {
    for (let attempt = 0; attempt < 50; attempt++) {
        const id = generateId(6);
        if (!get('SELECT id FROM users WHERE UPPER(id) = ?', [id])) return id;
    }
    return generateId(10);
}

module.exports = {
    generateId,
    generateUserId
};
