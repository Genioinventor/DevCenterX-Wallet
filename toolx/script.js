/* ══════════════════════════════════════
   ToolX — script.js
   Herramientas de utilidad para DevCenterX Crypto
   ══════════════════════════════════════ */

/* ── Toast ── */
function toast(msg, type = '') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'show' + (type ? ' ' + type : '');
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.className = ''; }, 2600);
}

/* ── Copy to clipboard ── */
function copyText(text, label = 'Copiado') {
    navigator.clipboard.writeText(text)
        .then(() => toast('✓ ' + label + ' al portapapeles', 'ok'))
        .catch(() => {
            const ta = document.createElement('textarea');
            ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            toast('✓ ' + label + ' al portapapeles', 'ok');
        });
}

/* ═══════════════════════════
   PANEL MANAGER
═══════════════════════════ */
function openPanel(id) {
    document.getElementById(id).classList.add('open');
    document.body.style.overflow = 'hidden';
}
function closePanel(id) {
    document.getElementById(id).classList.remove('open');
    document.body.style.overflow = '';
}

// Close panels when clicking backdrop
document.querySelectorAll('.panel-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
        if (e.target === overlay) closePanel(overlay.id);
    });
});

/* ═══════════════════════════
   1. GENERADOR QR
═══════════════════════════ */
function openQR() { openPanel('panel-qr'); renderQR(); }

function renderQR() {
    const text = document.getElementById('qr-input').value.trim();
    const canvas = document.getElementById('qr-canvas');
    const size = 220;
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);

    if (!text) {
        ctx.fillStyle = '#ccc';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Ingresa texto', size/2, size/2);
        return;
    }

    // Simple QR visual using a hash pattern (visual placeholder)
    // In production you'd use a real QR lib
    const hash = simpleHash(text);
    const modules = 21;
    const cell = Math.floor((size - 20) / modules);
    const offset = Math.floor((size - cell * modules) / 2);

    ctx.fillStyle = '#000';
    // finder patterns corners
    drawFinder(ctx, offset, offset, cell);
    drawFinder(ctx, offset + cell * (modules - 7), offset, cell);
    drawFinder(ctx, offset, offset + cell * (modules - 7), cell);

    // data modules from hash
    let h = hash;
    for (let r = 0; r < modules; r++) {
        for (let c = 0; c < modules; c++) {
            if (isFinderZone(r, c, modules)) continue;
            h = (h * 1664525 + 1013904223) & 0xffffffff;
            if ((h >>> 0) % 3 !== 0) {
                ctx.fillRect(offset + c * cell, offset + r * cell, cell - 1, cell - 1);
            }
        }
    }
}

function drawFinder(ctx, x, y, cell) {
    ctx.fillStyle = '#000';
    ctx.fillRect(x, y, cell * 7, cell * 7);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + cell, y + cell, cell * 5, cell * 5);
    ctx.fillStyle = '#000';
    ctx.fillRect(x + cell * 2, y + cell * 2, cell * 3, cell * 3);
}

function isFinderZone(r, c, m) {
    return (r < 8 && c < 8) || (r < 8 && c >= m - 8) || (r >= m - 8 && c < 8);
}

function simpleHash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = (h * 0x01000193) & 0xffffffff;
    }
    return h >>> 0;
}

function downloadQR() {
    const text = document.getElementById('qr-input').value.trim();
    if (!text) { toast('Ingresa texto primero', 'err'); return; }
    const canvas = document.getElementById('qr-canvas');
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'qr-toolx.png';
    a.click();
    toast('✓ QR descargado', 'ok');
}

/* ═══════════════════════════
   2. CALCULADORA XMR
═══════════════════════════ */
let prices = { usd: 0, mxn: 0 };

function openCalc() {
    openPanel('panel-calc');
    fetchPricesForCalc();
}

async function fetchPricesForCalc() {
    try {
        const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=monero&vs_currencies=usd,mxn');
        const d = await r.json();
        prices.usd = d.monero.usd;
        prices.mxn = d.monero.mxn;
        document.getElementById('calc-rate').textContent =
            `1 XMR = $${prices.usd.toLocaleString('en-US', {minimumFractionDigits:2})} USD | $${prices.mxn.toLocaleString('es-MX', {minimumFractionDigits:2})} MXN`;
        calcConvert();
    } catch(e) {
        document.getElementById('calc-rate').textContent = 'No se pudo obtener precio en vivo';
    }
}

function calcConvert() {
    const xmr = parseFloat(document.getElementById('calc-xmr').value) || 0;
    const usd = (xmr * prices.usd).toFixed(2);
    const mxn = (xmr * prices.mxn).toFixed(2);
    document.getElementById('calc-usd').value = prices.usd ? usd : '';
    document.getElementById('calc-mxn').value = prices.mxn ? mxn : '';
}

function calcFromUSD() {
    if (!prices.usd) return;
    const usd = parseFloat(document.getElementById('calc-usd').value) || 0;
    const xmr = (usd / prices.usd).toFixed(6);
    document.getElementById('calc-xmr').value = xmr;
    document.getElementById('calc-mxn').value = (usd / prices.usd * prices.mxn).toFixed(2);
}

function calcFromMXN() {
    if (!prices.mxn) return;
    const mxn = parseFloat(document.getElementById('calc-mxn').value) || 0;
    const xmr = (mxn / prices.mxn).toFixed(6);
    document.getElementById('calc-xmr').value = xmr;
    document.getElementById('calc-usd').value = (mxn / prices.mxn * prices.usd).toFixed(2);
}

/* ═══════════════════════════
   3. VERIFICADOR DE DIRECCIÓN
═══════════════════════════ */
function openAddrCheck() { openPanel('panel-addr'); }

function checkAddress() {
    const addr = document.getElementById('addr-input').value.trim();
    const resultEl = document.getElementById('addr-result');

    if (!addr) { toast('Ingresa una dirección', 'err'); return; }

    let type = '', valid = false, color = '';

    if (/^4[0-9A-Za-z]{94}$/.test(addr)) {
        type = 'Dirección Monero Principal (Standard)';
        valid = true; color = 'var(--green)';
    } else if (/^8[0-9A-Za-z]{94}$/.test(addr)) {
        type = 'Dirección Monero Subaddress';
        valid = true; color = 'var(--green)';
    } else if (/^A[0-9A-Za-z]{105}$/.test(addr)) {
        type = 'Dirección Monero Integrated';
        valid = true; color = '#60a5fa';
    } else if (/^(1|3)[0-9A-Za-z]{25,34}$/.test(addr)) {
        type = 'Dirección Bitcoin (Legacy/P2SH)';
        valid = true; color = '#f59e0b';
    } else if (/^bc1[0-9A-Za-z]{39,59}$/.test(addr)) {
        type = 'Dirección Bitcoin (Bech32 / SegWit)';
        valid = true; color = '#f59e0b';
    } else if (/^0x[0-9a-fA-F]{40}$/.test(addr)) {
        type = 'Dirección Ethereum / ERC-20';
        valid = true; color = '#818cf8';
    } else {
        type = 'Dirección no reconocida o inválida';
        valid = false; color = 'var(--red)';
    }

    resultEl.style.color = color;
    resultEl.innerHTML = `<strong>${valid ? '✓' : '✗'} ${type}</strong><br><span style="font-size:11px;color:var(--dim);font-family:monospace;word-break:break-all;">${addr}</span>`;
}

/* ═══════════════════════════
   4. GENERADOR DE HASH
═══════════════════════════ */
function openHash() { openPanel('panel-hash'); }

async function generateHash() {
    const text = document.getElementById('hash-input').value;
    if (!text) { toast('Ingresa texto', 'err'); return; }

    const enc = new TextEncoder().encode(text);

    async function digest(algo) {
        const buf = await crypto.subtle.digest(algo, enc);
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
    }

    const [sha256, sha512] = await Promise.all([
        digest('SHA-256'),
        digest('SHA-512')
    ]);

    // Simple MD5-like (using djb2 for demonstration)
    let djb2 = 5381;
    for (let i = 0; i < text.length; i++) djb2 = ((djb2 << 5) + djb2) + text.charCodeAt(i);
    const djb2hex = (djb2 >>> 0).toString(16).padStart(8,'0');

    document.getElementById('hash-results').innerHTML = `
        <div class="hash-chip">
            <div class="hash-chip-label">SHA-256</div>
            <div class="hash-chip-value" id="h-256">${sha256}</div>
        </div>
        <div class="hash-chip">
            <div class="hash-chip-label">SHA-512</div>
            <div class="hash-chip-value" id="h-512">${sha512}</div>
        </div>
        <div class="hash-chip">
            <div class="hash-chip-label">djb2 (32-bit)</div>
            <div class="hash-chip-value">${djb2hex}</div>
        </div>
    `;
    document.getElementById('hash-copy-btns').style.display = 'flex';
}

/* seed panel removed */

/* ═══════════════════════════
   ACCOUNT PANEL
═══════════════════════════ */
function openAccount() {
    // BUG corregido: antes leía de 'toolx_account' (una llave de localStorage
    // aislada, nunca escrita por new/ ni cartera/), así que mostraba datos
    // desconectados de tu wallet real. Ahora lee la MISMA cuenta activa que
    // el resto de la app (dcc_accounts) y es de solo lectura: este panel no
    // permite pegar/editar claves manualmente (eso rompía la integridad
    // dirección↔claves, ver bug de cartera/script.js).
    let acct = null;
    try {
        const accounts = JSON.parse(localStorage.getItem('dcc_accounts') || '[]');
        const idx = parseInt(localStorage.getItem('dcc_active_idx') || '0', 10);
        acct = accounts[idx] || null;
    } catch (e) { acct = null; }

    document.getElementById('account-seed').value = acct?.seed || 'No disponible (cuenta solo-lectura)';
    document.getElementById('account-address').value = acct?.address || 'Sin wallet configurada';
    document.getElementById('account-spend').value = acct?.spendKey || 'No disponible (cuenta solo-lectura, nunca se pide por seguridad)';
    document.getElementById('account-view').value = acct?.viewKey || '';
    ['account-seed','account-address','account-spend','account-view'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.readOnly = true;
    });
    // hide sensitive inputs by default
    ['account-seed','account-spend','account-view'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.type = id === 'account-seed' ? 'textarea' : 'password';
    });
    openPanel('panel-account');
}

function toggleReveal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName.toLowerCase() === 'textarea') {
        // toggle masked via CSS - switch readonly -> editable for visibility
        if (el.style.whiteSpace === 'pre-wrap') {
            el.style.whiteSpace = '';
            el.style.height = '';
        } else {
            el.style.whiteSpace = 'pre-wrap';
            el.style.height = 'auto';
        }
        // no strong masking for textarea, so rely on user caution
    } else {
        el.type = (el.type === 'password') ? 'text' : 'password';
    }
}

// saveAccount() eliminada: este panel ahora es solo lectura y refleja
// siempre la cuenta real activa (dcc_accounts). Editar semilla/claves a
// mano desde aquí era exactamente el mismo bug de integridad ya corregido
// en cartera/script.js (dirección y claves podían quedar de wallets
// distintas). Para cambiar de wallet, usa "Crear" o "Ver mi wallet" en new/.

function closeSession() {
    // clear all data and redirect to new (login/import) page
    try { clearAllData(); } catch(e) { localStorage.removeItem('toolx_account'); }
    window.location.href = '../new/index.html';
}

function openCartera() {
    const target = localStorage.getItem('toolx_cartera_target') || '../cartera/index.html';
    window.location.href = target;
}

function openSecurity() {
    // load saved settings
    const cfg = JSON.parse(localStorage.getItem('toolx_security') || '{}');
    document.getElementById('security-pin').value = cfg.pin || '';
    document.getElementById('security-temp').value = cfg.temp || 40;
    document.getElementById('temp-val').textContent = cfg.temp || 40;
    document.getElementById('cartera-target').value = cfg.cartera || (localStorage.getItem('toolx_cartera_target') || '../cartera/index.html');
    openPanel('panel-security');
}

function saveSecurity() {
    const pin = document.getElementById('security-pin').value.trim();
    const temp = parseInt(document.getElementById('security-temp').value,10) || 40;
    const cartera = document.getElementById('cartera-target').value.trim() || '../cartera/index.html';
    const cfg = { pin, temp, cartera };
    try {
        localStorage.setItem('toolx_security', JSON.stringify(cfg));
        localStorage.setItem('toolx_cartera_target', cartera);
        toast('✓ Ajustes de seguridad guardados', 'ok');
    } catch(e) { toast('No se pudo guardar ajustes', 'err'); }
}

// Update active wallet display below Cartera
function updateActiveWalletInfo() {
    try {
        const accounts = JSON.parse(localStorage.getItem('dcc_accounts') || '[]');
        const idx = parseInt(localStorage.getItem('dcc_active_idx') || '0', 10);
        const active = (accounts && accounts.length && accounts[idx]) ? accounts[idx] : null;
        const nameEl = document.getElementById('aw-name');
        const addrEl = document.getElementById('aw-addr');
        if (active) {
            nameEl.textContent = active.name || ('Cartera ' + (idx+1));
            const a = (active.address || '—');
            const half = Math.ceil(a.length/2);
            const visible = a.slice(0, half);
            addrEl.textContent = 'Dirección: ' + visible + '…';
        } else {
            nameEl.textContent = 'Sin cartera activa';
            addrEl.textContent = 'Dirección: —';
        }
    } catch(e) { console.error(e); }
}

function openWalletOptions(e) {
    e.stopPropagation();
    const cfg = JSON.parse(localStorage.getItem('toolx_security') || '{}');
    const pin = cfg.pin || '';
    if (!pin) {
        alert('No hay PIN configurado. Ve a Seguridad para establecerlo.');
        return;
    }
    const entry = window.prompt('Introduce PIN para ver opciones');
    if (entry === null) return;
    if (entry !== pin) { alert('PIN incorrecto'); return; }
    // authorized: show options
    const action = window.prompt('Opciones:\n1) Borrar todos los datos y cerrar sesión\n2) Mostrar dirección completa\nIngresa 1 o 2');
    if (action === '1') {
        if (confirm('¿Confirmas borrar todos los datos y cerrar sesión? Esta acción no se puede deshacer.')) {
            clearAllData();
            window.location.href = '../new/index.html';
        }
    } else if (action === '2') {
        // show full address
        const accounts = JSON.parse(localStorage.getItem('dcc_accounts') || '[]');
        const idx = parseInt(localStorage.getItem('dcc_active_idx') || '0',10);
        const active = (accounts && accounts.length && accounts[idx]) ? accounts[idx] : null;
        if (active && active.address) alert('Dirección completa:\n' + active.address);
        else alert('No hay dirección disponible');
    }
}

function clearAllData() {
    try {
        localStorage.clear();
        sessionStorage.clear();
        toast('✓ Todos los datos eliminados', 'ok');
    } catch(e) { console.error(e); toast('No se pudieron borrar todos los datos', 'err'); }
}

/* ═══════════════════════════
   6. CONVERSOR BASE
═══════════════════════════ */
function openBase() { openPanel('panel-base'); }

let activeBase = 'dec';
function selectBase(b) {
    activeBase = b;
    document.querySelectorAll('#panel-base .tag').forEach(t => t.classList.remove('active'));
    document.querySelector(`#panel-base .tag[data-base="${b}"]`).classList.add('active');
    convertBase();
}

function convertBase() {
    const raw = document.getElementById('base-input').value.trim();
    if (!raw) { clearBaseResults(); return; }

    let num;
    try {
        if (activeBase === 'dec') num = BigInt(raw);
        else if (activeBase === 'hex') num = BigInt('0x' + raw.replace(/^0x/i,''));
        else if (activeBase === 'bin') num = BigInt('0b' + raw.replace(/^0b/i,''));
        else if (activeBase === 'oct') num = BigInt('0o' + raw.replace(/^0o/i,''));
    } catch(e) {
        document.getElementById('base-results').innerHTML = '<span style="color:var(--red)">⚠️ Valor inválido para la base seleccionada</span>';
        return;
    }

    document.getElementById('base-results').innerHTML = `
        <div class="hash-chip"><div class="hash-chip-label">Decimal</div><div class="hash-chip-value">${num.toString(10)}</div></div>
        <div class="hash-chip"><div class="hash-chip-label">Hexadecimal</div><div class="hash-chip-value">${num.toString(16).toUpperCase()}</div></div>
        <div class="hash-chip"><div class="hash-chip-label">Binario</div><div class="hash-chip-value" style="word-break:break-all;">${num.toString(2)}</div></div>
        <div class="hash-chip"><div class="hash-chip-label">Octal</div><div class="hash-chip-value">${num.toString(8)}</div></div>
    `;
}

function clearBaseResults() {
    document.getElementById('base-results').innerHTML = '';
}

/* ═══════════════════════════
   INIT
═══════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
    // Tag base selector init
    document.querySelectorAll('#panel-base .tag').forEach(t => {
        t.addEventListener('click', () => selectBase(t.dataset.base));
    });
    // Update active wallet display
    try { updateActiveWalletInfo(); } catch(e) {}
});
