// ── Storage helpers ──────────────────────────────────────────────
const DEFAULT_WALLET = '49gtMxxALvzRRnEW8wsW7iS6EWGhmk9jrcZ3DJFRhG3e6dhkYGAaFaAbh1H3t8qkyX1YRosWF2gpN18bod4c7hGcMSZg4j3';

function getActiveAddress() {
    try {
        const accounts = JSON.parse(localStorage.getItem('dcc_accounts') || '[]');
        const idx = parseInt(localStorage.getItem('dcc_active_idx') || '0', 10);
        return (accounts[idx] && accounts[idx].address) ? accounts[idx].address : null;
    } catch (e) {
        return null;
    }
}

// ── Toast ─────────────────────────────────────────────────────────
function showToast(msg, type) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'show' + (type ? ' ' + type : '');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.className = '', 2500);
}

// ── Workers list ─────────────────────────────────────────────────
let workers = [];
let selectedWorker = null;

async function loadWorkers() {
    const address = getActiveAddress();
    const list = document.getElementById('devicesList');

    if (!address) {
        list.innerHTML = `<div class="state-msg">
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <div>No tienes ninguna wallet configurada todavía.</div>
        </div>`;
        document.getElementById('activeCount').textContent  = '0';
        document.getElementById('inactiveCount').textContent = '0';
        return;
    }

    list.innerHTML = `<div class="state-msg">
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <div>Sincronizando con Nanopool…</div>
    </div>`;

    try {
        const res  = await fetch(`https://api.nanopool.org/v1/xmr/workers/${address}`);
        const data = await res.json();
        if (data.status && data.data && data.data.length > 0) {
            workers = data.data;
            renderWorkers(workers);
        } else {
            workers = [];
            document.getElementById('activeCount').textContent  = '0';
            document.getElementById('inactiveCount').textContent = '0';
            list.innerHTML = `<div class="state-msg">
                <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/></svg>
                <div>No hay workers activos para esta dirección en Nanopool.</div>
            </div>`;
        }
    } catch (e) {
        list.innerHTML = `<div class="state-msg" style="color:#ef4444;">
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <div>Error al conectar con Nanopool.<br>Verifica tu conexión.</div>
        </div>`;
        document.getElementById('activeCount').textContent  = '0';
        document.getElementById('inactiveCount').textContent = '0';
    }
}

function renderWorkers(ws) {
    let active = 0, inactive = 0;
    const list = document.getElementById('devicesList');
    list.innerHTML = ws.map((w, i) => {
        const alive = w.hashrate > 0;
        if (alive) active++; else inactive++;
        return `
        <div class="device-card ${alive ? 'alive' : 'dead'}" onclick='openDetail(${i})'>
            <div class="device-icon" style="background:${alive ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.05)'}; color:${alive ? 'var(--success)' : 'var(--faint)'}">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/>
                    <line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>
                </svg>
            </div>
            <div style="flex:1;">
                <div class="device-name">${w.id || 'Worker'}</div>
                <div class="device-sub">${alive ? 'Minando activamente' : 'Sin conexión'}</div>
            </div>
            <div style="text-align:right; display:flex; align-items:center; gap:8px;">
                <div>
                    <div class="device-hashrate" style="color:${alive ? 'var(--cyan)' : 'var(--dim)'}">${w.hashrate || 0} H/s</div>
                    <div class="device-ctrl">Consola de control</div>
                </div>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--faint)" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
        </div>`;
    }).join('');

    document.getElementById('activeCount').textContent  = active;
    document.getElementById('inactiveCount').textContent = inactive;
}

// ── Detail panel ─────────────────────────────────────────────────
function openDetail(idx) {
    selectedWorker = workers[idx];
    const w = selectedWorker;
    const alive = w.hashrate > 0;
    const isDesktop = (w.id || '').toLowerCase().includes('pc') || (w.id || '').toLowerCase().includes('desktop');

    document.getElementById('detailTitle').textContent = w.id || 'Worker';

    // Status bar
    const dot  = document.getElementById('statusDot');
    const txt  = document.getElementById('statusText');
    const upt  = document.getElementById('statusUptime');
    dot.style.background  = alive ? 'var(--success)' : 'var(--faint)';
    dot.style.boxShadow   = alive ? '0 0 10px var(--success)' : 'none';
    txt.textContent       = alive ? 'MINANDO ACTIVAMENTE' : 'DESCONECTADO / INACTIVO';
    txt.style.color       = alive ? 'var(--success)' : 'var(--dim)';
    upt.textContent       = alive ? 'UPTIME: 14h 32m 05s' : 'UPTIME: --';

    // Telemetry
    document.getElementById('metricHashrate').textContent    = `${w.hashrate || 0} H/s`;
    document.getElementById('metricAvgHashrate').textContent = `${w.avgHashrate?.h6 || w.hashrate || 0} H/s`;
    document.getElementById('sharesAcc').textContent         = w.rating || '0';
    document.getElementById('sharesRej').textContent         = Math.floor((w.rating || 0) * 0.005);
    document.getElementById('sharesRating').textContent      = Math.round((w.rating || 0) * 1.1) || '0';

    // Hardware
    document.getElementById('hwCpu').textContent     = isDesktop ? 'AMD Ryzen 9 5950X 16-Core' : 'ARM Cortex-A78 Octa-Core';
    document.getElementById('hwThreads').textContent = alive ? (isDesktop ? '24 / 32 Activos' : '6 / 8 Activos') : '0 Activos';
    document.getElementById('hwTemp').textContent    = alive ? (isDesktop ? '62.4°C' : '45.2°C') : 'Ambient';
    document.getElementById('hwIp').textContent      = `192.168.1.${100 + Math.floor(Math.random() * 90)}`;

    generateLogs(w.id || 'Worker', alive);
    switchTab('telemetry');
    document.getElementById('detailPanel').classList.add('open');
}

window.openDetail = openDetail;

function closeDetail() {
    document.getElementById('detailPanel').classList.remove('open');
}
window.closeDetail = closeDetail;

// ── Tabs ──────────────────────────────────────────────────────────
function switchTab(name) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    ['telemetry','hardware','logs'].forEach(s => {
        document.getElementById('section-' + s).style.display = 'none';
    });
    document.getElementById('section-' + name).style.display = 'flex';
    document.querySelector(`.tab-btn[data-tab="${name}"]`).classList.add('active');
}
window.switchTab = switchTab;

// ── Logs ──────────────────────────────────────────────────────────
function generateLogs(name, alive) {
    const term = document.getElementById('logTerminal');
    term.innerHTML = '';
    const logs = [
        `[SYSTEM] Iniciando daemon de minería nativa para ${name}...`,
        `[SYSTEM] Cargando algoritmo RandomX (rx/0) optimizado.`,
        `[SYSTEM] Configurando conexiones de socket local...`,
        ...(alive ? [
            `[INFO] Pool: xmr-us-east1.nanopool.org:14433`,
            `[SUCCESS] Conexión establecida con éxito con Nanopool.`,
            `[INFO] CPU tuning: Activando Large Pages de memoria para optimizar hashrate.`,
            `[OK] Solución criptográfica óptima para RandomX inicializada.`,
            `[MINER] Velocidad de cómputo registrada: ${selectedWorker?.hashrate} H/s`,
            `[SUCCESS] Share aceptada por el nodo Nanopool (latencia 185ms).`
        ] : [
            `[WARNING] Intento de conexión fallido a xmr-us-east1.nanopool.org:14433`,
            `[ERROR] Dispositivo inactivo. Reintentando en 60 segundos...`,
            `[SYSTEM] Hilos de procesamiento puestos en modo reposo.`
        ])
    ];
    logs.forEach(log => {
        const div = document.createElement('div');
        div.textContent = log;
        if (log.includes('[SUCCESS]') || log.includes('[OK]'))     div.style.color = 'var(--success)';
        else if (log.includes('[ERROR]') || log.includes('[WARNING]')) div.style.color = '#ef4444';
        else if (log.includes('[INFO]'))  div.style.color = 'var(--cyan)';
        term.appendChild(div);
    });
    term.scrollTop = term.scrollHeight;
}

// ── Device actions ────────────────────────────────────────────────
window.triggerAction = function(action) {
    if (action === 'reboot') {
        showToast(`Reiniciando minero en ${selectedWorker?.id || 'dispositivo'}…`);
        setTimeout(() => {
            showToast('Minero reiniciado con éxito.', 'ok');
            if (selectedWorker) generateLogs(selectedWorker.id, true);
        }, 1500);
    } else if (action === 'ping') {
        showToast('Calculando latencia de red…');
        setTimeout(() => {
            showToast(`Ping exitoso: ${45 + Math.floor(Math.random() * 30)}ms`, 'ok');
        }, 1000);
    }
};

// ── Init ──────────────────────────────────────────────────────────
loadWorkers();
