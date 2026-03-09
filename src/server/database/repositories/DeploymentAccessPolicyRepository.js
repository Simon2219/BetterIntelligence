const { run, get } = require('../core/query');

function parseJson(value, fallback) {
    try {
        return JSON.parse(value || 'null') ?? fallback;
    } catch {
        return fallback;
    }
}

function normalize(row) {
    if (!row) return null;
    return {
        ...row,
        metadata: parseJson(row.metadata, {})
    };
}

const DeploymentAccessPolicyRepository = {
    getByDeploymentId(deploymentId) {
        return normalize(get('SELECT * FROM deployment_access_policies WHERE deployment_id = ?', [deploymentId]));
    },

    upsert(deploymentId, updates = {}) {
        const existing = this.getByDeploymentId(deploymentId);
        if (!existing) {
            run(`INSERT INTO deployment_access_policies (
                deployment_id, consumer_access_mode, pinned_revision_id, sponsor_grant_id, metadata
            ) VALUES (?, ?, ?, ?, ?)`, [
                deploymentId,
                updates.consumerAccessMode || 'internal_only',
                updates.pinnedRevisionId || null,
                updates.sponsorGrantId || null,
                JSON.stringify(updates.metadata || {})
            ]);
            return this.getByDeploymentId(deploymentId);
        }

        const sets = [];
        const values = [];
        if (updates.consumerAccessMode !== undefined) {
            sets.push('consumer_access_mode = ?');
            values.push(updates.consumerAccessMode);
        }
        if (updates.pinnedRevisionId !== undefined) {
            sets.push('pinned_revision_id = ?');
            values.push(updates.pinnedRevisionId || null);
        }
        if (updates.sponsorGrantId !== undefined) {
            sets.push('sponsor_grant_id = ?');
            values.push(updates.sponsorGrantId || null);
        }
        if (updates.metadata !== undefined) {
            sets.push('metadata = ?');
            values.push(JSON.stringify(updates.metadata || {}));
        }
        if (!sets.length) return existing;
        sets.push("updated_at = datetime('now')");
        values.push(deploymentId);
        run(`UPDATE deployment_access_policies SET ${sets.join(', ')} WHERE deployment_id = ?`, values);
        return this.getByDeploymentId(deploymentId);
    }
};

module.exports = DeploymentAccessPolicyRepository;
