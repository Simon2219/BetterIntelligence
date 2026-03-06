import { evaluateAgentModelHealth } from '../../utils/modelHealth.js';

export function getHubAgentHealth(agent, escapeHtml) {
    const health = evaluateAgentModelHealth(agent);
    const cardClass = health.state === 'error'
        ? 'agent-card--model-error'
        : health.state === 'warning'
            ? 'agent-card--model-warning'
            : '';
    const indicator = health.state === 'ok'
        ? `<span class="agent-health-indicator agent-health-indicator--ok" title="${escapeHtml(health.summaryText)}"><span class="agent-health-indicator__dot"></span>Ready</span>`
        : health.state === 'warning'
            ? `<span class="agent-health-indicator agent-health-indicator--warning" title="${escapeHtml(health.summaryText)}"><span class="agent-health-indicator__dot"></span>Partial</span>`
            : health.state === 'error'
                ? `<span class="agent-health-indicator agent-health-indicator--error" title="${escapeHtml(health.summaryText)}"><span class="agent-health-indicator__dot"></span>Unavailable</span>`
                : `<span class="agent-health-indicator agent-health-indicator--unknown" title="${escapeHtml(health.summaryText)}"><span class="agent-health-indicator__dot"></span>No model</span>`;
    const notice = health.state === 'warning'
        ? `<div class="agent-model-notice agent-model-notice--warning">${escapeHtml(health.summaryText)}</div>`
        : health.state === 'error'
            ? `<div class="agent-model-notice agent-model-notice--error">${escapeHtml(health.summaryText)}</div>`
            : '';
    return { health, cardClass, indicator, notice };
}
