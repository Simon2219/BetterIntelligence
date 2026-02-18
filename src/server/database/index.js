const Database = require('./Database');
module.exports = {
    initializeDatabase: Database.initDb,
    shutdown: Database.shutdown,
    ...Database
};
