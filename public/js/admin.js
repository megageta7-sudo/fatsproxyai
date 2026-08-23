const $ = (id) => document.getElementById(id);
const state = {
    token: localStorage.getItem('admin_token') || '',
    config: null,
    activeTab: 'groq',
    editingProviderKey: null
};

const providers = ['groq', 'gemini', 'mistral', 'nvidia', 'xkiro'];

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    $('toast-container').appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function escapeHtml(value) {
    return String(value)
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
        if (!res.ok) throw new Error(data.error?.message || 'Request failed');
        return data;
    } catch (err) {
        showToast(err.message, 'error');
        throw err;
    }
}

// Drag & Drop Logic
const sortableList = $('provider-order');
let dragItem = null;

sortableList.addEventListener('dragstart', (e) => {
    dragItem = e.target.closest('.sort-item');
    if (dragItem) dragItem.classList.add('dragging');
});

sortableList.addEventListener('dragend', (e) => {
    e.target.classList.remove('dragging');
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

// Config Loader
if (state.token) {
    $('admin-token').value = state.token;
    loadConfig();
}

$('load-config-btn').addEventListener('click', () => {
    state.token = $('admin-token').value.trim();
    localStorage.setItem('admin_token', state.token);
    loadConfig();
});

async function loadConfig() {
    $('status-dot').className = 'dot';
    $('status-text').textContent = 'Loading...';
    
    try {
        const data = await api('/api/admin/config');
        state.config = data.config;
        renderConfig();
        renderKeys();
        
        $('login-section').classList.add('hidden');
        $('admin-content').classList.remove('hidden');
        $('status-dot').className = 'dot success';
        $('status-text').textContent = 'Connected';
    } catch (err) {
        $('status-dot').className = 'dot error';
        $('status-text').textContent = 'Unauthorized';
    }
}

function renderConfig() {
    const c = state.config;
    $('groq-model').value = c.groq.model;
    $('gemini-model').value = c.gemini.model;
    $('mistral-model').value = c.mistral?.model || 'mistral-tiny';
    $('nvidia-model').value = c.nvidia?.model || 'mistralai/mistral-large-3-675b-instruct-2512';
    $('xkiro-model').value = c.xkiro?.model || 'google/gemini-2.5-flash';
    renderProviderKeyLists();
    
    // Render provider order
    const orderList = $('provider-order');
    orderList.innerHTML = '';
    c.providerOrder.forEach(id => {
        const item = document.createElement('div');
        item.className = 'sort-item';
        item.dataset.id = id;
        item.draggable = true;
        item.innerHTML = `${id.toUpperCase()} <span>⠿</span>`;
        orderList.appendChild(item);
    });
}

function providerKeys(provider) {
    if (!state.config?.[provider]) return [];
    if (!Array.isArray(state.config[provider].keys)) state.config[provider].keys = [];
    return state.config[provider].keys;
}

function renderProviderKeyLists() {
    providers.forEach(renderProviderKeyList);
}

function renderProviderKeyList(provider) {
    const list = $(`${provider}-key-list`);
    const keys = providerKeys(provider);
    list.innerHTML = '';

    if (keys.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'provider-key-empty';
        empty.textContent = 'No keys configured';
        list.appendChild(empty);
        return;
    }

    keys.forEach((key, index) => {
        const editing = state.editingProviderKey?.provider === provider && state.editingProviderKey?.index === index;
        const item = document.createElement('div');
        item.className = 'provider-key-item fade-in';

        if (editing) {
            item.innerHTML = `
                <input class="provider-key-input" type="password" value="${key.includes('...') ? '' : escapeHtml(key)}" placeholder="Paste replacement key">
                <div class="provider-key-actions">
                    <button class="secondary-btn compact-btn" type="button" onclick="saveProviderKeyEdit('${provider}', ${index})">Save</button>
                    <button class="secondary-btn compact-btn" type="button" onclick="cancelProviderKeyEdit()">Cancel</button>
                </div>
            `;
        } else {
            item.innerHTML = `
                <code class="provider-key-mask">${escapeHtml(key)}</code>
                <div class="provider-key-actions">
                    <button class="secondary-btn compact-btn" type="button" onclick="editProviderKey('${provider}', ${index})">Edit</button>
                    <button class="secondary-btn compact-btn danger-btn" type="button" onclick="deleteProviderKey('${provider}', ${index})">Delete</button>
                </div>
            `;
        }

        list.appendChild(item);
    });
}

function renderKeys() {
    const list = $('extension-list');
    list.innerHTML = '';
    state.config.extensionKeys.forEach(key => {
        const item = document.createElement('div');
        item.className = 'ext-item fade-in';
        item.innerHTML = `
            <div class="ext-info">
                <h4>${key.label} ${key.email ? `<small style="color:var(--accent-secondary)">(${key.email})</small>` : ''}</h4>
                <p>Created: ${new Date(key.createdAt).toLocaleDateString()}</p>
                <p>Last Used: ${key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : 'Never'}</p>
            </div>
            <div class="ext-actions">
                <button class="secondary-btn" onclick="testEndpointPrompt()">Test</button>
                <button class="secondary-btn" onclick="toggleKey('${key.id}', ${!key.active})">${key.active ? 'Disable' : 'Enable'}</button>
                <button class="secondary-btn" style="color: var(--error)" onclick="deleteKey('${key.id}')">Delete</button>
            </div>
        `;
        list.appendChild(item);
    });
}

$('save-provider-btn').addEventListener('click', async () => {
    const body = {
        groq: {
            keys: providerKeys('groq'),
            model: $('groq-model').value.trim()
        },
        gemini: {
            keys: providerKeys('gemini'),
            model: $('gemini-model').value.trim()
        },
        mistral: {
            keys: providerKeys('mistral'),
            model: $('mistral-model').value.trim()
        },
        nvidia: {
            keys: providerKeys('nvidia'),
            model: $('nvidia-model').value.trim()
        },
        xkiro: {
            keys: providerKeys('xkiro'),
            model: $('xkiro-model').value.trim()
        },
        providerOrder: Array.from($('provider-order').children).map(el => el.dataset.id)
    };
    
    const data = await api('/api/admin/config', 'POST', body);
    state.config = data.config;
    showToast('Configuration updated successfully');
    renderConfig();
});

window.addProviderKey = (provider) => {
    const input = $(`${provider}-new-key`);
    const value = input.value.trim();
    if (!value) return showToast('Please paste a key first', 'error');

    const keys = providerKeys(provider);
    if (keys.includes(value)) return showToast('Key already exists', 'error');

    keys.push(value);
    input.value = '';
    renderProviderKeyList(provider);
    showToast(`${provider.toUpperCase()} key added. Click Update Provider Config to save.`);
};

window.editProviderKey = (provider, index) => {
    state.editingProviderKey = { provider, index };
    renderProviderKeyList(provider);
};

window.cancelProviderKeyEdit = () => {
    const provider = state.editingProviderKey?.provider;
    state.editingProviderKey = null;
    if (provider) renderProviderKeyList(provider);
};

window.saveProviderKeyEdit = (provider, index) => {
    const row = $(`${provider}-key-list`).children[index];
    const input = row?.querySelector('.provider-key-input');
    const value = input?.value.trim();

    if (!value) return showToast('Paste the replacement key to edit this item', 'error');

    const keys = providerKeys(provider);
    keys[index] = value;
    state.editingProviderKey = null;
    renderProviderKeyList(provider);
    showToast(`${provider.toUpperCase()} key updated. Click Update Provider Config to save.`);
};

window.deleteProviderKey = (provider, index) => {
    if (!confirm(`Delete this ${provider.toUpperCase()} key?`)) return;
    providerKeys(provider).splice(index, 1);
    renderProviderKeyList(provider);
    showToast(`${provider.toUpperCase()} key deleted. Click Update Provider Config to save.`);
};

document.querySelectorAll('[data-add-provider]').forEach(btn => {
    btn.addEventListener('click', () => addProviderKey(btn.dataset.addProvider));
});

$('gen-ext-key-btn').addEventListener('click', async () => {
    const label = $('new-ext-name').value.trim();
    const email = $('new-ext-email').value.trim();
    if (!label) return showToast('Please enter a label', 'error');
    
    const data = await api('/api/admin/extension-key', 'POST', { action: 'create', label, email });
    state.config.extensionKeys = data.keys;
    
    $('new-key-value').textContent = data.token;
    $('new-key-display').innerHTML = `
        <span>New Token (copy now):</span>
        <code id="new-key-value">${data.token}</code>
        <button class="text-btn" style="margin-top:0.5rem" onclick="testEndpoint('${data.token}')">Test This Key Now</button>
    `;
    $('new-key-display').classList.remove('hidden');
    $('new-ext-name').value = '';
    $('new-ext-email').value = '';
    renderKeys();
    showToast('New extension key generated');
});

window.toggleKey = async (id, active) => {
    const data = await api('/api/admin/extension-key', 'POST', { action: 'setActive', id, active });
    state.config.extensionKeys = data.keys;
    renderKeys();
    showToast(`Key ${active ? 'enabled' : 'disabled'}`);
};

window.deleteKey = async (id) => {
    if (!confirm('Are you sure you want to delete this key?')) return;
    const data = await api('/api/admin/extension-key', 'POST', { action: 'delete', id });
    state.config.extensionKeys = data.keys;
    renderKeys();
    showToast('Key deleted');
};

// Test Keys Logic
async function testProviderKeys(provider) {
    const btn = $(`test-${provider}-btn`);
    const model = $(`${provider}-model`).value;
    const keys = providerKeys(provider).filter(k => k.trim());
    
    if (keys.length === 0) return showToast('No keys to test', 'error');
    
    btn.disabled = true;
    btn.textContent = 'Testing...';
    
    try {
        const data = await api('/api/admin/test-keys', 'POST', { provider, keys, model });
        const results = data.results;
        
        const validKeys = results.filter(r => r.status === 'valid' || r.status === 'skipped').map(r => r.key);
        const invalidCount = results.filter(r => r.status === 'invalid').length;
        
        if (invalidCount > 0) {
            const remove = confirm(`Found ${invalidCount} invalid keys. Would you like to remove them?`);
            if (remove) {
                state.config[provider].keys = validKeys;
                renderProviderKeyList(provider);
                showToast(`Removed ${invalidCount} invalid keys. Click Update Provider Config to save.`);
            } else {
                showToast(`Test complete: ${invalidCount} keys failed`, 'error');
            }
        } else {
            showToast('All keys are valid!');
        }
    } catch (err) {
        showToast('Testing failed: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Test All Keys';
    }
}

$('test-groq-btn').addEventListener('click', () => testProviderKeys('groq'));
$('test-gemini-btn').addEventListener('click', () => testProviderKeys('gemini'));
$('test-mistral-btn').addEventListener('click', () => testProviderKeys('mistral'));
$('test-nvidia-btn').addEventListener('click', () => testProviderKeys('nvidia'));
$('test-xkiro-btn').addEventListener('click', () => testProviderKeys('xkiro'));

// Endpoint Testing Logic
window.testEndpointPrompt = () => {
    const token = prompt('Paste the extension token to test:');
    if (token) testEndpoint(token);
};

window.testEndpoint = async (token) => {
    const consoleEl = $('test-console');
    const output = $('console-output');
    
    consoleEl.classList.remove('hidden');
    output.innerHTML = `<span class="info">[${new Date().toLocaleTimeString()}] Starting cross-provider test...</span>\n`;
    
    const runTest = async (provider) => {
        output.innerHTML += `<span class="info">Testing ${provider.toUpperCase()}...</span>\n`;
        try {
            const res = await fetch('/api/generate', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    forceProvider: provider,
                    prompt: `Test ${provider}. Reply with 'OK'.`
                })
            });
            const data = await res.json();
            if (res.ok) {
                output.innerHTML += `<span class="success">✓ ${provider.toUpperCase()} Success: ${data.result.substring(0, 50)}</span>\n`;
            } else {
                output.innerHTML += `<span class="err">✗ ${provider.toUpperCase()} Failed: ${data.error?.message || 'Unknown'}</span>\n`;
            }
        } catch (err) {
            output.innerHTML += `<span class="err">✗ ${provider.toUpperCase()} Error: ${err.message}</span>\n`;
        }
        output.scrollTop = output.scrollHeight;
    };

    await runTest('groq');
    await runTest('gemini');
    await runTest('mistral');
    await runTest('nvidia');
    await runTest('xkiro');
    output.innerHTML += `<span class="info">[${new Date().toLocaleTimeString()}] Tests complete.</span>\n`;
};

// Statistics Logic
async function loadStats() {
    try {
        const data = await api('/api/admin/stats');
        const stats = data.stats;
        
        const total = stats.total || 0;
        const success = stats.status?.success || 0;
        const error = stats.status?.error || 0;
        const rate = total > 0 ? Math.round((success / total) * 100) : 0;
        
        $('stat-total').textContent = total.toLocaleString();
        $('stat-rate').textContent = rate + '%';
        $('stat-active-users').textContent = data.users.onlineToday.toLocaleString();
        
        const tpStats = data.users.teepublic || { activePro: 0, activeTrial: 0 };
        const skStats = data.users.smartkeyword || { activePro: 0, activeTrial: 0 };

        $('stat-tp-active').textContent = (tpStats.activePro + tpStats.activeTrial).toLocaleString();
        $('stat-tp-pro').textContent = tpStats.activePro.toLocaleString();
        $('stat-tp-trial').textContent = tpStats.activeTrial.toLocaleString();
        
        $('stat-sk-active').textContent = (skStats.activePro + skStats.activeTrial).toLocaleString();
        $('stat-sk-pro').textContent = skStats.activePro.toLocaleString();
        $('stat-sk-trial').textContent = skStats.activeTrial.toLocaleString();
        
        // Render Chart
        renderUsageChart(stats.history || {});
        
        // Render Models
        const modelList = $('model-stats-list');
        modelList.innerHTML = '';
        if (stats.models) {
            Object.entries(stats.models).sort((a,b) => b[1].total - a[1].total).forEach(([name, data]) => {
                const perc = total > 0 ? Math.round((data.total / total) * 100) : 0;
                const item = document.createElement('div');
                item.className = 'stats-item';
                item.innerHTML = `
                    <div class="stats-item-header">
                        <span>${name.replace(/_/g, '.')}</span>
                        <span>${data.total.toLocaleString()} (${perc}%)</span>
                    </div>
                    <div class="stats-bar-bg">
                        <div class="stats-bar-fill" style="width: ${perc}%"></div>
                    </div>
                `;
                modelList.appendChild(item);
            });
        }

        // Render Providers
        const provList = $('provider-stats-list');
        provList.innerHTML = '';
        if (stats.providers) {
            Object.entries(stats.providers).sort((a,b) => b[1].total - a[1].total).forEach(([name, data]) => {
                const perc = total > 0 ? Math.round((data.total / total) * 100) : 0;
                const item = document.createElement('div');
                item.className = 'stats-item';
                item.innerHTML = `
                    <div class="stats-item-header">
                        <span style="text-transform: capitalize">${name}</span>
                        <span>${data.total.toLocaleString()} (${perc}%)</span>
                    </div>
                    <div class="stats-bar-bg">
                        <div class="stats-bar-fill" style="width: ${perc}%"></div>
                    </div>
                `;
                provList.appendChild(item);
            });
        }
    } catch (err) {
        showToast('Failed to load statistics', 'error');
    }
}

let usageChart = null;

function renderUsageChart(history) {
    const ctx = document.getElementById('usageChart').getContext('2d');
    
    // Last 14 days labels
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
            labels: labels,
            datasets: [
                {
                    label: 'Success',
                    data: successData,
                    borderColor: '#00ff88',
                    backgroundColor: 'rgba(0, 255, 136, 0.1)',
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Errors',
                    data: errorData,
                    borderColor: '#ff4d4d',
                    backgroundColor: 'rgba(255, 77, 77, 0.1)',
                    fill: true,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { 
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#888' }
                },
                x: { 
                    grid: { display: false },
                    ticks: { color: '#888' }
                }
            }
        }
    });
}

// Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
        btn.classList.add('active');
        $(`${btn.dataset.tab}-tab`).classList.remove('hidden');
        if (btn.dataset.tab === 'stats') loadStats();
    });
});
