/**
 * =============================================================================
 *  DevCenterX Crypto — Motor Monero real, 100% local (script.js raíz)
 * =============================================================================
 *
 *  v2: se eliminó la dependencia de "monero-ts" (fallaba al empaquetar para
 *  navegador vía CDN porque internamente usa módulos de Node como
 *  "child_process"). En su lugar, este archivo implementa el algoritmo
 *  REAL de Monero en JavaScript puro (el mismo que ya usabas en
 *  cartera/script.js), así que no depende de ninguna librería externa ni
 *  de bundlers: funciona directo en el navegador.
 *
 *  Qué es real aquí:
 *   - Generación de entropía con crypto.getRandomValues (criptográficamente segura).
 *   - Codificación/decodificación de la semilla de 25 palabras (algoritmo
 *     Electrum-Words oficial de Monero, con palabra de checksum CRC32).
 *   - Derivación Ed25519 real: spend key -> view key -> claves públicas -> dirección.
 *
 *  Reglas de seguridad (no las rompas al editar):
 *  1. TODO corre en el navegador del usuario. La semilla y la clave de gasto
 *     NUNCA se envían a ningún servidor.
 *  2. Para "ver saldo" de una wallet YA EXISTENTE, solo se piden
 *     DIRECCIÓN PÚBLICA + CLAVE DE VISTA (view-only). Con esos dos datos
 *     es matemáticamente imposible mover o gastar fondos.
 *  3. La consulta de saldo real usa el protocolo abierto de "light wallet
 *     server" (el mismo que usan MyMonero / Cake Wallet Web) — el servidor
 *     solo puede leer, nunca firmar transacciones.
 * =============================================================================
 */

(function (global) {
  'use strict';

  const P = (1n << 255n) - 19n;
  const L = (1n << 252n) + 27742317777372353535851937790883648493n;
  function mod(a, m) { m = m || P; return ((a % m) + m) % m; }
  function mpow(base, exp, m) {
    m = m || P; let r = 1n; base = mod(base, m);
    while (exp > 0n) { if (exp & 1n) r = r * base % m; exp >>= 1n; base = base * base % m; }
    return r;
  }
  function inv(a) { return mpow(mod(a), P - 2n); }

  let _D, _G_BASE, _ZERO_PT;
  function initCurve() {
    if (_D !== undefined) return;
    _D = mod(-121665n * inv(121666n));
    const Gx = 15112221349535807912866137220509078750507884956996801854785804958591971590544n;
    const Gy = 46316835694926478169428394003475163141307993866256225615783033011972563637760n;
    _G_BASE = [Gx, Gy, 1n, Gx * Gy % P];
    _ZERO_PT = [0n, 1n, 1n, 0n];
  }
  function padd(p1, p2) {
    const [X1, Y1, Z1, T1] = p1, [X2, Y2, Z2, T2] = p2;
    const A = mod((Y1 - X1) * (Y2 - X2)), B = mod((Y1 + X1) * (Y2 + X2));
    const C = mod(2n * _D * T1 % P * T2), Dv = mod(2n * Z1 * Z2);
    const E = mod(B - A), F = mod(Dv - C), Gv = mod(Dv + C), H = mod(B + A);
    return [E * F % P, Gv * H % P, F * Gv % P, E * H % P];
  }
  function pmul(k, point) {
    let Q = _ZERO_PT, R = point.slice();
    k = mod(k, L);
    while (k > 0n) { if (k & 1n) Q = padd(Q, R); R = padd(R, R); k >>= 1n; }
    return Q;
  }
  function compress(pt) {
    const [X, Y, Z] = pt, zi = inv(Z), x = X * zi % P, y = Y * zi % P;
    const buf = new Uint8Array(32); let v = y;
    for (let i = 0; i < 32; i++) { buf[i] = Number(v & 0xffn); v >>= 8n; }
    if (x & 1n) buf[31] |= 0x80;
    return buf;
  }
  function scalarmultBase(b32) {
    initCurve();
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
    if (typeof sha3 === 'undefined') throw new Error('Falta la librería sha3 (js-sha3) en la página.');
    const hex = sha3.keccak256(input instanceof Uint8Array ? Array.from(input) : input);
    const r = new Uint8Array(32);
    for (let i = 0; i < 32; i++) r[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
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
      if (rem >= 8) { r += b58block(bytes.slice(i, i + 8), 11); i += 8; }
      else { r += b58block(bytes.slice(i), 7); i += rem; }
    }
    return r;
  }

  let _wl = null;
  async function loadWordlist() {
    if (_wl) return _wl;
    const res = await fetch('https://raw.githubusercontent.com/monero-project/monero/master/src/mnemonics/english.h');
    if (!res.ok) throw new Error('No se pudo descargar la lista oficial de palabras de Monero.');
    const text = await res.text();
    const words = [...text.matchAll(/"([a-z]{3,})"/g)].map((m) => m[1]);
    if (words.length < 1626) throw new Error('Lista de palabras incompleta.');
    _wl = words.slice(0, 1626);
    return _wl;
  }

  function crc32(bytes) {
    let table = crc32._table;
    if (!table) {
      table = crc32._table = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        table[n] = c >>> 0;
      }
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function mnemonicToSeed(words25, wl) {
    if (words25.length !== 25) return null;
    const n = wl.length;
    const idx = words25.map((w) => wl.indexOf(w));
    if (idx.includes(-1)) return null;

    const prefixLen = 4;
    const trimmed = words25.slice(0, 24).map((w) => w.slice(0, prefixLen)).join('');
    const checksumIdx = crc32(new TextEncoder().encode(trimmed)) % 24;
    if (words25[24] !== words25[checksumIdx]) return null;

    const seed = new Uint8Array(32);
    for (let i = 0; i < 8; i++) {
      const w1 = idx[i * 3], w2 = idx[i * 3 + 1], w3 = idx[i * 3 + 2];
      const val = w1 + n * ((w2 - w1 + n) % n) + n * n * ((w3 - w2 + n) % n);
      seed[i * 4] = val & 0xff; seed[i * 4 + 1] = (val >> 8) & 0xff;
      seed[i * 4 + 2] = (val >> 16) & 0xff; seed[i * 4 + 3] = (val >> 24) & 0xff;
    }
    return seed;
  }

  function seedToMnemonic(seed32, wl) {
    const n = wl.length;
    const words = [];
    for (let i = 0; i < 8; i++) {
      const val = (seed32[i * 4] | (seed32[i * 4 + 1] << 8) | (seed32[i * 4 + 2] << 16) | (seed32[i * 4 + 3] << 24)) >>> 0;
      const w1 = val % n;
      const v2 = Math.floor(val / n) + w1;
      const w2 = v2 % n;
      const v3 = Math.floor(v2 / n) + w2;
      const w3 = v3 % n;
      words.push(wl[w1], wl[w2], wl[w3]);
    }
    const prefixLen = 4;
    const trimmed = words.map((w) => w.slice(0, prefixLen)).join('');
    const checksumIdx = crc32(new TextEncoder().encode(trimmed)) % 24;
    words.push(words[checksumIdx]);
    return words.join(' ');
  }

  const toHex = (b) => Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');

  function keysFromSpend(spendKeyBytes) {
    const spendKey = sc_reduce32(spendKeyBytes);
    const viewKey = sc_reduce32(keccakBytes(spendKey));
    const pubSpend = scalarmultBase(spendKey);
    const pubView = scalarmultBase(viewKey);
    const payload = new Uint8Array(65);
    payload[0] = 0x12; // prefijo de dirección estándar mainnet de Monero
    payload.set(pubSpend, 1);
    payload.set(pubView, 33);
    const checksum = keccakBytes(payload);
    const addrBytes = new Uint8Array(69);
    addrBytes.set(payload); addrBytes.set(checksum.slice(0, 4), 65);
    return {
      address: xmrBase58(addrBytes),
      spendKey: toHex(spendKey),
      viewKey: toHex(viewKey),
    };
  }

  /** Crea una wallet Monero NUEVA y real, 100% local. */
  async function createRealWallet() {
    const wl = await loadWordlist();
    const entropy = new Uint8Array(32);
    (global.crypto || global.msCrypto).getRandomValues(entropy);
    const seedBytes = sc_reduce32(entropy);
    const seedPhrase = seedToMnemonic(seedBytes, wl);
    const keys = keysFromSpend(seedBytes);
    return { address: keys.address, seed: seedPhrase, spendKey: keys.spendKey, viewKey: keys.viewKey };
  }

  /** Restaura una wallet real a partir de una semilla de 25 palabras existente. */
  async function restoreRealWalletFromSeed(seedPhrase) {
    const wl = await loadWordlist();
    const words = seedPhrase.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length !== 25) throw new Error(`La semilla debe tener 25 palabras (tiene ${words.length}).`);
    const seedBytes = mnemonicToSeed(words, wl);
    if (!seedBytes) throw new Error('Semilla inválida: alguna palabra no está en la lista oficial o el checksum no coincide.');
    const keys = keysFromSpend(seedBytes);
    return { address: keys.address, seed: seedPhrase.trim(), spendKey: keys.spendKey, viewKey: keys.viewKey };
  }

  /**
   * Consulta el saldo REAL de una cuenta usando SOLO dirección pública +
   * clave de vista (view-only, no puede gastar fondos). Usa el protocolo
   * abierto de "light wallet server" (el mismo que usan MyMonero / Cake
   * Wallet Web): el servidor escanea la cadena por ti, pero jamás puede
   * mover el dinero porque no tiene la clave de gasto.
   *
   * Prueba varios servidores conocidos por si uno está caído o bloquea
   * CORS, y deja en `console` el detalle exacto de cada intento (para que
   * puedas ver en las DevTools qué pasó realmente, en vez del genérico
   * "Failed to fetch" del navegador).
   */
  /**
   * Consulta el saldo REAL de una cuenta usando SOLO dirección pública +
   * clave de vista (view-only, no puede gastar fondos).
   *
   * IMPORTANTE sobre CORS: api.mymonero.com no permite llamadas directas
   * desde un navegador (no manda Access-Control-Allow-Origin). Por eso,
   * si tu proyecto está desplegado en Vercel (o similar) con la función
   * serverless incluida en /api/monero-balance.js, este código la usa
   * PRIMERO — esa función corre en el servidor y no tiene problema de
   * CORS. Solo si esa ruta no existe (por ejemplo corriendo el HTML
   * suelto con Live Server sin backend) intenta la llamada directa, que
   * en ese caso muy probablemente fallará por CORS — es una limitación
   * real de mymonero.com, no un bug de este código.
   */
  async function tryOwnProxy(address, viewKey) {
    const res = await fetch('/api/monero-balance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, view_key: viewKey }),
    });
    const text = await res.text();
    let payload;
    try { payload = JSON.parse(text); } catch (e) {
      throw new Error(`/api/monero-balance no devolvió JSON (¿no está desplegado este endpoint?): ${text.slice(0, 300)}`);
    }
    if (!payload.ok) {
      // Antes esto se perdía y solo se veía "502 Bad Gateway" sin detalle.
      // Ahora la función SIEMPRE responde 200 con {ok:false, error, attempts}
      // para que el mensaje real (qué servidor falló y por qué) llegue hasta acá.
      const detail = payload.attempts ? ` — intentos: ${payload.attempts.join(' | ')}` : '';
      throw new Error((payload.error || `/api/monero-balance respondió ${res.status}`) + detail);
    }
    return payload.data;
  }

  async function tryOneServer(serverUrl, address, viewKey) {
    const url = `${serverUrl}/get_address_info`;
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, view_key: viewKey }),
      });
    } catch (networkErr) {
      console.error(
        `[MoneroWalletService] Fallo de red/CORS contra ${url}. ` +
        `Nombre del error: ${networkErr.name}. Mensaje: ${networkErr.message}. ` +
        `Esto casi siempre significa que ${serverUrl} no permite llamadas ` +
        `directas desde el navegador (falta Access-Control-Allow-Origin). ` +
        `Usa la función serverless /api/monero-balance.js incluida en este ` +
        `proyecto (funciona server-a-server, sin CORS) en vez de llamar aquí directo.`
      );
      throw new Error(`No se pudo conectar a ${serverUrl} (bloqueado por CORS o sin red). Ver consola.`);
    }

    let bodyText = '';
    try { bodyText = await res.text(); } catch (_) { /* noop */ }

    if (!res.ok) {
      console.error(
        `[MoneroWalletService] ${url} respondió HTTP ${res.status} ${res.statusText}. ` +
        `Cuerpo de la respuesta: ${bodyText.slice(0, 500)}`
      );
      throw new Error(`${serverUrl} respondió ${res.status} ${res.statusText}`);
    }

    let data;
    try { data = JSON.parse(bodyText); } catch (parseErr) {
      console.error(`[MoneroWalletService] Respuesta de ${url} no es JSON válido: ${bodyText.slice(0, 500)}`);
      throw new Error(`${serverUrl} devolvió una respuesta no válida (¿HTML de error?).`);
    }

    return data;
  }

  async function getNanopoolPendingBalance(address) {
    const res = await fetch(`https://api.nanopool.org/v1/xmr/balance/${address}`);
    if (!res.ok) throw new Error(`Nanopool respondió ${res.status}`);
    const json = await res.json();
    if (!json || json.status !== true) {
      throw new Error('Nanopool no tiene datos para esta dirección (¿nunca ha minado a este pool?).');
    }
    return parseFloat(json.data) || 0;
  }

  async function getRealBalanceViewOnly({ address, viewKey, serverUrl }) {
    if (!address) throw new Error('Se requiere la dirección pública.');

    const atomicToXmr = (v) => Number(BigInt(v || 0)) / 1e12;
    const toResult = (data, serverUsed) => {
      const received = atomicToXmr(data.total_received);
      const sent = atomicToXmr(data.total_sent);
      const locked = atomicToXmr(data.locked_funds);
      return {
        balanceXmr: received - sent,
        unlockedXmr: received - sent - locked,
        txCount: (data.spent_outputs || []).length,
        serverUsed,
        source: 'onchain',
        raw: data,
      };
    };

    if (viewKey) {
      try {
        const data = await tryOwnProxy(address, viewKey);
        console.info('[MoneroWalletService] Consulta exitosa vía /api/monero-balance.');
        return toResult(data, '/api/monero-balance (proxy propio)');
      } catch (proxyErr) {
        console.warn('[MoneroWalletService] Proxy propio no disponible o falló:', proxyErr.message);
      }

      const servers = serverUrl ? [serverUrl] : ['https://api.mymonero.com'];
      for (const s of servers) {
        try {
          const data = await tryOneServer(s, address, viewKey);
          console.info(`[MoneroWalletService] Consulta directa exitosa contra ${s}.`);
          return toResult(data, s);
        } catch (err) {
          console.warn(`[MoneroWalletService] ${s} falló: ${err.message}`);
        }
      }
      console.warn('[MoneroWalletService] mymonero (saldo on-chain) no disponible: el servicio fue discontinuado el 6 de enero de 2026. Probando Nanopool como respaldo (balance de minería pendiente, no on-chain).');
    }

    try {
      const balance = await getNanopoolPendingBalance(address);
      return {
        balanceXmr: balance,
        unlockedXmr: balance,
        txCount: 0,
        serverUsed: 'https://api.nanopool.org (balance de minería pendiente)',
        source: 'nanopool-pending',
        raw: null,
      };
    } catch (nanoErr) {
      console.error('[MoneroWalletService] Nanopool tampoco respondió:', nanoErr.message);
      throw new Error(
        `No se pudo verificar ningún saldo. El servicio público de MyMonero fue ` +
        `discontinuado (6 de enero de 2026) y Nanopool no tiene datos para esta ` +
        `dirección. Detalle: ${nanoErr.message}`
      );
    }
  }

  global.MoneroWalletService = {
    createRealWallet,
    restoreRealWalletFromSeed,
    getRealBalanceViewOnly,
  };
})(window);
