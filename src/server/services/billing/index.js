const Config = require('../../../../config/Config');
const NoopBillingProvider = require('./NoopBillingProvider');

let provider;

function getBillingProvider() {
    if (provider) return provider;
    const configured = String(Config.get('billing.provider', 'none') || 'none').trim().toLowerCase();
    if (configured === 'stripe') {
        provider = new NoopBillingProvider();
        return provider;
    }
    provider = new NoopBillingProvider();
    return provider;
}

module.exports = {
    getBillingProvider
};
