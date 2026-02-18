/**
 * Seed - Default admin user for BetterIntelligence
 */
const bcrypt = require('bcryptjs');
const { UserSystem } = require('./Database');

async function seedAdminUser(log) {
    const email = process.env.ADMIN_EMAIL || 'admin@betterintelligence.com';
    if (UserSystem.getByEmail(email)) return;

    if (log) log.info('Creating default admin user');
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'AdminPass123!', 12);
    UserSystem.create({
        email,
        username: process.env.ADMIN_USERNAME || 'admin',
        displayName: 'Admin',
        passwordHash: hash,
        roleId: 2, // Admin
        settings: { theme: 'dark' }
    });
    if (log) log.info('Admin user created', { email });
}

module.exports = { seedAdminUser };
