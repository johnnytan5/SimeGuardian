// Run with: node --test app/src/timeout.test.ts (no React Native imports here)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { fetchWithTimeout } from './timeout.ts'

test('fetchWithTimeout rejects quickly when the server never answers', async () => {
  const hang = http.createServer(() => {}) // accepts, never responds — like a dropped Wi-Fi path
  await new Promise<void>(r => hang.listen(0, r))
  const url = `http://localhost:${(hang.address() as AddressInfo).port}/`
  const t0 = Date.now()
  await assert.rejects(fetchWithTimeout(url, 300))
  assert.ok(Date.now() - t0 < 1000)
  hang.closeAllConnections(); hang.close()
})
