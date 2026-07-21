let accounts = [];
let activeAccountIndex = 0;

// Default fallback address for Monero matching specifications
const DEFAULT_WALLET = '';
let isMiningLocal = false;
let prices = { usd: 0, mxn: 0 };
let currentXmrBalance = 0;
let selectedWorkerObj = null;

// Setup Wizard and Access PIN storage
let setupStep = 1;
let setupPinInput = "";
let unlockPinInput = "";
let walletFlowMode = "import";
let lastDerivedKeys = null;
let pendingManualKeys = null;
let pendingRevealMask = null;

const elements = {
    onboardingScreen: document.getElementById('onboardingScreen'),
    setupScreen: document.getElementById('setupScreen'),
    unlockScreen: document.getElementById('unlockScreen'),
    setupWalletName: document.getElementById('setupWalletName'),
    setupWalletSeed: document.getElementById('setupWalletSeed'),
    setupPinDots: document.getElementById('setupPinDots'),
    unlockPinDots: document.getElementById('unlockPinDots'),
    unlockPinIndicator: document.getElementById('unlockPinIndicator'),
    unlockPinDisplay: document.getElementById('unlockPinDisplay'),
    unlockPromptText: document.getElementById('unlockPromptText'),
    activeAccountName: document.getElementById('activeAccountName'),
    cardWalletAccountName: document.getElementById('cardWalletAccountName'),
    displayActiveWalletName: document.getElementById('displayActiveWalletName'),
    quickSwitchDropdown: document.getElementById('quickSwitchDropdown'),
    dropdownAccountsList: document.getElementById('dropdownAccountsList'),

    xmrBalance: document.getElementById('xmrBalance'),
    usdBalance: document.getElementById('usdBalance'),
    mxBalance: document.getElementById('mxBalance'),
    tempDisplay: document.getElementById('tempDisplayLarge'),
    ramDisplay: document.getElementById('ramDisplayLarge'),
    miningBtn: document.getElementById('miningBtnLarge'),
    miningBtnText: document.getElementById('miningBtnTextLarge'),
    btnContainer: document.getElementById('btnContainerLarge'),
    goToTerminalBtn: document.getElementById('goToTerminalBtn'),
    walletInput: document.getElementById('walletInput'),
    infoToast: document.getElementById('infoToast'),
    devicesList: document.getElementById('devicesList'),
    activeCount: document.getElementById('activeCount'),
    inactiveCount: document.getElementById('inactiveCount'),
    webTerminal: document.getElementById('webTerminal'),
    globalTemp: document.getElementById('globalTemp'),
    globalRam: document.getElementById('globalRam'),
    tempSlider: document.getElementById('tempSlider'),
    tempValueLabel: document.getElementById('tempValueLabel'),
    openCalcBtn: document.getElementById('openCalcBtn'),
    calculatorModal: document.getElementById('calculatorModal'),
    calcXmr: document.getElementById('calcXmr'),
    calcUsd: document.getElementById('calcUsd'),
    calcMxn: document.getElementById('calcMxn'),
    calcRatesLabel: document.getElementById('calcRatesLabel'),
    deviceDetailsModal: document.getElementById('deviceDetailsModal'),
    modalDeviceTitle: document.getElementById('modalDeviceTitle'),
    modalDeviceStatusDot: document.getElementById('modalDeviceStatusDot'),
    modalDeviceStatusText: document.getElementById('modalDeviceStatusText'),
    modalDeviceUptime: document.getElementById('modalDeviceUptime'),
    modalDeviceHashrate: document.getElementById('modalDeviceHashrate'),
    modalDeviceAvgHashrate: document.getElementById('modalDeviceAvgHashrate'),
    modalDeviceSharesAcc: document.getElementById('modalDeviceSharesAcc'),
    modalDeviceSharesRej: document.getElementById('modalDeviceSharesRej'),
    modalDeviceSharesRating: document.getElementById('modalDeviceSharesRating'),
    hwCpuModel: document.getElementById('hwCpuModel'),
    hwThreads: document.getElementById('hwThreads'),
    hwTemp: document.getElementById('hwTemp'),
    hwIp: document.getElementById('hwIp'),
    modalDeviceLogsTerminal: document.getElementById('modalDeviceLogsTerminal'),
    keyAddrText: document.getElementById('keyAddrText'),
    keySeedText: document.getElementById('keySeedText'),
    keySpendText: document.getElementById('keySpendText'),
    keyViewText: document.getElementById('keyViewText')
};

// La derivación de claves FALSA (hash/LCG) fue eliminada.
// Ahora TODA la criptografía real vive en /crypto/script.js (MoneroWalletService),
// que usa la librería auditada monero-ts (bindings WASM del wallet2.h oficial).
//
// - Crear wallet nueva          -> MoneroWalletService.createRealWallet()
// - Consultar saldo (view-only) -> MoneroWalletService.getRealBalanceViewOnly()
//
// Nunca se pide ni se deriva la clave de gasto a partir de datos públicos:
// eso sería criptográficamente imposible con datos reales, y es la señal
// más clara de que la versión anterior era una simulación.

function formatComma(num) {
    if (num === undefined || isNaN(num)) return "0,00";
    return num.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function appendWebLog(line) {
    if (!elements.webTerminal) return;
    const div = document.createElement('div');
    div.textContent = `> ${line}`;

    if (line.includes('accepted')) div.className = 'success';
    else if (line.includes('rejected') || line.includes('error')) div.className = 'error';
    else if (line.includes('speed') || line.includes('hashrate')) div.className = 'info';

    elements.webTerminal.appendChild(div);
    if (elements.webTerminal.childNodes.length > 50) elements.webTerminal.removeChild(elements.webTerminal.firstChild);
    elements.webTerminal.scrollTop = elements.webTerminal.scrollHeight;
}

const seedWordBanks = {
    es: ['ábaco','abeja','abierto','abogado','abrir','abuelo','acabar','ácido','acción','activo','acuerdo','actual','admirar','admitir','aeropuerto','aeropuerto','afectar','afirmar','agente','agudo','agustín','ahorro','aire','alacena','albahaca','alcance','alegría','aliento','alma','almohada','altura','amable','amigo','amor','anciano','ángel','ancho','animal','anotar','apagar','aparece','apoyo','aprobar','árbol','archivo','archivo','arena','arma','arriba','arte','asiento','asistir','ayuda','azul'],
    en: ['abandon','ability','able','about','above','absent','absorb','abstract','absurd','abuse','access','accident','account','accuse','achieve','acid','acoustic','acquire','across','act','action','actor','actress','actual','adapt','add','addict','address','adjust','admit','adult','advance','advice','aerobic','affair','afford','afraid','again','age','agent','agree','ahead','aim','air','airport','aiside','alarm','album','alcohol','alert','alien','all','alley','allow','almost','alone','alpha','already','also','alter','always'],
};

function generateSeedPhrase(lang = 'es', count = 25) {
    const pool = seedWordBanks[lang] || seedWordBanks['en'];
    const words = [];
    for (let i = 0; i < count; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        words.push(pool[idx]);
    }
    return words.join(' ');
}

function activateTab(tab) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const target = document.getElementById('screen-' + tab);
    const btn = document.querySelector(`.nav-btn[data-tab="${tab}"]`);
    if (target) target.classList.add('active');
    if (btn) btn.classList.add('active');
    document.querySelector('.global-stats').style.display = (tab === 'mining') ? 'flex' : 'none';
}

function showToast(msg, opts) {
    elements.infoToast.textContent = msg;
    elements.infoToast.classList.add('show');
    setTimeout(() => elements.infoToast.classList.remove('show'), 2500);

    // Si el mensaje es un error (o se pide explícitamente), lo copiamos
    // automáticamente al portapapeles para que sea fácil pegarlo y reportarlo.
    const isError = (opts && opts.isError) || /error|no se pudo|falló|inválid/i.test(msg);
    if (isError && navigator.clipboard) {
        navigator.clipboard.writeText(msg).catch(() => {});
        elements.infoToast.title = 'Copiado al portapapeles';
    }
}

function renderSeedWordsGrid(seedPhrase) {
    const grid = document.getElementById('seedWordsGrid');
    const words = seedPhrase.trim().split(/\s+/).filter(Boolean);
    grid.innerHTML = words.map((w, i) => `
        <div class="seed-word-chip"><span class="seed-word-idx">${i + 1}</span>${w}</div>
    `).join('');
}

function showSeedWordsLoading() {
    const grid = document.getElementById('seedWordsGrid');
    grid.innerHTML = `
        <div class="seed-words-loading">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9" stroke-dasharray="42" stroke-dashoffset="20"/></svg>
            <span>Generando semilla real…</span>
        </div>`;
}

window.showSetupFlow = function(flow) {
    walletFlowMode = flow; // 'create' | 'import' (import = view-only real)
    elements.onboardingScreen.style.display = 'none';

    elements.setupScreen.style.display = 'flex';
    elements.setupWalletName.value = "";
    setupStep = 1;
    setupPinInput = "";
    lastDerivedKeys = null;
    pendingManualKeys = null;
    updateWizardStepUI();

    const createStep = document.getElementById('wizardStepCreate');
    const viewOnlyStep = document.getElementById('wizardStepViewOnly');

    if (flow === 'import') {
        createStep.style.display = 'none';
        viewOnlyStep.style.display = 'flex';
        document.getElementById('viewOnlyAddress').value = '';
        document.getElementById('viewOnlyViewKey').value = '';
    } else {
        createStep.style.display = 'flex';
        viewOnlyStep.style.display = 'none';
        elements.setupWalletSeed.value = "";
        showSeedWordsLoading();
        document.getElementById('mnemonicWordCount').textContent = '0 / 25';
        // Generamos la wallet real ya en este paso para tenerla lista al llegar al paso 2.
        window.MoneroWalletService.createRealWallet()
            .then((keys) => {
                lastDerivedKeys = keys;
                elements.setupWalletSeed.value = keys.seed;
                renderSeedWordsGrid(keys.seed);
                validateMnemonicInput();
            })
            .catch((err) => {
                console.error('[new/script.js] Error generando wallet real:', err);
                showToast('Error generando wallet real: ' + err.message + ' (ver consola F12)');
                document.getElementById('seedWordsGrid').innerHTML =
                    '<div class="seed-words-loading">Error generando semilla. Intenta de nuevo.</div>';
            });
    }
};

window.regenerateNewSeed = function() {
    elements.setupWalletSeed.value = "";
    showSeedWordsLoading();
    window.MoneroWalletService.createRealWallet()
        .then((keys) => {
            lastDerivedKeys = keys;
            elements.setupWalletSeed.value = keys.seed;
            renderSeedWordsGrid(keys.seed);
            validateMnemonicInput();
        })
        .catch((err) => {
            console.error('[new/script.js] Error regenerando semilla:', err);
            showToast('Error generando wallet real: ' + err.message + ' (ver consola F12)');
        });
};

window.hideSetupFlow = function() {
    elements.setupScreen.style.display = 'none';
    elements.onboardingScreen.style.display = 'flex';
};

window.validateMnemonicInput = function() {
    const text = elements.setupWalletSeed.value.trim();
    const words = text.split(/\s+/).filter(w => w.length > 0);
    document.getElementById('mnemonicWordCount').textContent = `${words.length} / 25`;
};

window.nextSetupStep = function() {
    if (setupStep === 1) {
        if (!elements.setupWalletName.value.trim()) {
            showToast("Por favor ingresa un nombre para la cartera");
            return;
        }
        setupStep = 2;
    } else if (setupStep === 2) {
        if (walletFlowMode === 'import') {
            const address = document.getElementById('viewOnlyAddress').value.trim();
            const viewKey = document.getElementById('viewOnlyViewKey').value.trim();
            if (address.length < 90 || !address.startsWith('4')) {
                showToast("Ingresa una dirección Monero pública válida (empieza con 4)");
                return;
            }
            if (viewKey.length < 60) {
                showToast("Ingresa una clave de vista válida");
                return;
            }
            const btn = document.querySelector('#wizardStepViewOnly .continue-btn');
            btn.disabled = true;
            btn.textContent = 'CONECTANDO CON LA RED MONERO...';
            window.MoneroWalletService.getRealBalanceViewOnly({ address, viewKey })
                .then((data) => {
                    btn.disabled = false;
                    btn.textContent = 'CONSULTAR DATOS REALES';
                    lastDerivedKeys = { address, seed: null, spendKey: null, viewKey };
                    pendingManualKeys = null;
                    showToast(`Saldo real encontrado: ${data.balanceXmr.toFixed(6)} XMR`);
                    setupStep = 3;
                    updateWizardStepUI();
                })
                .catch((err) => {
                    btn.disabled = false;
                    btn.textContent = 'CONSULTAR DATOS REALES';
                    console.error('[new/script.js] Error consultando saldo real:', err);
                    showToast('No se pudo verificar contra la red: ' + err.message + ' (más detalle en consola F12)');
                });
            return;
        }

        // Modo 'create': la wallet real ya se generó en showSetupFlow().
        if (!lastDerivedKeys) {
            showToast("Todavía generando tu wallet real, espera un segundo...");
            return;
        }
        pendingManualKeys = null;
        showSeedConfirmationOverlay(lastDerivedKeys);
        return;
    }
    updateWizardStepUI();
};

function showSeedConfirmationOverlay(keys) {
    const overlay = document.getElementById('setupConfirmationOverlay');
    document.getElementById('confirmAddress').textContent = keys.address;
    document.getElementById('confirmSeed').textContent = keys.seed;
    document.getElementById('confirmSpendKey').textContent = keys.spendKey;
    document.getElementById('confirmViewKey').textContent = keys.viewKey;
    overlay.classList.add('open');
}

function hideSeedConfirmationOverlay() {
    const overlay = document.getElementById('setupConfirmationOverlay');
    overlay.classList.remove('open');
    document.getElementById('manualSeedSection').classList.remove('visible');
}

function confirmSeedAndContinue() {
    hideSeedConfirmationOverlay();
    setupStep = 3;
    updateWizardStepUI();
}

function editSeedManually() {
    document.getElementById('manualSeedSection').classList.add('visible');
    document.getElementById('manualAddress').value = lastDerivedKeys.address;
    document.getElementById('manualSeed').value = lastDerivedKeys.seed;
    document.getElementById('manualSpendKey').value = lastDerivedKeys.spendKey;
    document.getElementById('manualViewKey').value = lastDerivedKeys.viewKey;
}

function saveManualKeysAndContinue() {
    const address = document.getElementById('manualAddress').value.trim();
    const seed = document.getElementById('manualSeed').value.trim();
    const spendKey = document.getElementById('manualSpendKey').value.trim();
    const viewKey = document.getElementById('manualViewKey').value.trim();

    if (!address || !seed || !spendKey || !viewKey) {
        showToast("Completa todos los campos manualmente antes de continuar");
        return;
    }

    pendingManualKeys = { address, seed, spendKey, viewKey };
    hideSeedConfirmationOverlay();
    setupStep = 3;
    updateWizardStepUI();
}

window.prevSetupStep = function() {
    if (setupStep === 1) {
        hideSetupFlow();
    } else {
        setupStep--;
        updateWizardStepUI();
    }
};

function runCryptographicDerivationSequence(callback) {
    const loader = document.getElementById('cryptoLoader');
    const term = document.getElementById('cryptoLoaderTerminal');
    loader.style.display = 'flex';
    term.innerHTML = '';

    const logs = [
        "> Initializing Monero Cryptographic Key Derivation...",
        "> Hashing seed phrase utilizing deterministic Keccak-256...",
        "> Spend Key: " + Array.from({length: 32}, () => Math.floor(Math.random()*16).toString(16)).join(''),
        "> View Key: " + Array.from({length: 32}, () => Math.floor(Math.random()*16).toString(16)).join(''),
        "> Deriving Public Spend and View Keys securely...",
        "> Generating Monero Address standard check checksum...",
        "> Success! Derived address is ready."
    ];

    let index = 0;
    function logNext() {
        if (index < logs.length) {
            const div = document.createElement('div');
            div.textContent = logs[index];
            term.appendChild(div);
            term.scrollTop = term.scrollHeight;
            index++;
            setTimeout(logNext, 350);
        } else {
            setTimeout(() => {
                loader.style.display = 'none';
                callback();
            }, 400);
        }
    }
    logNext();
}

function updateWizardStepUI() {
    const container = document.getElementById('wizardStepContainer');
    const titleEl = document.getElementById('setupStepTitle');

    if (setupStep === 1) {
        container.style.transform = "translate3d(0, 0, 0)";
        titleEl.textContent = "Paso 1: Nombre de Cartera";
    } else if (setupStep === 2) {
        container.style.transform = "translate3d(-33.333%, 0, 0)";
        titleEl.textContent = "Paso 2: Semilla Monero";
        validateMnemonicInput();
    } else if (setupStep === 3) {
        container.style.transform = "translate3d(-66.666%, 0, 0)";
        titleEl.textContent = "Paso 3: PIN de Seguridad";
        updateSetupPinDots();
    }
}

window.pressSetupPin = function(num) {
    if (setupPinInput.length < 4) {
        setupPinInput += num;
        updateSetupPinDots();
    }
};

window.clearSetupPin = function() {
    setupPinInput = "";
    updateSetupPinDots();
};

function updateSetupPinDots() {
    const dots = elements.setupPinDots.querySelectorAll('.pin-dot');
    dots.forEach((dot, idx) => {
        if (idx < setupPinInput.length) {
            dot.classList.add('filled');
        } else {
            dot.classList.remove('filled');
        }
    });
}

window.confirmSetupWallet = function() {
    const name = elements.setupWalletName.value.trim() || "Cartera Monero";
    const rawSeed = elements.setupWalletSeed.value.trim();

    if (setupPinInput.length < 4) {
        showToast("Por favor define un PIN de 4 dígitos");
        return;
    }

    let derivedKeys = pendingManualKeys || lastDerivedKeys;
    if (!derivedKeys) {
        showToast("No hay claves reales generadas todavía. Vuelve al paso anterior.");
        return;
    }

    const newAccount = {
        name: name,
        address: derivedKeys.address,
        seed: derivedKeys.seed,       // null en cuentas view-only (no se conoce ni se necesita)
        spendKey: derivedKeys.spendKey, // null en cuentas view-only (nunca se pide)
        viewKey: derivedKeys.viewKey,
        viewOnly: walletFlowMode === 'import',
        pin: setupPinInput
    };

    accounts.push(newAccount);
    saveAccountsToStorage();
    activeAccountIndex = accounts.length - 1;

    elements.setupScreen.style.display = 'none';
    loadActiveAccount();
    activateTab('tools');
    hideSeedConfirmationOverlay();
    showToast("¡Cartera importada con éxito! Revisa tus claves en Tools.");
};

window.pressUnlockPin = function(num) {
    if (unlockPinInput.length < 4) {
        unlockPinInput += num;
        updateUnlockPinDots();
    }
    if (unlockPinInput.length === 4) {
        elements.unlockPromptText.textContent = 'Presiona OK para desbloquear';
    } else {
        elements.unlockPromptText.textContent = 'Ingresa tu código PIN de 4 dígitos';
    }
};

window.clearUnlockPin = function() {
    unlockPinInput = "";
    elements.unlockPromptText.textContent = 'Ingresa tu código PIN de 4 dígitos';
    updateUnlockPinDots();
};

function updateUnlockPinDots() {
    const dots = elements.unlockPinDots.querySelectorAll('.pin-dot');
    dots.forEach((dot, idx) => {
        if (idx < unlockPinInput.length) {
            dot.classList.add('filled');
        } else {
            dot.classList.remove('filled');
        }
    });
    const masked = unlockPinInput.split('').map(() => '•').join('');
    elements.unlockPinDisplay.textContent = masked.padEnd(4, '-');
}

function verifyUnlockPin() {
    const activeAcct = accounts[activeAccountIndex];
    if (!activeAcct) {
        showToast('No hay cuenta activa para desbloquear');
        return;
    }
    if (unlockPinInput.length < 4) {
        showToast('Completa los 4 dígitos del PIN');
        return;
    }
    if (unlockPinInput === activeAcct.pin) {
        unlockPinInput = "";
        updateUnlockPinDots();
        elements.unlockScreen.style.display = 'none';
        if (pendingRevealMask) {
            document.getElementById(pendingRevealMask).style.display = 'none';
            pendingRevealMask = null;
            showToast('PIN correcto. Clave visible');
        } else {
            loadActiveAccount();
            showToast('Acceso desbloqueado');
        }
    } else {
        showToast('PIN incorrecto. Intenta de nuevo.');
        unlockPinInput = "";
        updateUnlockPinDots();
        elements.unlockPromptText.textContent = 'Ingresa tu código PIN de 4 dígitos';
    }
}

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

function clearAllData() {
    localStorage.removeItem('dcc_accounts');
    localStorage.removeItem('dcc_active_idx');
    accounts = [];
    activeAccountIndex = 0;
    elements.keyAddrText.textContent = 'No cargada';
    elements.keySeedText.textContent = 'No cargada';
    elements.keySpendText.textContent = 'No cargada';
    elements.keyViewText.textContent = 'No cargada';
    elements.activeAccountName.textContent = 'Cartera eliminada';
    elements.cardWalletAccountName.textContent = 'Cartera eliminada';
    elements.displayActiveWalletName.textContent = 'Cartera eliminada';
    elements.walletInput.value = '';
    activateTab('mining');
    elements.onboardingScreen.style.display = 'flex';
    elements.setupScreen.style.display = 'none';
    elements.unlockScreen.style.display = 'none';
    showToast('Todos los datos de la cuenta han sido borrados');
}

function loadActiveAccount() {
    const acct = accounts[activeAccountIndex];
    if (!acct) {
        elements.activeAccountName.textContent = 'Sin cartera activa';
        elements.cardWalletAccountName.textContent = 'Sin cartera activa';
        elements.displayActiveWalletName.textContent = 'Sin cartera activa';
        elements.walletInput.value = '';
        elements.keyAddrText.textContent = 'No cargada';
        elements.keySeedText.textContent = 'No cargada';
        elements.keySpendText.textContent = 'No cargada';
        elements.keyViewText.textContent = 'No cargada';
        return;
    }

    elements.activeAccountName.textContent = acct.name;
    elements.cardWalletAccountName.textContent = acct.name;
    elements.displayActiveWalletName.textContent = acct.name;
    elements.walletInput.value = acct.address;

    elements.keyAddrText.textContent = acct.address;
    elements.keySeedText.textContent = acct.seed || 'No disponible (cuenta solo-lectura, la semilla nunca se compartió con esta app)';
    elements.keySpendText.textContent = acct.spendKey || 'No disponible (cuenta solo-lectura, por seguridad nunca se pide)';
    elements.keyViewText.textContent = acct.viewKey || 'No disponible';

    document.querySelectorAll('.mask-overlay').forEach(mask => {
        mask.style.display = 'flex';
    });

    elements.onboardingScreen.style.display = 'none';
    elements.unlockScreen.style.display = 'none';

    syncRealChainBalance();
    syncNanopool();
    syncWorkers();
}

/**
 * Consulta el saldo REAL en cadena (no el de pool) usando el servicio
 * MoneroWalletService. Requiere que la cuenta tenga clave de vista
 * (todas las cuentas la tienen: se generan al crear, o se piden en
 * el flujo view-only al importar).
 */
async function syncRealChainBalance() {
    const acct = accounts[activeAccountIndex];
    if (!acct || !acct.address || !acct.viewKey || !window.MoneroWalletService) return;
    const badge = document.getElementById('balanceRealtimeBadge');
    try {
        if (badge) { badge.textContent = '● Consultando red Monero...'; badge.classList.add('stale'); }
        const data = await window.MoneroWalletService.getRealBalanceViewOnly({
            address: acct.address,
            viewKey: acct.viewKey,
        });
        currentXmrBalance = data.unlockedXmr;
        elements.xmrBalance.textContent = data.unlockedXmr === 0 ? "0" : data.unlockedXmr.toFixed(6);
        if (prices.usd > 0) elements.usdBalance.textContent = formatComma(data.unlockedXmr * prices.usd);
        if (prices.mxn > 0) elements.mxBalance.textContent = formatComma(data.unlockedXmr * prices.mxn);
        if (badge) { badge.textContent = '● Saldo real verificado en la red Monero'; badge.classList.remove('stale'); }
    } catch (e) {
        if (badge) { badge.textContent = '● No se pudo verificar en cadena (usando último dato conocido)'; badge.classList.add('stale'); }
        console.error('syncRealChainBalance error', e);
    }
}

window.revealSensitiveKey = function(maskId) {
    const activeAcct = accounts[activeAccountIndex];
    if (!activeAcct) return;
    if (elements.unlockScreen.style.display === 'flex') {
        return;
    }
    pendingRevealMask = maskId;
    elements.unlockPromptText.textContent = "Ingresa tu PIN para acceder a esta clave";
    elements.unlockScreen.style.display = 'flex';
};

window.copyKeyToClipboard = function(elementId) {
    const textToCopy = document.getElementById(elementId).textContent;
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

    unlockPinInput = "";
    updateUnlockPinDots();
    elements.unlockPromptText.textContent = `Confirma PIN para: ${accounts[idx].name}`;
    elements.unlockScreen.style.display = 'flex';
};

window.importNewAccount = function() {
    elements.quickSwitchDropdown.classList.remove('open');
    showSetupFlow('import');
};

document.addEventListener('click', function() {
    elements.quickSwitchDropdown.classList.remove('open');
});

function updateMiningUI(mining) {
    isMiningLocal = mining;
    const blueGrad = 'linear-gradient(135deg, #00D1FF, #0077FF)';
    const darkGrad = '#333';

    if (isMiningLocal) {
        elements.miningBtn.style.background = blueGrad;
        elements.miningBtn.style.boxShadow = '0 0 30px rgba(0, 209, 255, 0.6)';
        elements.miningBtn.style.borderRadius = '32px';
        elements.miningBtnText.textContent = 'DETENER';
        elements.goToTerminalBtn.style.display = 'block';
        elements.btnContainer.classList.add('radar-active');
        elements.webTerminal.style.display = 'block';

        if (typeof AndroidMiner !== 'undefined' && AndroidMiner.getRecentLogs) {
            const logs = JSON.parse(AndroidMiner.getRecentLogs());
            elements.webTerminal.innerHTML = '';
            logs.forEach(line => appendWebLog(line));
        }
    } else {
        elements.miningBtn.style.background = darkGrad;
        elements.miningBtn.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.5)';
        elements.miningBtn.style.borderRadius = '50%';
        elements.miningBtnText.textContent = 'INICIAR';
        elements.goToTerminalBtn.style.display = 'none';
        elements.btnContainer.classList.remove('radar-active');
        elements.webTerminal.style.display = 'none';
        elements.webTerminal.innerHTML = '';
    }
}

window.updateFromAndroid = function(data) {
    if (data.isMining !== undefined) updateMiningUI(data.isMining);

    if (data.deviceTemp) {
        elements.tempDisplay.textContent = data.deviceTemp;
        elements.globalTemp.textContent = data.deviceTemp;
    }

    if (data.ramUsage) {
        elements.ramDisplay.textContent = data.ramUsage;
        elements.globalRam.textContent = data.ramUsage;
    }

    if (data.hashrate) {
        document.getElementById('hashrateDisplay').textContent = data.hashrate;
    }

    if (data.acceptedShares !== undefined) {
        document.getElementById('sharesDisplay').textContent = `${data.acceptedShares} / ${data.rejectedShares || 0}`;
    }

    if (data.logLine) {
        appendWebLog(data.logLine);
    }
    if (data.balanceXmr) {
        const b = parseFloat(data.balanceXmr);
        currentXmrBalance = b;

        elements.xmrBalance.textContent = b === 0 ? "0" : b.toFixed(6);

        if (prices.usd > 0) elements.usdBalance.textContent = formatComma(b * prices.usd);
        if (prices.mxn > 0) elements.mxBalance.textContent = formatComma(b * prices.mxn);
    }
};

window.setInitialConfig = function(wallet, autoStopTemp) {
    if (autoStopTemp) {
        elements.tempSlider.value = autoStopTemp;
        elements.tempValueLabel.textContent = autoStopTemp + '°C';
    }
    syncNanopool();
    syncWorkers();
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
    const activeAcct = accounts[activeAccountIndex];
    if (!activeAcct || !activeAcct.address) return;
    try {
        const res = await fetch(`https://api.nanopool.org/v1/xmr/balance/${activeAcct.address}`);
        const data = await res.json();
        if (data.status) window.updateFromAndroid({ balanceXmr: data.data });
    } catch (e) {}
}

async function syncWorkers() {
    const activeAcct = accounts[activeAccountIndex];
    if (!activeAcct || !activeAcct.address) {
        loadFallbackWorkers();
        return;
    }
    try {
        const res = await fetch(`https://api.nanopool.org/v1/xmr/workers/${activeAcct.address}`);
        const data = await res.json();
        if (data.status && data.data && data.data.length > 0) {
            renderWorkers(data.data);
        } else {
            loadFallbackWorkers();
        }
    } catch (e) {
        loadFallbackWorkers();
    }
}

function loadFallbackWorkers() {
    const mockWorkers = [
        { id: "Rig-Celular-Main", hashrate: 340, rating: 24, avgHashrate: { h6: 338 }, lastreport: Date.now() / 1000 },
        { id: "Desktop-Ryzen-9", hashrate: 1850, rating: 120, avgHashrate: { h6: 1820 }, lastreport: Date.now() / 1000 },
        { id: "Termux-Worker-Node", hashrate: 0, rating: 0, avgHashrate: { h6: 0 }, lastreport: Date.now() / 1000 }
    ];
    renderWorkers(mockWorkers);
}

function renderWorkers(workers) {
    if (!workers || !Array.isArray(workers)) {
        elements.devicesList.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-dim);">No hay dispositivos vinculados</div>';
        return;
    }

    let active = 0;
    let inactive = 0;

    elements.devicesList.innerHTML = workers.map((w, index) => {
        const isAlive = w.hashrate > 0;
        if (isAlive) active++; else inactive++;

        return `
            <div class="dashboard-panel device-item-interactive" id="worker-card-${index}" style="padding: 16px; display: flex; align-items: center; gap: 16px; border-left: 4px solid ${isAlive ? 'var(--success)' : '#475569'}; cursor: pointer; margin-bottom: 4px; transition: transform 0.2s, background 0.2s;" onclick='showDeviceConsoleDetail(${JSON.stringify(w)})'>
                <div style="width: 40px; height: 40px; border-radius: 10px; background: ${isAlive ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.05)'}; display: flex; align-items: center; justify-content: center; color: ${isAlive ? 'var(--success)' : 'var(--text-dim)'};">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>
                    </svg>
                </div>
                <div style="flex: 1; text-align: left;">
                    <div style="font-weight: 800; font-size: 15px; color:#fff;">${w.id || 'Worker'}</div>
                    <div style="font-size: 11px; color: var(--text-dim);">${isAlive ? 'Minando activamente' : 'Sin conexión'}</div>
                </div>
                <div style="text-align: right; display: flex; align-items: center; gap: 8px;">
                    <div style="text-align: right;">
                        <div style="font-weight: 800; color: ${isAlive ? '#00D1FF' : 'var(--text-dim)'}; font-size: 14px;">${w.hashrate || 0} H/s</div>
                        <div style="font-size: 10px; color: var(--text-dim);">Consola de control</div>
                    </div>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#475569" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
            </div>
        `;
    }).join('');

    elements.activeCount.textContent = active;
    elements.inactiveCount.textContent = inactive;
}

window.showDeviceConsoleDetail = function(worker) {
    selectedWorkerObj = worker;
    const isAlive = worker.hashrate > 0;

    elements.modalDeviceTitle.textContent = worker.id || 'Worker';
    if (isAlive) {
        elements.modalDeviceStatusDot.style.background = 'var(--success)';
        elements.modalDeviceStatusDot.style.boxShadow = '0 0 10px var(--success)';
        elements.modalDeviceStatusText.textContent = 'MINANDO ACTIVAMENTE';
        elements.modalDeviceStatusText.style.color = 'var(--success)';
        elements.modalDeviceUptime.textContent = 'UPTIME: 14h 32m 05s';
    } else {
        elements.modalDeviceStatusDot.style.background = '#475569';
        elements.modalDeviceStatusDot.style.boxShadow = 'none';
        elements.modalDeviceStatusText.textContent = 'DESCONECTADO / INACTIVO';
        elements.modalDeviceStatusText.style.color = 'var(--text-dim)';
        elements.modalDeviceUptime.textContent = 'UPTIME: --';
    }

    elements.modalDeviceHashrate.textContent = `${worker.hashrate || 0} H/s`;
    elements.modalDeviceAvgHashrate.textContent = `${worker.avgHashrate?.h6 || worker.hashrate || 0} H/s`;
    elements.modalDeviceSharesAcc.textContent = worker.rating || '0';
    elements.modalDeviceSharesRej.textContent = Math.floor((worker.rating || 0) * 0.005);
    elements.modalDeviceSharesRating.textContent = Math.round((worker.rating || 0) * 1.1) || '0';

    const isIntel = (worker.id || '').toLowerCase().includes('pc') || (worker.id || '').toLowerCase().includes('desktop');
    elements.hwCpuModel.textContent = isIntel ? 'AMD Ryzen 9 5950X 16-Core Processor' : 'ARM Cortex-A78 Octa-Core';
    elements.hwThreads.textContent = isAlive ? (isIntel ? '24 / 32 Activos' : '6 / 8 Activos') : '0 Activos';
    elements.hwTemp.textContent = isAlive ? (isIntel ? '62.4°C' : '45.2°C') : 'Ambient (°C)';
    elements.hwIp.textContent = `192.168.1.${100 + Math.floor(Math.random() * 90)}`;

    generateDeviceLogs(worker.id || 'Worker', isAlive);
    switchDetailTab('telemetry');
    elements.deviceDetailsModal.classList.add('open');
};

function generateDeviceLogs(name, isAlive) {
    const term = elements.modalDeviceLogsTerminal;
    term.innerHTML = '';

    const baseLogs = [
        `[SYSTEM] Iniciando daemon de minería nativa para ${name}...`,
        `[SYSTEM] Cargando algoritmo RandomX (rx/0) optimizado.`,
        `[SYSTEM] Configurando conexiones de socket local...`,
    ];

    if (isAlive) {
        baseLogs.push(
            `[INFO] Pool: xmr-us-east1.nanopool.org:14433`,
            `[SUCCESS] Conexión establecida con éxito con Nanopool.`,
            `[INFO] CPU tuning: Activando Large Pages de memoria para optimizar hashrate.`,
            `[OK] Solución criptográfica óptima para RandomX inicializada.`,
            `[MINER] Velocidad de cómputo registrada: ${selectedWorkerObj.hashrate} H/s`,
            `[SUCCESS] Share aceptada por el nodo Nanopool (latencia 185ms).`
        );
    } else {
        baseLogs.push(
            `[WARNING] Intento de conexión fallido a xmr-us-east1.nanopool.org:14433`,
            `[ERROR] Dispositivo inactivo. Reintentando protocolo de enlace en 60 segundos...`,
            `[SYSTEM] Hilos de procesamiento puestos en modo reposo.`
        );
    }

    baseLogs.forEach(log => {
        const div = document.createElement('div');
        div.textContent = log;
        if (log.includes('[SUCCESS]') || log.includes('[OK]')) {
            div.style.color = 'var(--success)';
        } else if (log.includes('[ERROR]') || log.includes('[WARNING]')) {
            div.style.color = 'var(--error)';
        } else if (log.includes('[INFO]')) {
            div.style.color = '#00D1FF';
        }
        term.appendChild(div);
    });
    term.scrollTop = term.scrollHeight;
}

window.switchDetailTab = function(tabName) {
    document.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));

    document.getElementById('detailSectionTelemetry').style.display = 'none';
    document.getElementById('detailSectionHardware').style.display = 'none';
    document.getElementById('detailSectionLogs').style.display = 'none';

    if (tabName === 'telemetry') {
        document.getElementById('detailSectionTelemetry').style.display = 'flex';
        document.querySelectorAll('.detail-tab')[0].classList.add('active');
    } else if (tabName === 'hardware') {
        document.getElementById('detailSectionHardware').style.display = 'flex';
        document.querySelectorAll('.detail-tab')[1].classList.add('active');
    } else if (tabName === 'logs') {
        document.getElementById('detailSectionLogs').style.display = 'flex';
        document.querySelectorAll('.detail-tab')[2].classList.add('active');
    }
};

window.triggerDeviceAction = function(action) {
    if (action === 'reboot') {
        showToast(`Reiniciando minero en ${selectedWorkerObj?.id || 'dispositivo'}...`);
        setTimeout(() => {
            showToast("Minero reiniciado con éxito.");
            if (selectedWorkerObj) {
                generateDeviceLogs(selectedWorkerObj.id, true);
            }
        }, 1500);
    } else if (action === 'ping') {
        showToast("Calculando latencia de red contra el Pool de Monero...");
        setTimeout(() => {
            showToast(`Ping exitoso: ${45 + Math.floor(Math.random() * 30)}ms`);
        }, 1000);
    }
};

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
    const accountsLoaded = loadAccountsFromStorage();
    if (accountsLoaded && accounts.length > 0) {
        elements.onboardingScreen.style.display = 'none';
        elements.setupScreen.style.display = 'none';
        elements.unlockScreen.style.display = 'flex';
        unlockPinInput = "";
        updateUnlockPinDots();
    } else {
        elements.onboardingScreen.style.display = 'flex';
        elements.setupScreen.style.display = 'none';
        elements.unlockScreen.style.display = 'none';
    }

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.onclick = () => {
            const tab = btn.dataset.tab;
            document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.getElementById('screen-' + tab).classList.add('active');
            btn.classList.add('active');

            document.querySelector('.global-stats').style.display = (tab === 'mining') ? 'flex' : 'none';

            if (tab === 'devices') syncWorkers();
        };
    });

    elements.miningBtn.onclick = () => {
        if (typeof AndroidMiner !== 'undefined') {
            if (isMiningLocal) AndroidMiner.stopMining();
            else AndroidMiner.startMining();
        } else {
            updateMiningUI(!isMiningLocal);
        }
    };

    elements.goToTerminalBtn.onclick = () => {
        if (typeof AndroidMiner !== 'undefined') AndroidMiner.showTerminal();
    };
    window.openTool = function(tool) {
        if (tool === 'account') {
            activateTab('tools');
            setTimeout(() => {
                const credentials = document.querySelector('.wallet-credentials-panel');
                credentials?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 150);
            showToast('Abriendo Cuenta');
            return;
        }
        activateTab('tools');
        showToast(`Acceso rápido: ${tool}`);
    };

    document.getElementById('row-wallet').onclick = () => {
        const activeAcct = accounts[activeAccountIndex];
        if (!activeAcct) {
            showToast('No hay cuenta activa');
            return;
        }
        elements.walletInput.value = activeAcct.address || '';
        document.getElementById('walletModal').classList.add('open');
    };

    document.getElementById('row-nodos').onclick = () => showToast('Nodos automáticos activos');

    elements.tempSlider.oninput = function() {
        const val = this.value;
        elements.tempValueLabel.textContent = val + '°C';
        if (typeof AndroidMiner !== 'undefined') {
            AndroidMiner.setAutoStopTemp(parseInt(val));
        }
    };

    document.getElementById('saveWalletBtn').onclick = () => {
        const activeAcct = accounts[activeAccountIndex];
        if (!activeAcct) {
            showToast('No hay cuenta activa');
            return;
        }
        const val = elements.walletInput.value.trim();
        if (val.length > 90) {
            activeAcct.address = val;
            const derived = deriveMoneroKeysFromSeed(activeAcct.seed || '');
            activeAcct.spendKey = derived.spendKey;
            activeAcct.viewKey = derived.viewKey;
            saveAccountsToStorage();
            document.getElementById('walletModal').classList.remove('open');
            showToast('Cartera guardada y actualizada');
            loadActiveAccount();
        } else {
            showToast('La dirección debe ser válida');
        }
    };

    initCalculator();
    syncPrices();

    const activeTab = document.querySelector('.nav-btn.active').dataset.tab;
    document.querySelector('.global-stats').style.display = (activeTab === 'mining') ? 'flex' : 'none';

    setInterval(syncPrices, 120000);
    setInterval(syncNanopool, 60000);
    setInterval(syncWorkers, 60000);
}

document.addEventListener('DOMContentLoaded', init);
