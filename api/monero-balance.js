/**
 * Vercel Serverless Function — proxy para consultar saldo real de Monero.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO:
 * El navegador del usuario NO puede llamar directamente a api.mymonero.com
 * porque ese servidor no manda la cabecera "Access-Control-Allow-Origin"
 * (política CORS). Esa restricción SOLO aplica a peticiones hechas desde
 * un navegador. Una petición hecha servidor-a-servidor (como esta función
 * corriendo en Vercel) no tiene ese problema, porque CORS no existe fuera
 * del navegador.
 *
 * Flujo:
 *   navegador del usuario -> POST /api/monero-balance (tu propio dominio,
 *   mismo origen, sin CORS) -> esta función -> POST api.mymonero.com
 *   (servidor a servidor) -> respuesta -> tu función se la reenvía al
 *   navegador con las cabeceras CORS correctas para tu propio dominio.
 *
 * Seguridad: esta función solo reenvía "address" + "view_key" (view-only).
 * Nunca debe aceptar ni reenviar semilla ni clave de gasto.
 */

const UPSTREAM_SERVERS = [
  'https://api.mymonero.com',
];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  try {
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Método no permitido, usa POST.' });
      return;
    }

    const { address, view_key: viewKey } = req.body || {};

    if (!address || !viewKey) {
      res.status(400).json({ error: 'Faltan "address" y/o "view_key" en el cuerpo de la petición.' });
      return;
    }
    if (req.body.seed || req.body.spend_key || req.body.spendKey) {
      res.status(400).json({ error: 'Esta función es solo view-only: no aceptes ni envíes semilla ni clave de gasto.' });
      return;
    }

    const attempts = [];
    for (const upstream of UPSTREAM_SERVERS) {
      try {
        const upstreamRes = await fetch(`${upstream}/get_address_info`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address, view_key: viewKey }),
        });

        const text = await upstreamRes.text();

        if (!upstreamRes.ok) {
          attempts.push(`${upstream}: HTTP ${upstreamRes.status} — ${text.slice(0, 300)}`);
          continue;
        }

        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          attempts.push(`${upstream}: respuesta no-JSON — ${text.slice(0, 300)}`);
          continue;
        }

        res.status(200).json({ ok: true, server: upstream, data });
        return;
      } catch (err) {
        attempts.push(`${upstream}: ${err.name} — ${err.message}`);
      }
    }

    // 200 con ok:false (no 502) para que el detalle SIEMPRE llegue al
    // frontend en JSON legible, en vez de un "Bad Gateway" mudo.
    res.status(200).json({
      ok: false,
      error: 'No se pudo consultar ningún servidor de saldo real.',
      attempts,
    });
  } catch (fatalErr) {
    res.status(200).json({
      ok: false,
      error: `Excepción no controlada en la función: ${fatalErr.name} — ${fatalErr.message}`,
    });
  }
};
