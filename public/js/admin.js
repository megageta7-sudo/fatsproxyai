const $ = (id) => document.getElementById(id);

const state = {
    token: localStorage.getItem('admin_token') || '',
    config: null,
    healthData: null,
    activeMainTab: 'health',
    activeKeyProvider: 'groq',
    healthPollInterval: null
};

const providers = ['groq', 'gemini', 'mistral', 'nvidia', 'xkiro'];

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    $('toast-container').appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function api(path, method = 'GET', body = null) {
    const headers = {
        'x-admin-token': state.token,
        'Content-Type': 'application/json'
    };
    
    try {
        const res = await fetch(path, {
            method,
            headers,
            body: body ? JSON.stringify(body) : null
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || data.message || 'Request failed');
        return data;
    } catch (err) {
        if (err.message && err.message.toLowerCase().includes('admin token')) {
            logout();
        }
        showToast(err.message, 'error');
        throw err;
    }
}

// ─── AUTHENTICATION & SESSION ───
if (state.token) {
    $('admin-token').value = state.token;
    initializeSession();
}

$('load-config-btn').addEventListener('click', () => {
    state.token = $('admin-token').value.trim();
    if (!state.token) return showToast('Please enter ADMIN_TOKEN', 'error');
    localStorage.setItem('admin_token', state.token);
    initializeSession();
});

$('logout-btn').addEventListener('click', logout);

function logout() {
    state.token = '';
    localStorage.removeItem('admin_token');
    if (state.healthPollInterval) clearInterval(state.healthPollInterval);
    $('login-section').classList.remove('hidden');
    $('admin-content').classList.add('hidden');
    $('logout-btn').classList.add('hidden');
    $('status-dot').className = 'dot';
    $('status-text').textContent = 'Disconnected';
}

async function initializeSession() {
    $('status-dot').className = 'dot';
    $('status-text').textContent = 'Connecting...';

    try {
        const configData = await api('/api/admin/config');
        state.config = configData.config;

        $('login-section').classList.add('hidden');
        $('admin-content').classList.remove('hidden');
        $('logout-btn').classList.remove('hidden');
        $('status-dot').className = 'dot success';
        $('status-text').textContent = 'Connected';

        // Initial Data Load
        await loadHealth();
        renderRotationOrder();

        // Start 30s background polling for health & alerts
        if (state.healthPollInterval) clearInterval(state.healthPollInterval);
        state.healthPollInterval = setInterval(loadHealth, 30000);
    } catch (err) {
        $('status-dot').className = 'dot error';
        $('status-text').textContent = 'Unauthorized';
    }
}

// ─── TAB NAVIGATION ───
document.querySelectorAll('.main-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.main-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));

        btn.classList.add('active');
        const tab = btn.dataset.tab;
        state.activeMainTab = tab;

        const panel = $(`tab-${tab}`);
        if (panel) panel.classList.remove('hidden');

        if (tab === 'health') loadHealth();
        if (tab === 'keys') renderKeyStudio();
        if (tab === 'logs') loadLogs();
        if (tab === 'extensions') renderExtensions();
        if (tab === 'stats') loadStats();
    });
});

// ─── TAB 1: HEALTH MONITORING & ALERTS ───
async function loadHealth() {
    try {
        const res = await api('/api/admin/health');
        state.healthData = res;

        // Render Summary
        const s = res.summary;
        $('health-total-keys').textContent = s.totalKeys;
        $('health-healthy-keys').textContent = s.healthyKeys;
        $('health-cooldown-keys').textContent = s.rateLimitedKeys;
        $('health-invalid-keys').textContent = s.invalidKeys;

        // Render Alerts
        renderAlerts(res.alerts || []);

        // Render Provider Matrix
        renderProviderMatrix(res.providers);
    } catch (e) {
        console.warn('Failed to load health status:', e);
    }
}

function renderAlerts(alerts) {
    const badge = $('alert-badge');
    const drawerList = $('alert-drawer-list');

    if (alerts.length > 0) {
        badge.textContent = alerts.length;
        badge.classList.remove('hidden');

        drawerList.innerHTML = '';
        alerts.forEach(a => {
            const item = document.createElement('div');
            item.className = `alert-item ${a.type === 'INVALID_KEY' ? 'alert-error' : ''}`;
            item.innerHTML = `
                <h5>
                    <span>${escapeHtml(a.provider.toUpperCase())} (${escapeHtml(a.keyPreview)})</span>
                    <span class="mono">${new Date(a.timestamp).toLocaleTimeString()}</span>
                </h5>
                <p>${escapeHtml(a.message)}</p>
            `;
            drawerList.appendChild(item);
        });
    } else {
        badge.classList.add('hidden');
        drawerList.innerHTML = `<div class="alert-empty">No active alerts. All systems running smooth.</div>`;
    }
}

// Alert Drawer Toggle
$('alert-bell-btn').addEventListener('click', () => {
    $('alert-drawer').classList.toggle('hidden');
});
$('close-alert-drawer-btn').addEventListener('click', () => {
    $('alert-drawer').classList.add('hidden');
});
$('refresh-btn').addEventListener('click', async () => {
    showToast('Refreshing system status...');
    await loadHealth();
    if (state.activeMainTab === 'logs') loadLogs();
});

function renderProviderMatrix(provs) {
    const matrix = $('provider-matrix');
    matrix.innerHTML = '';

    providers.forEach(p => {
        const info = provs[p] || { name: p, model: 'unknown', status: 'no_keys', keyCount: 0, keys: [] };
        const card = document.createElement('div');
        card.className = 'provider-card fade-in';

        const keysHtml = info.keys.map(k => `
            <div class="mini-key-row">
                <span class="mono">${escapeHtml(k.preview)}</span>
                <span class="key-id-tag mono">${escapeHtml(k.id)}</span>
                <span class="status-pill ${k.status}">${k.status === 'rate_limited' ? `Cooldown (${k.cooldownRemaining}s)` : k.status}</span>
            </div>
        `).join('') || '<div class="text-dim" style="font-size:0.82rem">No keys configured</div>';

        card.innerHTML = `
            <div class="provider-card-header">
                <span class="provider-card-title">${escapeHtml(p)}</span>
                <span class="status-pill ${info.status}">${info.status.replace('_', ' ')}</span>
            </div>
            <div class="provider-meta">
                Model: <code>${escapeHtml(info.model)}</code> • Keys: <strong>${info.keyCount}</strong>
            </div>
            <div class="mini-key-list">
                ${keysHtml}
            </div>
        `;
        matrix.appendChild(card);
    });
}

// ─── TAB 2: KEY MANAGEMENT STUDIO ───
document.querySelectorAll('.sub-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.activeKeyProvider = btn.dataset.provider;
        renderKeyStudio();
    });
});

async function renderKeyStudio() {
    const p = state.activeKeyProvider;
    const providerConfig = state.config?.[p] || { model: '', keys: [], keyItems: [] };
    
    $('current-provider-model').value = providerConfig.model || '';

    // Fetch latest health status to display accurate pills
    let keyHealthMap = {};
    if (state.healthData?.providers?.[p]?.keys) {
        state.healthData.providers[p].keys.forEach(k => {
            keyHealthMap[k.id] = k;
        });
    }

    const tbody = $('keys-table-body');
    tbody.innerHTML = '';

    const keys = providerConfig.keyItems || [];

    if (keys.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-dim" style="padding: 2rem;">No keys found for ${p.toUpperCase()}. Click "+ Add New Key" to create one.</td></tr>`;
        return;
    }

    keys.forEach(k => {
        const live = keyHealthMap[k.id] || { status: k.active ? 'healthy' : 'disabled', cooldownRemaining: 0, latencyMs: null };
        const statusLabel = live.status === 'rate_limited' ? `Cooldown (${live.cooldownRemaining}s)` : live.status;
        const latencyText = live.latencyMs ? `${live.latencyMs}ms` : '—';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><code class="mono">${escapeHtml(k.preview)}</code></td>
            <td><span class="key-id-tag mono">${escapeHtml(k.id)}</span></td>
            <td><span class="status-pill ${live.status}">${statusLabel}</span></td>
            <td><span class="mono text-dim">${latencyText}</span></td>
            <td>
                <div style="display:flex; gap:0.4rem;">
                    <button class="secondary-btn compact-btn" onclick="runDiagnosticTest('${p}', '${k.id}')">Test</button>
                    <button class="secondary-btn compact-btn" onclick="openEditKeyModal('${p}', '${k.id}')">Edit</button>
                    <button class="secondary-btn compact-btn" onclick="toggleKeyActive('${p}', '${k.id}', ${!k.active})">${k.active ? 'Disable' : 'Enable'}</button>
                    <button class="secondary-btn compact-btn danger-btn" onclick="deleteKeyId('${p}', '${k.id}')">Delete</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Key Actions
window.runDiagnosticTest = async (provider, keyId) => {
    showToast(`Testing ${provider} key...`);
    try {
        const res = await api('/api/admin/keys', 'POST', { action: 'test', provider, keyId });
        if (res.ok) {
            showToast(`✓ Valid (${res.latencyMs}ms)`, 'success');
        } else if (res.status === 'model_error') {
            showToast(`⚠ Model Error: ${res.message}`, 'warning');
        } else if (res.status === 'rate_limited') {
            showToast(`⏳ Rate Limited: ${res.message}`, 'warning');
        } else {
            showToast(`✗ Failed: ${res.message}`, 'error');
        }
        // Refresh health immediately so status pills update after diagnostic
        await loadHealth();
        renderKeyStudio();
    } catch (e) {}
};

window.openEditKeyModal = (provider, keyId) => {
    $('modal-edit-key-id').value = keyId;
    $('modal-edit-key-id').dataset.provider = provider;
    $('modal-edit-key-input').value = '';
    $('edit-key-modal').classList.remove('hidden');
};

$('modal-edit-cancel-btn').addEventListener('click', () => {
    $('edit-key-modal').classList.add('hidden');
});

$('modal-edit-submit-btn').addEventListener('click', async () => {
    const keyId = $('modal-edit-key-id').value;
    const provider = $('modal-edit-key-id').dataset.provider;
    const newKey = $('modal-edit-key-input').value.trim();

    if (!newKey) return showToast('Please enter new key value', 'error');

    try {
        const res = await api('/api/admin/keys', 'POST', { action: 'update', provider, keyId, key: newKey });
        $('edit-key-modal').classList.add('hidden');
        showToast('Key updated successfully');
        
        // Refresh local config keyItems
        state.config[provider].keyItems = res.keys;
        renderKeyStudio();
        loadHealth();
    } catch (e) {}
});

window.toggleKeyActive = async (provider, keyId, newActive) => {
    try {
        const res = await api('/api/admin/keys', 'POST', { action: 'toggle', provider, keyId, active: newActive });
        showToast(res.message);
        state.config[provider].keyItems = res.keys;
        renderKeyStudio();
        loadHealth();
    } catch (e) {}
};

window.deleteKeyId = async (provider, keyId) => {
    if (!confirm(`Are you sure you want to permanently delete key ${keyId}?`)) return;

    try {
        const res = await api('/api/admin/keys', 'POST', { action: 'delete', provider, keyId });
        showToast('Key deleted successfully');
        state.config[provider].keyItems = res.keys;
        renderKeyStudio();
        loadHealth();
    } catch (e) {}
};

// Add Key Modal
$('add-key-modal-btn').addEventListener('click', () => {
    $('modal-add-provider').value = state.activeKeyProvider;
    $('modal-add-key-input').value = '';
    $('add-key-modal').classList.remove('hidden');
});

$('modal-add-cancel-btn').addEventListener('click', () => {
    $('add-key-modal').classList.add('hidden');
});

$('modal-add-submit-btn').addEventListener('click', async () => {
    const provider = $('modal-add-provider').value;
    const rawKey = $('modal-add-key-input').value.trim();

    if (!rawKey) return showToast('Please paste a key', 'error');

    try {
        const res = await api('/api/admin/keys', 'POST', { action: 'add', provider, key: rawKey });
        $('add-key-modal').classList.add('hidden');
        showToast(`Key added with ID ${res.keyId}`);
        state.config[provider].keyItems = res.keys;
        renderKeyStudio();
        loadHealth();
    } catch (e) {}
});

// Save Model setting
$('save-model-btn').addEventListener('click', async () => {
    const p = state.activeKeyProvider;
    const newModel = $('current-provider-model').value.trim();
    if (!newModel) return showToast('Model name cannot be empty', 'error');

    state.config[p].model = newModel;
    await api('/api/admin/config', 'POST', {
        [p]: { model: newModel }
    });
    showToast(`${p.toUpperCase()} model updated to ${newModel}`);
    loadHealth();
});

// Diagnostic Test All
$('test-all-provider-keys-btn').addEventListener('click', async () => {
    const p = state.activeKeyProvider;
    const keys = state.config?.[p]?.keyItems || [];
    if (keys.length === 0) return showToast('No keys to test', 'error');

    showToast(`Running diagnostic test on ${keys.length} keys...`);
    for (const k of keys) {
        await window.runDiagnosticTest(p, k.id);
    }
});

// Provider Order Drag & Drop
function renderRotationOrder() {
    const orderList = $('provider-order');
    orderList.innerHTML = '';
    (state.config?.providerOrder || providers).forEach(id => {
        const item = document.createElement('div');
        item.className = 'sort-item';
        item.dataset.id = id;
        item.draggable = true;
        item.innerHTML = `${id.toUpperCase()} <span>⠿</span>`;
        orderList.appendChild(item);
    });
    setupDragAndDrop();
}

function setupDragAndDrop() {
    const sortableList = $('provider-order');
    let dragItem = null;

    sortableList.querySelectorAll('.sort-item').forEach(item => {
        item.addEventListener('dragstart', (e) => {
            dragItem = e.target.closest('.sort-item');
            if (dragItem) dragItem.classList.add('dragging');
        });
        item.addEventListener('dragend', (e) => {
            e.target.classList.remove('dragging');
        });
    });

    sortableList.addEventListener('dragover', (e) => {
        e.preventDefault();
        const afterElement = getDragAfterElement(sortableList, e.clientY);
        if (afterElement == null) {
            sortableList.appendChild(dragItem);
        } else {
            sortableList.insertBefore(dragItem, afterElement);
        }
    });
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.sort-item:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

$('save-order-btn').addEventListener('click', async () => {
    const newOrder = Array.from($('provider-order').children).map(el => el.dataset.id);
    await api('/api/admin/config', 'POST', { providerOrder: newOrder });
    state.config.providerOrder = newOrder;
    showToast('Rotation order updated');
});

// ─── TAB 3: TELEMETRY LOGS ───
$('reload-logs-btn').addEventListener('click', loadLogs);

async function loadLogs() {
    const tbody = $('logs-table-body');
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-dim">Loading logs from Supabase...</td></tr>';

    const provider = $('log-provider-filter').value;
    const status = $('log-status-filter').value;

    let query = `/api/logs?limit=50`;
    if (provider) query += `&provider=${encodeURIComponent(provider)}`;
    if (status) query += `&status=${encodeURIComponent(status)}`;

    try {
        const data = await api(query);
        const logs = data.logs || [];

        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-dim" style="padding:2rem;">No telemetry logs found.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        logs.forEach(l => {
            const tr = document.createElement('tr');
            tr.className = 'clickable-row';
            tr.title = 'Click to view attempts waterfall';

            const statusClass = l.status >= 200 && l.status < 300 ? 'text-green' : 'text-red';
            const latencyText = l.latencyMs !== undefined ? `${l.latencyMs}ms` : '—';
            const reqShort = (l.requestId || l.id || '').slice(0, 12);

            tr.innerHTML = `
                <td class="mono text-dim" style="font-size:0.8rem">${new Date(l.time).toLocaleTimeString()}</td>
                <td><code class="mono" style="color:var(--accent-cyan)">${escapeHtml(reqShort)}</code></td>
                <td>${escapeHtml(l.path || '/api/generate')}</td>
                <td><strong style="text-transform:uppercase">${escapeHtml(l.provider || '—')}</strong></td>
                <td><span class="key-id-tag mono">${escapeHtml(l.keyId || l.keyPreview || '—')}</span></td>
                <td><span class="${statusClass} mono font-bold">${l.status}</span></td>
                <td class="mono">${latencyText}</td>
                <td><span class="status-pill operational mono">${l.attemptsCount || 1} att</span></td>
            `;

            tr.addEventListener('click', () => openAttemptsModal(l.requestId));
            tbody.appendChild(tr);
        });
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-red">Failed to load logs: ${e.message}</td></tr>`;
    }
}

async function openAttemptsModal(requestId) {
    if (!requestId) return;

    $('attempts-modal-req-id').textContent = requestId;
    const list = $('attempts-modal-list');
    list.innerHTML = '<div class="text-center text-dim">Loading attempt waterfall...</div>';
    $('attempts-modal').classList.remove('hidden');

    try {
        const res = await api(`/api/logs?requestId=${encodeURIComponent(requestId)}`);
        const attempts = res.attempts || [];

        if (attempts.length === 0) {
            list.innerHTML = '<div class="text-center text-dim">No detailed attempt rows found for this request.</div>';
            return;
        }

        list.innerHTML = '';
        attempts.forEach(att => {
            const card = document.createElement('div');
            card.className = `attempt-card ${att.is_success ? 'attempt-success' : 'attempt-fail'}`;
            card.innerHTML = `
                <div>
                    <div><strong>Attempt #${att.attempt_number}: ${escapeHtml(att.provider.toUpperCase())}</strong> <span class="text-dim">(${escapeHtml(att.model)})</span></div>
                    <div class="text-dim" style="margin-top:0.25rem;">Key: <code class="mono">${escapeHtml(att.key_id || att.key_preview)}</code> • Latency: <span class="mono">${att.latency_ms}ms</span></div>
                    ${att.error_message ? `<div class="text-red" style="font-size:0.8rem; margin-top:0.25rem;">${escapeHtml(att.error_message)}</div>` : ''}
                </div>
                <div>
                    <span class="status-pill ${att.is_success ? 'operational' : 'degraded'} mono">${att.status_code || att.error_code || (att.is_success ? '200' : 'ERROR')}</span>
                </div>
            `;
            list.appendChild(card);
        });
    } catch (e) {
        list.innerHTML = `<div class="text-red">Error fetching attempts: ${e.message}</div>`;
    }
}

$('close-attempts-modal-btn').addEventListener('click', () => {
    $('attempts-modal').classList.add('hidden');
});

// ─── TAB 4: EXTENSIONS ───
function renderExtensions() {
    const list = $('extension-list');
    list.innerHTML = '';
    (state.config?.extensionKeys || []).forEach(key => {
        const item = document.createElement('div');
        item.className = 'mini-key-row';
        item.style.padding = '0.75rem 1rem';
        item.innerHTML = `
            <div>
                <strong>${escapeHtml(key.label)}</strong> ${key.email ? `<small class="text-dim">(${escapeHtml(key.email)})</small>` : ''}
                <div class="text-dim mono" style="font-size:0.75rem">Last Used: ${key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : 'Never'}</div>
            </div>
            <div style="display:flex; gap:0.5rem; align-items:center;">
                <span class="status-pill ${key.active ? 'operational' : 'offline'}">${key.active ? 'Active' : 'Disabled'}</span>
                <button class="secondary-btn compact-btn" onclick="toggleExtKey('${key.id}', ${!key.active})">${key.active ? 'Disable' : 'Enable'}</button>
                <button class="secondary-btn compact-btn danger-btn" onclick="deleteExtKey('${key.id}')">Delete</button>
            </div>
        `;
        list.appendChild(item);
    });
}

$('gen-ext-key-btn').addEventListener('click', async () => {
    const label = $('new-ext-name').value.trim();
    const email = $('new-ext-email').value.trim();
    if (!label) return showToast('Please enter a label', 'error');

    const data = await api('/api/admin/extension-key', 'POST', { action: 'create', label, email });
    state.config.extensionKeys = data.keys;

    $('new-key-value').textContent = data.token;
    $('new-key-display').classList.remove('hidden');
    $('new-ext-name').value = '';
    $('new-ext-email').value = '';
    renderExtensions();
    showToast('New token generated');
});

window.toggleExtKey = async (id, active) => {
    const data = await api('/api/admin/extension-key', 'POST', { action: 'setActive', id, active });
    state.config.extensionKeys = data.keys;
    renderExtensions();
};

window.deleteExtKey = async (id) => {
    if (!confirm('Delete this extension token?')) return;
    const data = await api('/api/admin/extension-key', 'POST', { action: 'delete', id });
    state.config.extensionKeys = data.keys;
    renderExtensions();
};

// ─── TAB 5: STATS & CHARTS ───
let usageChart = null;

async function loadStats() {
    try {
        const data = await api('/api/admin/stats');
        const stats = data.stats;

        const total = stats.total || 0;
        const success = stats.status?.success || 0;
        const rate = total > 0 ? Math.round((success / total) * 100) : 0;

        $('stat-total').textContent = total.toLocaleString();
        $('stat-rate').textContent = rate + '%';
        $('stat-active-users').textContent = data.users.onlineToday.toLocaleString();

        renderUsageChart(stats.history || {});
    } catch (e) {}
}

function renderUsageChart(history) {
    const ctx = $('usageChart').getContext('2d');
    const labels = [];
    const successData = [];
    const errorData = [];

    for (let i = 13; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        labels.push(d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }));
        successData.push(history[dateStr]?.success || 0);
        errorData.push(history[dateStr]?.error || 0);
    }

    if (usageChart) usageChart.destroy();

    usageChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'Success', data: successData, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, tension: 0.35 },
                { label: 'Errors', data: errorData, borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', fill: true, tension: 0.35 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
            }
        }
    });
}
