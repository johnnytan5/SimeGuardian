import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { startServer } from './index.ts'

let server: Server
let base: string

before(async () => {
  server = await startServer(0)
  base = `http://localhost:${(server.address() as AddressInfo).port}`
})
after(() => server.close())

const post = (path: string, body?: string) =>
  fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body })

test('unknown household → 404', async () => {
  assert.equal((await fetch(base + '/api/resident/nope')).status, 404)
})

test('consent then quiet → resident sees CHECKIN_PENDING', async () => {
  assert.equal((await post('/api/households/lee/consent')).status, 200)
  assert.equal((await post('/api/households/lee/quiet')).status, 200)
  const v = await (await fetch(base + '/api/resident/lee')).json()
  assert.equal(v.alertState, 'CHECKIN_PENDING')
})

test('bad JSON body → 400', async () => {
  assert.equal((await post('/api/households/lee/checkin', 'not json')).status, 400)
})

test('GET /api/model returns the latest training run report', async () => {
  const r = await (await fetch(base + '/api/model')).json()
  assert.match(r.run_id, /^run-/)
  assert.ok(r.test.rule && r.test.model)
})

test('GET / serves the dashboard html', async () => {
  const r = await fetch(base + '/')
  assert.equal(r.status, 200)
  assert.match(r.headers.get('content-type')!, /text\/html/)
})
