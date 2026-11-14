/**
 * ternaryfox-sidebar — thin loader (host half).
 *
 * The plugin does NOT contain the app. On boot it pulls a pinned dist release
 * from the ternaryfox-website GitHub repo, caches it on disk, and serves it:
 *
 *   /tfapp/*  static app shell (JS transformed: '/api/...' → '/tfapi/api/...')
 *   /tfapi/*  reverse proxy → tf-gateway (default http://127.0.0.1:8961)
 *
 * App updates happen ONLY by bumping `appRelease` here and shipping a new
 * plugin version (dsh plugin update + restart). Dev work never touches DSH:
 * it lives in the website repo and ends at `git push` + release.
 */

import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, normalize, extname } from 'node:path'
import { spawnSync } from 'node:child_process'

const TFAPI = '/tfapi'
const TFAPP = '/tfapp'
const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'host',
])
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
}

function cacheRoot() {
  const home = process.env.DSH_HOME || join(tmpdir(), '.dsh')
  return join(home, 'state', 'ternaryfox-sidebar')
}

/** Download + unzip the pinned release once; returns the dist dir. */
async function ensureApp(cfg) {
  const dir = join(cacheRoot(), cfg.appRelease)
  const marker = join(dir, '.complete')
  if (existsSync(marker)) return dir
  mkdirSync(dir, { recursive: true })
  const url = `https://github.com/${cfg.appRepo}/releases/download/${cfg.appRelease}/tfapp-dist.zip`
  const zipPath = join(cacheRoot(), `${cfg.appRelease}.zip`)
  mkdirSync(cacheRoot(), { recursive: true })
  const res = await fetch(url)
  if (!res.ok) throw new Error(`release download failed ${res.status}: ${url}`)
  writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()))
  // unzip via python3 (host has it; avoids a zip dependency)
  const r = spawnSync('python3', ['-m', 'zipfile', '-e', zipPath, dir], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error('unzip failed: ' + (r.stderr || '').slice(0, 200))
  writeFileSync(marker, new Date().toISOString())
  return dir
}

/** Serve one static file; transform JS/HTML so the app talks to /tfapi. */
function serveFile(res, file) {
  let body = readFileSync(file)
  const ext = extname(file).toLowerCase()
  if (ext === '.js' || ext === '.mjs') {
    let s = body.toString('utf8')
    s = s.replaceAll("'/api/", "'/tfapi/api/")
      .replaceAll('"/api/', '"/tfapi/api/')
      .replaceAll('`/api/', '`/tfapi/api/')
    body = Buffer.from(s, 'utf8')
  } else if (ext === '.html') {
    let s = body.toString('utf8')
    s = s.replaceAll('href="/_astro/', 'href="/tfapp/_astro/')
      .replaceAll('src="/_astro/', 'src="/tfapp/_astro/')
      .replaceAll('href="/favicon', 'href="/tfapp/favicon')
      .replaceAll('href="/manifest', 'href="/tfapp/manifest')
    body = Buffer.from(s, 'utf8')
  }
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'cache-control': 'no-store',
    'content-length': String(body.length),
  })
  res.end(body)
}

export function apply(ctx, config) {
  const cfg = {
    gateway: 'http://127.0.0.1:8961',
    appRepo: 'wangchai1527-prog/ternaryfox-sidebar',
    appRelease: 'app-v0.2.0',
    ...(config && typeof config === 'object' ? config : {}),
  }

  let appDir = null
  let appError = null

  // 1) /tfapi/* → gateway proxy (SSE pass-through)
  const proxy = async (req, res) => {
    const url = new URL(String(req.url ?? '/'), 'http://localhost')
    const sub = url.pathname.slice(TFAPI.length) || '/'
    if (!sub.startsWith('/')) {
      res.writeHead(400, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'bad tfapi path' }))
      return
    }
    const chunks = []
    for await (const c of req) chunks.push(c)
    const body = chunks.length ? Buffer.concat(chunks) : undefined
    const headers = {}
    for (const [k, v] of Object.entries(req.headers)) {
      if (!HOP_BY_HOP.has(k.toLowerCase())) headers[k] = v
    }
    if (body !== undefined) headers['content-length'] = String(body.length)
    let up
    try {
      up = await fetch(cfg.gateway + sub + (url.search || ''), {
        method: (req.method || 'GET').toUpperCase(),
        headers,
        body: body === undefined || req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
        redirect: 'manual',
      })
    } catch (e) {
      res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: 'tf-gateway unreachable', gateway: cfg.gateway }))
      return
    }
    const out = {}
    up.headers.forEach((v, k) => {
      if (!HOP_BY_HOP.has(k.toLowerCase()) && k.toLowerCase() !== 'content-encoding') out[k] = v
    })
    res.writeHead(up.status, out)
    res.flushHeaders?.()
    if (!up.body) { res.end(); return }
    for await (const c of up.body) {
      res.write(c)
      if (String(out['content-type'] || '').includes('text/event-stream')) res.flush?.()
    }
    res.end()
  }

  // 2) /tfapp/* → cached release dist
  const statics = async (req, res) => {
    if (!appDir) {
      if (appError) {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: 'app dist unavailable', detail: appError }))
        return
      }
      res.writeHead(503, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: 'app dist still downloading' }))
      return
    }
    const url = new URL(String(req.url ?? '/'), 'http://localhost')
    let rel = decodeURIComponent(url.pathname.slice(TFAPP.length)) || '/app/index.html'
    rel = normalize(rel).replace(/^(\.\.[/\\])+/, '')
    if (rel === '/' || rel === '') rel = '/app/index.html'
    const file = normalize(join(appDir, rel))
    if (!file.startsWith(appDir) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'not found', path: rel }))
      return
    }
    serveFile(res, file)
  }

  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: TFAPI, handler: proxy }),
    'ternaryfox-sidebar: /tfapi proxy')
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: TFAPP, handler: statics }),
    'ternaryfox-sidebar: /tfapp static')

  // fetch the pinned release in the background; boot never blocks on GitHub
  ensureApp(cfg).then(
    (d) => { appDir = d; try { ctx.log?.info?.(`ternaryfox app dist ready: ${cfg.appRelease}`) } catch {} },
    (e) => { appError = String((e && e.message) || e) },
  )
}

export const inject = ['webServer']

export default { inject, apply }
