/**
 * ternaryfox-sidebar — host half.
 *
 * Registers one prefix route: /tfapi/* → tf-gateway (default
 * http://127.0.0.1:8961). The gateway base URL can be overridden per-install
 * via the bundle config in the profile's cordis.patch.yml:
 *
 *   - insert:
 *       - id: ternaryfox-sidebar
 *         name: ternaryfox-sidebar
 *         config:
 *           gateway: http://127.0.0.1:8961
 *
 * The proxy forwards method, request body, content-type and cookies, and
 * streams the upstream response through (SSE works: assistant_delta frames
 * are flushed as they arrive). Set-Cookie from the gateway lands on the DSH
 * origin, so the browser tab stays same-origin with zero CORS setup.
 */

const PREFIX = '/tfapi'
const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'host',
])

export function apply(ctx, config) {
  const gateway = String(
    (config && config.gateway) || 'http://127.0.0.1:8961',
  ).replace(/\/+$/, '')

  const handler = async (req, res) => {
    const url = new URL(String(req.url ?? '/'), 'http://localhost')
    const path = url.pathname
    const sub = path.startsWith(PREFIX) ? path.slice(PREFIX.length) || '/' : path
    if (!sub.startsWith('/')) {
      res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: 'bad tfapi path' }))
      return
    }
    const target = gateway + sub + (url.search || '')

    // Buffer the request body (chat payloads are <= ~8 KB); responses stream.
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = chunks.length ? Buffer.concat(chunks) : undefined

    const headers = {}
    for (const [k, v] of Object.entries(req.headers)) {
      if (!HOP_BY_HOP.has(k.toLowerCase())) headers[k] = v
    }
    if (body !== undefined) headers['content-length'] = String(body.length)

    let upstream
    try {
      upstream = await fetch(target, {
        method: (req.method || 'GET').toUpperCase(),
        headers,
        body: body === undefined || req.method === 'GET' || req.method === 'HEAD'
          ? undefined
          : body,
        redirect: 'manual',
      })
    } catch (e) {
      res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({
        error: 'tf-gateway unreachable',
        gateway,
        detail: String((e && e.cause && e.cause.code) || e && e.message || e),
      }))
      return
    }

    const outHeaders = {}
    upstream.headers.forEach((v, k) => {
      if (!HOP_BY_HOP.has(k.toLowerCase()) && k.toLowerCase() !== 'content-encoding') {
        outHeaders[k] = v
      }
    })
    res.writeHead(upstream.status, outHeaders)
    res.flushHeaders?.()
    if (!upstream.body) { res.end(); return }
    for await (const chunk of upstream.body) {
      res.write(chunk)
      // SSE: push each event to the browser immediately.
      if (String(outHeaders['content-type'] || '').includes('text/event-stream')) {
        res.flush?.()
      }
    }
    res.end()
  }

  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: PREFIX, handler }),
    'ternaryfox-sidebar: /tfapi proxy')
}

export const inject = ['webServer']

export default { inject, apply }
