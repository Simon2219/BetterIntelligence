function ignoreDuplicateColumnError(err) {
    if (!err) return;
    if (/duplicate column name/i.test(String(err.message || ''))) return;
    throw err;
}

module.exports = {
    ignoreDuplicateColumnError
};
