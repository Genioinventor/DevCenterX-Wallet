/**
 * Netlify Function — proxy para consultar saldo real de Monero (view-only).
 *
 * Misma razón de ser que api/monero-balance.js (versión Vercel): el
 * navegador no puede llamar directo a api.mymonero.com por CORS; esta
 * función corre en el servidor de Netlify y reenvía la petición sin ese
 * problema (CORS solo existe entre navegador <-> servidor, no entre
 * servidor <-> servidor).
 *
 * URL resultante una vez desplegado en Netlify:
 *   https://TU-SITIO.netlify.app/.netlify/functions/monero-balance
 * (o /api/monero-balance si configuras el redirect de netlify.toml de abajo)
 *
 * Seguridad: solo procesa address + view_key (view-only). Nunca acepta
 * semilla ni clave de gasto.
 */

const UPSTREAM_SERVERS = ['https://api.mymonero.com'];

// Netlify Functions corre en Node; en versiones sin `fetch` global (Node < 18
// según cómo esté configurado el sitio) hay que usar un polyfill. Si `fetch`
// ya existe (Node 18+), se usa tal cual.
const doFetch = typeof fetch === 'function' ? fetch : null;

exports.handler = async function (event) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // TODO el cuerpo de la función va envuelto en try/catch: así, cualquier
  // excepción inesperada devuelve un JSON con el detalle real en vez de un
  // 502 "Bad Gateway" genérico y mudo que da Netlify cuando la función
  // truena sin controlar el error.
  try {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers: corsHeaders, body: '' };
    }

    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Método no permitido, usa POST.' }),
      };
    }

    if (!doFetch) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'El entorno de Netlify no tiene "fetch" disponible en esta función (Node demasiado viejo). ' +
            'Fija el runtime a Node 18+ en netlify.toml ([functions] node_bundler / o Site settings > Build & deploy > Environment > NODE_VERSION=18) y vuelve a desplegar.',
        }),
      };
    }

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (e) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Body no es JSON válido: ' + e.message }) };
    }

    const { address, view_key: viewKey } = body;

    if (!address || !viewKey) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Faltan "address" y/o "view_key" en el cuerpo de la petición.' }),
      };
    }
    if (body.seed || body.spend_key || body.spendKey) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Esta función es solo view-only: no envíes semilla ni clave de gasto.' }),
      };
    }

    const attempts = [];
    for (const upstream of UPSTREAM_SERVERS) {
      try {
        const upstreamRes = await doFetch(`${upstream}/get_address_info`, {
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

        return {
          statusCode: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ok: true, server: upstream, data }),
        };
      } catch (err) {
        attempts.push(`${upstream}: ${err.name} — ${err.message}`);
      }
    }

    // Nota: devolvemos 200 con ok:false (en vez de 502) para que el detalle
    // SIEMPRE le llegue al frontend en JSON legible, en vez de que el
    // navegador solo vea "502 Bad Gateway" sin cuerpo útil.
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ ok: false, error: 'No se pudo consultar ningún servidor de saldo real.', attempts }),
    };
  } catch (fatalErr) {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ ok: false, error: `Excepción no controlada en la función: ${fatalErr.name} — ${fatalErr.message}` }),
    };
  }
};
