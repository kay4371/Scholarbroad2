/**
 * ScholarBroad — Cloudflare Worker (Final)
 *
 * Environment variables (Cloudflare Dashboard → Worker → Settings → Variables):
 *   BACKEND_URL   = https://your-render-app.onrender.com
 *   ADMIN_SECRET  = your-secret-key
 *   SITE_ORIGIN   = https://scholarbroad.suntrenia.com
 *
 * Cron triggers to add in Cloudflare Dashboard → Triggers:
 *   0 8 * * *       Daily broadcast (9AM WAT)
 *   0 6 * * *       Process raw posts (7AM WAT)
 *   0 5 */5 * *     Fetch WhatsApp groups (every 5 days, 6AM WAT)
 *   0 9 * * *       Daily user email send cycle (10AM WAT)
 *   0 12 * * *      Check professor replies (1PM WAT)
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(env) });
    }

    // All traffic proxied to backend
    return proxyToBackend(request, env, pathname + url.search);
  },

  async scheduled(event, env, ctx) {
    console.log(`[CRON] Triggered: ${event.cron}`);

    switch (event.cron) {

      // ── Content pipeline ────────────────────────────────────────────────
      case '0 8 * * *':
        // Broadcast one scholarship to WhatsApp group (9AM WAT)
        ctx.waitUntil(triggerBackend(env, '/api/cron/daily-post'));
        break;

      case '0 6 * * *':
        // Process raw fetched posts through Groq AI (7AM WAT)
        ctx.waitUntil(triggerBackend(env, '/api/cron/process-posts'));
        break;

      case '0 5 */5 * *':
        // Fetch from WhatsApp source groups every 5 days (6AM WAT)
        ctx.waitUntil(triggerBackend(env, '/api/cron/fetch-groups'));
        break;

      // ── User PhD pipeline ───────────────────────────────────────────────
      case '0 9 * * *':
        // Send approved professor emails for all active users (10AM WAT)
        ctx.waitUntil(triggerBackend(env, '/api/cron/daily-email-cycle'));
        break;

      case '0 12 * * *':
        // Check Gmail inboxes for professor replies (1PM WAT)
        ctx.waitUntil(triggerBackend(env, '/api/cron/check-replies'));
        break;

      default:
        console.log(`[CRON] Unknown schedule: ${event.cron}`);
    }
  }
};

// ── Proxy to backend ──────────────────────────────────────────────────────────
async function proxyToBackend(request, env, path) {
  const target = `${env.BACKEND_URL}${path}`;
  try {
    const resp = await fetch(new Request(target, {
      method: request.method,
      headers: request.headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'follow'
    }));
    const res = new Response(resp.body, resp);
    res.headers.set('Access-Control-Allow-Origin', '*');
    return res;
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Backend unavailable', detail: err.message }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ── Hit a backend cron endpoint with admin auth ───────────────────────────────
async function triggerBackend(env, path) {
  try {
    const res = await fetch(`${env.BACKEND_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': env.ADMIN_SECRET
      }
    });
    const data = await res.json();
    console.log(`[CRON] ${path} →`, JSON.stringify(data));
  } catch (err) {
    console.error(`[CRON] ${path} FAILED:`, err.message);
  }
}

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.SITE_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-secret, Authorization'
  };
}
