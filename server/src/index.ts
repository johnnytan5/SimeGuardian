import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { advanceGuard, checkIn, consent, createWorld, goQuiet, reset, setAway, tick } from './engine.ts'
import { dashboardView, familyView, residentView, securityView } from './views.ts'

const PUBLIC = join(import.meta.dirname, '..', 'public')
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' }

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

async function readJson(req: http.IncomingMessage): Promise<any> {
  let raw = ''
  for await (const chunk of req) raw += chunk
  if (!raw) return {}
  try { return JSON.parse(raw) } catch { throw new HttpError(400, 'bad json') }
}

export function startServer(port: number): Promise<http.Server> {
  const world = createWorld(Date.now())
  const timer = setInterval(() => tick(world, Date.now()), 250)

  async function api(req: http.IncomingMessage, path: string): Promise<unknown> {
    const now = Date.now()
    const [, , kind, id, action] = path.split('/') // '', 'api', kind, id, action
    if (req.method === 'GET') {
      if (kind === 'state') return dashboardView(world, now)
      if (kind === 'resident' && id) return residentView(world, id, now)
      if (kind === 'family' && id) return familyView(world, id)
      if (kind === 'security') return securityView(world)
    }
    if (req.method === 'POST') {
      const body = await readJson(req)
      if (kind === 'reset') { reset(world, now); return { ok: true } }
      if (kind === 'settings') {
        if (typeof body.speed === 'number' && body.speed > 0) world.speed = body.speed
        if (typeof body.stepMs === 'number' && body.stepMs >= 1000) world.stepMs = body.stepMs
        return { ok: true }
      }
      if (kind === 'households' && id) {
        if (action === 'quiet') goQuiet(world, id, now)
        else if (action === 'checkin') checkIn(world, id, body.actor === 'family' ? 'family' : 'resident')
        else if (action === 'away') setAway(world, id, body.away === true)
        else if (action === 'consent') consent(world, id)
        else if (action === 'guard') advanceGuard(world, id)
        else throw new HttpError(404, 'not found')
        return { ok: true }
      }
    }
    throw new HttpError(404, 'not found')
  }

  const server = http.createServer(async (req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname
    if (path.startsWith('/api/')) {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Headers', 'content-type')
      if (req.method === 'OPTIONS') { res.writeHead(204).end(); return }
      try {
        const out = await api(req, path)
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out))
      } catch (e: any) {
        const status = e instanceof HttpError ? e.status : e?.message === 'unknown household' ? 404 : 500
        res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ error: e?.message ?? 'error' }))
      }
      return
    }
    if (path.includes('..')) { res.writeHead(400).end(); return }
    const file = path === '/' ? 'index.html' : path.slice(1)
    try {
      const data = await readFile(join(PUBLIC, file))
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(data)
    } catch {
      res.writeHead(404).end('not found')
    }
  })
  server.on('close', () => clearInterval(timer))
  return new Promise(resolve => server.listen(port, '0.0.0.0', () => resolve(server)))
}

if (import.meta.main) {
  await startServer(4000)
  console.log('SimeGuardian server on http://localhost:4000')
}
