// ============================================================
// CARTERA - DevCenterX Crypto
// Lógica de cuentas, saldo, historial, calculadora y seguridad
// ============================================================

let accounts = [];
let activeAccountIndex = 0;

const DEFAULT_WALLET = '49gtMxxALvzRRnEW8wsW7iS6EWGhmk9jrcZ3DJFRhG3e6dhkYGAaFaAbh1H3t8qkyX1YRosWF2gpN18bod4c7hGcMSZg4j3';
let prices = { usd: 0, mxn: 0 };
let currentXmrBalance = 0;

const elements = {
    activeAccountName: document.getElementById('activeAccountName'),
    cardWalletAccountName: document.getElementById('cardWalletAccountName'),
    quickSwitchDropdown: document.getElementById('quickSwitchDropdown'),
    dropdownAccountsList: document.getElementById('dropdownAccountsList'),

    xmrBalance: document.getElementById('xmrBalance'),
    usdBalance: document.getElementById('usdBalance'),
    mxBalance: document.getElementById('mxBalance'),
    walletInput: document.getElementById('walletInput'),
    infoToast: document.getElementById('infoToast'),

    openCalcBtn: document.getElementById('openCalcBtn'),
    calculatorModal: document.getElementById('calculatorModal'),
    calcXmr: document.getElementById('calcXmr'),
    calcUsd: document.getElementById('calcUsd'),
    calcMxn: document.getElementById('calcMxn'),
    calcRatesLabel: document.getElementById('calcRatesLabel'),

    tempSlider: document.getElementById('tempSlider'),
    tempValueLabel: document.getElementById('tempValueLabel'),

    // Llaves de seguridad
    keyAddrText: document.getElementById('keyAddrText'),
    keySeedText: document.getElementById('keySeedText'),
    keySpendText: document.getElementById('keySpendText'),
    keyViewText: document.getElementById('keyViewText')
};

    // ============= MOTOR CRIPTOGRÁFICO MONERO =============
    // Derivación real de dirección desde semilla de 25 palabras
    (function() {
        const P = (1n << 255n) - 19n;
        const L = (1n << 252n) + 27742317777372353535851937790883648493n;
        function mod(a, m) { m = m || P; return ((a % m) + m) % m; }
        function mpow(base, exp, m) {
            m = m || P; let r = 1n; base = mod(base, m);
            while (exp > 0n) { if (exp & 1n) r = r * base % m; exp >>= 1n; base = base * base % m; }
            return r;
        }
        function inv(a) { return mpow(mod(a), P - 2n); }

        // Lazy-initialized Ed25519 constants (heavy: deferred to first mnemonic derivation)
        let _D, _G_BASE, _ZERO_PT;
        function initCrypto() {
            if (_D !== undefined) return;
            _D = mod(-121665n * inv(121666n));
            const Gx = 15112221349535807912866137220509078750507884956996801854785804958591971590544n;
            const Gy = 46316835694926478169428394003475163141307993866256225615783033011972563637760n;
            _G_BASE  = [Gx, Gy, 1n, Gx * Gy % P];
            _ZERO_PT = [0n, 1n, 1n, 0n];
        }
        function padd(p1, p2) {
            const [X1,Y1,Z1,T1] = p1, [X2,Y2,Z2,T2] = p2;
            const A = mod((Y1-X1)*(Y2-X2)), B = mod((Y1+X1)*(Y2+X2));
            const C = mod(2n*_D*T1%P*T2), Dv = mod(2n*Z1*Z2);
            const E = mod(B-A), F = mod(Dv-C), Gv = mod(Dv+C), H = mod(B+A);
            return [E*F%P, Gv*H%P, F*Gv%P, E*H%P];
        }
        function pmul(k, point) {
            let Q = _ZERO_PT, R = point.slice();
            k = mod(k, L);
            while (k > 0n) { if (k & 1n) Q = padd(Q, R); R = padd(R, R); k >>= 1n; }
            return Q;
        }
        function compress(pt) {
            const [X,Y,Z] = pt, zi = inv(Z), x = X*zi%P, y = Y*zi%P;
            const buf = new Uint8Array(32); let v = y;
            for (let i = 0; i < 32; i++) { buf[i] = Number(v & 0xffn); v >>= 8n; }
            if (x & 1n) buf[31] |= 0x80;
            return buf;
        }
        function scalarmultBase(b32) {
            initCrypto();
            let k = 0n;
            for (let i = 31; i >= 0; i--) k = (k << 8n) | BigInt(b32[i]);
            return compress(pmul(k, _G_BASE));
        }
        function sc_reduce32(b) {
            let v = 0n;
            for (let i = 31; i >= 0; i--) v = (v << 8n) | BigInt(b[i]);
            v = mod(v, L);
            const r = new Uint8Array(32);
            for (let i = 0; i < 32; i++) { r[i] = Number(v & 0xffn); v >>= 8n; }
            return r;
        }
        function keccakBytes(input) {
            if (typeof sha3 === 'undefined') throw new Error('sha3 no disponible');
            const hex = sha3.keccak256(input instanceof Uint8Array ? Array.from(input) : input);
            const r = new Uint8Array(32);
            for (let i = 0; i < 32; i++) r[i] = parseInt(hex.slice(i*2, i*2+2), 16);
            return r;
        }
        const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
        function b58block(bytes, outLen) {
            let n = 0n;
            for (const b of bytes) n = (n << 8n) | BigInt(b);
            let s = '';
            for (let i = 0; i < outLen; i++) { s = B58[Number(n % 58n)] + s; n /= 58n; }
            return s;
        }
        function xmrBase58(bytes) {
            let r = '', i = 0;
            while (i < bytes.length) {
                const rem = bytes.length - i;
                if (rem >= 8) { r += b58block(bytes.slice(i, i+8), 11); i += 8; }
                else { r += b58block(bytes.slice(i), 7); i += rem; }
            }
            return r;
        }
        function mnemonicToSeed(words, wl) {
            if (words.length !== 25) return null;
            const n = 1626;
            const idx = words.map(w => wl.indexOf(w));
            if (idx.includes(-1)) return null;
            const seed = new Uint8Array(32);
            for (let i = 0; i < 8; i++) {
                const [w1,w2,w3] = [idx[i*3], idx[i*3+1], idx[i*3+2]];
                const val = w1 + n*((w2-w1+n)%n) + n*n*((w3-w2+n)%n);
                seed[i*4] = val & 0xff; seed[i*4+1] = (val>>8)&0xff;
                seed[i*4+2] = (val>>16)&0xff; seed[i*4+3] = (val>>24)&0xff;
            }
            return seed;
        }
        const toHex = b => Array.from(b).map(x => x.toString(16).padStart(2,'0')).join('');
        let _wl = null;
        async function loadWL() {
            if (_wl) return _wl;
            const res = await fetch('https://raw.githubusercontent.com/monero-project/monero/master/src/mnemonics/english.h');
            const text = await res.text();
            _wl = [...text.matchAll(/"([a-z]{4,})"/g)].map(m => m[1]).filter(w => /^[a-z]+$/.test(w));
            return _wl;
        }
        function pseudoDerive(t) {
            let h = 0;
            for (let i = 0; i < t.length; i++) { h = (h<<5)-h+t.charCodeAt(i); h |= 0; }
            h = Math.abs(h);
            const hex = (s,l) => { let r='',v=s; for(let i=0;i<l;i++){v=(v*16807)%2147483647;r+='0123456789abcdef'[v%16];} return r; };
            let a='4', sv=h+123456;
            const abc='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
            for(let i=0;i<94;i++){sv=(sv*16807)%2147483647;a+=abc[sv%abc.length];}
            return { address:a, seed:t, spendKey:hex(h,64), viewKey:hex(h+99999,64) };
        }
        window.deriveMoneroKeysFromSeed = async function(seedText) {
            const clean = seedText.trim();
            if (/^[48][123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{93,94}$/.test(clean)) {
                return { address: clean, seed: clean, spendKey: '—', viewKey: '—' };
            }
            const words = clean.toLowerCase().split(/\s+/).filter(Boolean);
            if (words.length !== 25) {
                throw new Error(`La semilla debe tener 25 palabras (tiene ${words.length}).`);
            }
            const wl = await loadWL();
            const seedBytes = mnemonicToSeed(words, wl);
            if (!seedBytes) throw new Error('Semilla inválida: alguna palabra no pertenece a la lista oficial de Monero.');
            const spendKey = sc_reduce32(seedBytes);
            const viewKey  = sc_reduce32(keccakBytes(spendKey));
            const pubSpend = scalarmultBase(spendKey);
            const pubView  = scalarmultBase(viewKey);
            const payload = new Uint8Array(65);
            payload[0] = 0x12; payload.set(pubSpend, 1); payload.set(pubView, 33);
            const checksum = keccakBytes(payload);
            const addrBytes = new Uint8Array(69);
            addrBytes.set(payload); addrBytes.set(checksum.slice(0,4), 65);
            return { address: xmrBase58(addrBytes), seed: seedText, spendKey: toHex(spendKey), viewKey: toHex(viewKey) };
        };
    })();


    function formatComma(num) {
        if (num === undefined || isNaN(num)) return "0,00";
        return num.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function showToast(msg) {
        elements.infoToast.textContent = msg;
        elements.infoToast.classList.add('show');
        setTimeout(() => elements.infoToast.classList.remove('show'), 2500);
    }



    let wmCurrentIdx = -1;
    let wmSeedVisible = false;

    function wmBuildList() {
        const list = document.getElementById('walletsModalList');
        list.innerHTML = '';
        if (!accounts.length) {
            list.innerHTML = '<div style="text-align:center;color:#64748b;padding:32px 0;font-size:14px;">No tienes carteras configuradas.<br>Toca <b style="color:#FF8C1A;">+ Agregar Cartera</b> para comenzar.</div>';
            return;
        }
        accounts.forEach((acct, idx) => {
            const isActive = idx === activeAccountIndex;
            const div = document.createElement('div');
            div.style.cssText = `display:flex;align-items:center;gap:14px;background:${isActive ? 'rgba(255,140,26,0.08)' : '#111827'};border:1.5px solid ${isActive ? 'rgba(255,140,26,0.4)' : 'rgba(255,255,255,0.06)'};border-radius:16px;padding:14px 16px;cursor:pointer;`;
            div.innerHTML = `
              <div style="width:40px;height:40px;border-radius:12px;background:rgba(255,140,26,0.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#FF8C1A" stroke-width="2"><path d="M21 4H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><circle cx="18" cy="12" r="2"/></svg>
              </div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:15px;font-weight:700;color:#f1f5f9;">${acct.name || 'Cartera ' + (idx+1)}</div>
                <div style="font-size:11px;color:#64748b;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:'JetBrains Mono',monospace;">${(acct.address || '—').slice(0, 22)}…</div>
              </div>
              <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
                ${isActive ? '<span style="font-size:10px;font-weight:800;color:#FF8C1A;background:rgba(255,140,26,0.12);border-radius:20px;padding:3px 10px;">ACTIVA</span>' : ''}
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#475569" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            `;
            div.onclick = () => wmOpenDetail(idx);
            list.appendChild(div);
        });
    }

    window.openWalletsModal = function() {
        wmShowList();
        document.getElementById('walletsModal').classList.add('open');
    };

    window.wmShowList = function() {
        wmBuildList();
        document.getElementById('wm-list-screen').style.display = 'block';
        document.getElementById('wm-detail-screen').style.display = 'none';
        wmSeedVisible = false;
    };

    window.wmOpenDetail = function(idx) {
        wmCurrentIdx = idx;
        wmSeedVisible = false;
        const acct = accounts[idx];
        const isActive = idx === activeAccountIndex;

        document.getElementById('wm-detail-title').textContent = acct.name || 'Cartera ' + (idx + 1);
        document.getElementById('wm-active-label').textContent = isActive ? 'Cartera activa' : 'Cartera inactiva';
        document.getElementById('wm-activate-btn').style.display = isActive ? 'none' : 'inline-block';
        document.getElementById('wm-name-input').value = acct.name || '';
        document.getElementById('wm-addr-text').textContent = acct.address || '—';

        const seedEl = document.getElementById('wm-seed-text');
        seedEl.textContent = acct.seed || '—';
        seedEl.style.display = 'none';
        document.getElementById('wm-seed-masked').style.display = 'block';
        document.getElementById('wm-seed-reveal-label').textContent = 'REVELAR';

        document.getElementById('wm-pin-change-box').style.display = 'none';
        document.getElementById('wm-new-pin-input').value = '';
        document.getElementById('wm-pin-error').style.display = 'none';
        document.getElementById('wm-pin-dots').textContent = acct.pin ? '● ● ● ●' : '— sin PIN —';

        document.getElementById('wm-list-screen').style.display = 'none';
        document.getElementById('wm-detail-screen').style.display = 'block';
    };

    window.wmActivateWallet = function() {
        activeAccountIndex = wmCurrentIdx;
        saveAccountsToStorage();
        loadActiveAccount();
        document.getElementById('wm-active-label').textContent = 'Cartera activa';
        document.getElementById('wm-activate-btn').style.display = 'none';
        showToast('Cartera activada');
    };

    window.wmSaveName = function() {
        const val = document.getElementById('wm-name-input').value.trim();
        if (!val) { showToast('Escribe un nombre'); return; }
        accounts[wmCurrentIdx].name = val;
        saveAccountsToStorage();
        loadActiveAccount();
        document.getElementById('wm-detail-title').textContent = val;
        showToast('Nombre guardado');
    };

    window.wmToggleSeed = function() {
        wmSeedVisible = !wmSeedVisible;
        document.getElementById('wm-seed-text').style.display = wmSeedVisible ? 'block' : 'none';
        document.getElementById('wm-seed-masked').style.display = wmSeedVisible ? 'none' : 'block';
        document.getElementById('wm-seed-reveal-label').textContent = wmSeedVisible ? 'OCULTAR' : 'REVELAR';
    };

    window.wmCopy = function(type) {
        const acct = accounts[wmCurrentIdx];
        const text = type === 'seed' ? (acct.seed || '') : (acct.address || '');
        if (!text) { showToast('Sin datos'); return; }
        navigator.clipboard.writeText(text).then(() => showToast(type === 'seed' ? 'Semilla copiada' : 'Dirección copiada')).catch(() => showToast('Error al copiar'));
    };

    window.wmShowPinChange = function() {
        const box = document.getElementById('wm-pin-change-box');
        box.style.display = box.style.display === 'none' ? 'block' : 'none';
        document.getElementById('wm-new-pin-input').value = '';
        document.getElementById('wm-pin-error').style.display = 'none';
    };

    window.wmSavePin = function() {
        const val = document.getElementById('wm-new-pin-input').value.trim();
        if (!/^\d{4}$/.test(val)) {
            document.getElementById('wm-pin-error').style.display = 'block';
            return;
        }
        accounts[wmCurrentIdx].pin = val;
        saveAccountsToStorage();
        document.getElementById('wm-pin-dots').textContent = '● ● ● ●';
        document.getElementById('wm-pin-change-box').style.display = 'none';
        document.getElementById('wm-pin-error').style.display = 'none';
        showToast('PIN actualizado');
    };

    window.wmDeleteWallet = function() {
        if (accounts.length <= 1) { showToast('No puedes eliminar la única cartera'); return; }
        const name = accounts[wmCurrentIdx].name || 'Cartera';
        accounts.splice(wmCurrentIdx, 1);
        if (activeAccountIndex >= accounts.length) activeAccountIndex = accounts.length - 1;
        saveAccountsToStorage();
        loadActiveAccount();
        showToast(`"${name}" eliminada`);
        wmShowList();
    };

    // ===== SEGURIDAD MODAL =====
    let secPinInput = "";

    window.openSecurityWithPin = function() {
        secPinInput = "";
        document.getElementById('secPinDots').querySelectorAll('.pin-dot').forEach(d => d.classList.remove('filled'));
        document.getElementById('secPinScreen').style.display = 'block';
        document.getElementById('secSettingsScreen').style.display = 'none';
        document.getElementById('secPinError').style.display = 'none';
        document.getElementById('securityModal').classList.add('open');
    };

    window.pressSecPin = function(num) {
        if (secPinInput.length < 4) {
            secPinInput += num;
            updateSecPinDots();
        }
        if (secPinInput.length === 4) setTimeout(verifySecPin, 200);
    };

    function updateSecPinDots() {
        const dots = document.getElementById('secPinDots').querySelectorAll('.pin-dot');
        dots.forEach((dot, idx) => {
            dot.classList.toggle('filled', idx < secPinInput.length);
        });
    }

    window.verifySecPin = function() {
        const acct = accounts[activeAccountIndex];
        const correctPin = acct ? acct.pin : null;
        if (correctPin && secPinInput === correctPin) {
            document.getElementById('secPinScreen').style.display = 'none';
            document.getElementById('secPinError').style.display = 'none';
            document.getElementById('secSettingsScreen').style.display = 'block';
            document.querySelectorAll('.mask-overlay').forEach(m => m.style.display = 'flex');
        } else {
            document.getElementById('secPinError').style.display = 'block';
            secPinInput = "";
            updateSecPinDots();
        }
    };

    function saveAccountsToStorage() {
        localStorage.setItem('dcc_accounts', JSON.stringify(accounts));
        localStorage.setItem('dcc_active_idx', activeAccountIndex);
    }

    function loadAccountsFromStorage() {
        const saved = localStorage.getItem('dcc_accounts');
        if (saved) {
            accounts = JSON.parse(saved);
            activeAccountIndex = parseInt(localStorage.getItem('dcc_active_idx')) || 0;
            return true;
        }
        return false;
    }

    function loadActiveAccount() {
        const acct = accounts[activeAccountIndex];
        if (!acct) {
            // Antes había una wallet "por defecto" con semilla/claves fijas en el código:
            // eso significaba que CUALQUIER usuario sin configurar nada compartía la
            // misma wallet que todos los demás. Se elimina por seguridad: si no hay
            // cuenta, mandamos a configurar una real.
            window.location.href = '../new/index.html';
            return;
        }

        elements.activeAccountName.textContent = acct.name;
        elements.cardWalletAccountName.textContent = acct.name;
        elements.walletInput.value = acct.address;

        // Populate credentials in Tools section
        elements.keyAddrText.textContent = acct.address;
        elements.keySeedText.textContent = acct.seed || 'No disponible (cuenta solo-lectura)';
        elements.keySpendText.textContent = acct.spendKey || 'No disponible (cuenta solo-lectura, nunca se pide por seguridad)';
        elements.keyViewText.textContent = acct.viewKey || 'No disponible';

        // Re-mask private keys on active account load
        document.querySelectorAll('.mask-overlay').forEach(mask => {
            mask.style.display = 'flex';
        });

        syncNanopool();
    }

    window.revealSensitiveKey = function(maskId) {
        document.getElementById(maskId).style.display = 'none';
        showToast("Clave revelada temporalmente");
    };

    window.copyKeyToClipboard = function(elementId) {
        const textToCopy = document.getElementById(elementId).textContent;
        // Use document.execCommand('copy') as requested inside canvas context
        const tempTextarea = document.createElement("textarea");
        tempTextarea.value = textToCopy;
        document.body.appendChild(tempTextarea);
        tempTextarea.select();
        document.execCommand("copy");
        document.body.removeChild(tempTextarea);
        showToast("¡Copiado al portapapeles!");
    };

    window.toggleAccountDropdown = function(event) {
        event.stopPropagation();
        elements.quickSwitchDropdown.classList.toggle('open');
        if (elements.quickSwitchDropdown.classList.contains('open')) {
            renderDropdownAccounts();
        }
    };

    function renderDropdownAccounts() {
        elements.dropdownAccountsList.innerHTML = accounts.map((acct, idx) => {
            const isActive = idx === activeAccountIndex;
            return `
                <div class="dropdown-account-item ${isActive ? 'active' : ''}" onclick="selectAccountFromDropdown(${idx})">
                    <div style="text-align: left;">
                        <div class="dropdown-account-name">${acct.name}</div>
                        <div class="dropdown-account-sub" style="font-family: 'JetBrains Mono', monospace;">${acct.address.substring(0, 8)}...</div>
                    </div>
                    ${isActive ? `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--success)" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>` : ''}
                </div>
            `;
        }).join('');
    }

    window.selectAccountFromDropdown = function(idx) {
        activeAccountIndex = idx;
        localStorage.setItem('dcc_active_idx', idx);
        elements.quickSwitchDropdown.classList.remove('open');
        loadActiveAccount();
        showToast(`Cartera activa: ${accounts[idx].name}`);
    };

    window.importNewAccount = function() {
        elements.quickSwitchDropdown.classList.remove('open');
        window.location.href = '../new/index.html';
    };

    document.addEventListener('click', function() {
        elements.quickSwitchDropdown.classList.remove('open');
    });

    // Puente con la app nativa / actualización de saldo
    window.updateFromAndroid = function(data) {
        if (data.balanceXmr !== undefined) {
            const b = parseFloat(data.balanceXmr);
            currentXmrBalance = b;
            elements.xmrBalance.textContent = b === 0 ? "0" : b.toFixed(6);
            if (prices.usd > 0) elements.usdBalance.textContent = formatComma(b * prices.usd);
            if (prices.mxn > 0) elements.mxBalance.textContent = formatComma(b * prices.mxn);
        }
    };

    async function syncPrices() {
        try {
            const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=monero&vs_currencies=usd,mxn');
            const data = await res.json();
            prices.usd = data.monero.usd;
            prices.mxn = data.monero.mxn;

            elements.calcRatesLabel.textContent = `1 XMR = ${prices.usd.toFixed(2)} USD | ${prices.mxn.toFixed(2)} MXN`;

            if (currentXmrBalance !== undefined) {
                elements.usdBalance.textContent = formatComma(currentXmrBalance * prices.usd);
                elements.mxBalance.textContent = formatComma(currentXmrBalance * prices.mxn);
            }
        } catch (e) {
            console.error("Error syncing fiat currency rates", e);
        }
    }

    async function syncNanopool() {
        const activeAcct = accounts[activeAccountIndex] || { address: DEFAULT_WALLET };
        try {
            const res = await fetch(`https://api.nanopool.org/v1/xmr/user/${activeAcct.address}`);
            const data = await res.json();
            if (data.status && data.data) {
                const d = data.data;
                window.updateFromAndroid({ balanceXmr: d.balance });
                if (d.hashrate !== undefined) {
                    const hrEl = document.getElementById('hashrateDisplay');
                    if (hrEl) hrEl.textContent = `${d.hashrate.toFixed ? d.hashrate.toFixed(2) : d.hashrate} H/s`;
                }
            } else {
                const res2 = await fetch(`https://api.nanopool.org/v1/xmr/balance/${activeAcct.address}`);
                const data2 = await res2.json();
                if (data2.status) window.updateFromAndroid({ balanceXmr: data2.data });
            }
        } catch (e) {
            console.error("syncNanopool error:", e);
        }
    }

    function initCalculator() {
        elements.openCalcBtn.onclick = () => {
            elements.calcXmr.value = currentXmrBalance || 0;
            elements.calcUsd.value = ((currentXmrBalance || 0) * (prices.usd || 0)).toFixed(2);
            elements.calcMxn.value = ((currentXmrBalance || 0) * (prices.mxn || 0)).toFixed(2);
            elements.calculatorModal.classList.add('open');
        };

        elements.calcXmr.oninput = () => {
            const val = parseFloat(elements.calcXmr.value) || 0;
            elements.calcUsd.value = (val * (prices.usd || 0)).toFixed(2);
            elements.calcMxn.value = (val * (prices.mxn || 0)).toFixed(2);
        };

        elements.calcUsd.oninput = () => {
            const val = parseFloat(elements.calcUsd.value) || 0;
            const xmr = prices.usd > 0 ? (val / prices.usd) : 0;
            elements.calcXmr.value = xmr.toFixed(6);
            elements.calcMxn.value = (xmr * (prices.mxn || 0)).toFixed(2);
        };

        elements.calcMxn.oninput = () => {
            const val = parseFloat(elements.calcMxn.value) || 0;
            const xmr = prices.mxn > 0 ? (val / prices.mxn) : 0;
            elements.calcXmr.value = xmr.toFixed(6);
            elements.calcUsd.value = (xmr * (prices.usd || 0)).toFixed(2);
        };
    }

    function init() {
        loadAccountsFromStorage();
        loadActiveAccount();
        initCalculator();
        syncPrices();

        document.getElementById('row-wallet').onclick = () => {
            const activeAcct = accounts[activeAccountIndex] || { address: DEFAULT_WALLET };
            elements.walletInput.value = activeAcct.address;
            document.getElementById('walletModal').classList.add('open');
        };

        document.getElementById('saveWalletBtn').onclick = async () => {
            const val = elements.walletInput.value.trim();
            if (val.length > 90) {
                // BUG anterior: se sobreescribía accounts[i].address con lo pegado por el
                // usuario, pero las claves de gasto/vista se re-derivaban de la SEMILLA
                // vieja guardada -> quedaba una dirección que no correspondía a esas
                // claves (wallet inconsistente / fondos irrecuperables). Ahora este campo
                // es solo para AGREGAR una wallet "en observación" (view-only) distinta,
                // nunca para mutar la wallet activa ya vinculada a una semilla real.
                if (accounts[activeAccountIndex]?.seed) {
                    showToast('Esta cartera ya tiene una semilla real: no se puede cambiar su dirección manualmente. Crea una wallet nueva o agrega una en modo lectura desde "Ver mi wallet".');
                } else {
                    showToast('Para monitorear otra dirección, usa "Ver mi wallet" (modo solo lectura) desde el menú.');
                }
                document.getElementById('walletModal').classList.remove('open');
            }
        };

        elements.tempSlider.oninput = function() {
            const val = this.value;
            elements.tempValueLabel.textContent = val + '°C';
            if (typeof AndroidMiner !== 'undefined' && AndroidMiner.setAutoStopTemp) {
                AndroidMiner.setAutoStopTemp(parseInt(val));
            }
        };

        setInterval(syncPrices, 120000);
        setInterval(syncNanopool, 60000);

        document.addEventListener('click', function() {
            elements.quickSwitchDropdown.classList.remove('open');
        });
    }

    document.addEventListener('DOMContentLoaded', init);
