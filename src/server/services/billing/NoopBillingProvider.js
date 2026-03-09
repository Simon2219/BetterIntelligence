class NoopBillingProvider {
    getName() {
        return 'noop';
    }

    async createCheckoutSession() {
        throw new Error('Billing is not enabled');
    }

    async cancelSubscription() {
        return { ok: true, cancelled: false, mode: 'manual' };
    }

    async handleWebhook() {
        return { ok: true, mode: 'manual' };
    }

    async syncSubscriptionState() {
        return { ok: true, mode: 'manual' };
    }

    async getCustomerPortalUrl() {
        return null;
    }
}

module.exports = NoopBillingProvider;
