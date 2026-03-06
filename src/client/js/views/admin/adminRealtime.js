export function createAdminRealtimeController({ uiState, getSocketClients }) {
    let adminRealtimeSocket = null;
    let adminRealtimeBound = false;
    let modelRealtimeRefreshTimer = null;

    function scheduleModelsRealtimeRefresh(content, renderModelsTab) {
        if (modelRealtimeRefreshTimer) window.clearTimeout(modelRealtimeRefreshTimer);
        modelRealtimeRefreshTimer = window.setTimeout(async () => {
            if (uiState.activeTab !== 'models') return;
            try {
                await renderModelsTab(content);
            } catch (error) {
                console.warn('Failed to refresh models tab from realtime update', error);
            }
        }, 220);
    }

    function bindModelsRealtime(content, renderModelsTab) {
        if (typeof getSocketClients !== 'function') return;
        const clients = getSocketClients();
        const socket = clients?.getAdminSocket?.();
        if (!socket) return;

        if (adminRealtimeSocket !== socket) {
            adminRealtimeSocket = socket;
            adminRealtimeBound = false;
        }

        if (adminRealtimeBound) {
            socket.emit('admin:model_status:subscribe', {});
            return;
        }

        adminRealtimeBound = true;
        socket.on('connect', () => socket.emit('admin:model_status:subscribe', {}));
        socket.on('admin:model_status:update', () => scheduleModelsRealtimeRefresh(content, renderModelsTab));
        socket.on('admin:model_usage:update', () => scheduleModelsRealtimeRefresh(content, renderModelsTab));
        socket.on('admin:provider_status:update', () => scheduleModelsRealtimeRefresh(content, renderModelsTab));
        socket.emit('admin:model_status:subscribe', {});
    }

    function unsubscribeModelsRealtime() {
        adminRealtimeSocket?.emit('admin:model_status:unsubscribe', {});
    }

    return {
        bindModelsRealtime,
        unsubscribeModelsRealtime
    };
}
