/**
 * BaseProvider - Abstract interface for all AI service providers.
 */
class BaseProvider {
    constructor(config = {}) {
        if (new.target === BaseProvider) {
            throw new Error('BaseProvider is abstract – instantiate a subclass');
        }
        this.name = config.name || 'unknown';
        this.endpointUrl = config.endpointUrl || '';
        this.apiKey = config.apiKey || '';
        this.defaultModel = config.defaultModel || '';
        this.settings = config.settings || {};
    }

    getCapabilities() {
        return { text: false, image: false, video: false };
    }

    async generateText(messages, options = {}) {
        throw new Error(`${this.name}: generateText not implemented`);
    }

    async generateImage(prompt, options = {}) {
        throw new Error(`${this.name}: generateImage not implemented`);
    }

    async isAvailable() {
        return false;
    }

    async listModels() {
        return [];
    }
}

module.exports = BaseProvider;
