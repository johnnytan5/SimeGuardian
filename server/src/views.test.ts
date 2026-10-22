import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createWorld, consent, goQuiet, tick, MIN, type World } from './engine.ts'
import { securityView, familyView, residentView } from './views.ts'

function quietLee(): World {
  const w = createWorld(0)
  consent(w, 'lee')
  goQuiet(w, 'lee', 0)
  return w
}

test('securityView never exposes home/away', () => {
  const w = quietLee()
  tick(w, 10_000); tick(w, 20_000)
  const items = securityView(w)
  assert.equal(items.length, 1)
  for (const k of ['home', 'away', 'lastActivity', 'today', 'baseline']) assert.ok(!(k in items[0]), k)
})

test('securityView lists only SECURITY_ESCALATED or guard-in-progress alerts', () => {
  assert.deepEqual(securityView(quietLee()), [])
})

test('familyView is status only', () => {
  const w = quietLee()
  tick(w, 10_000)
  const v = familyView(w, 'lee')
  assert.deepEqual(Object.keys(v).sort(), ['alertState', 'id', 'resident', 'since', 'status'])
  assert.equal(v.status, 'ESCALATED')
})

test('residentView countdown maps 10 s real to 5 sim-min', () => {
  assert.equal(residentView(quietLee(), 'lee', 5_000).countdownSimMs, 2.5 * MIN)
})

test('residentView countdown is null outside CHECKIN_PENDING', () => {
  const w = quietLee()
  tick(w, 10_000)
  assert.equal(residentView(w, 'lee', 11_000).countdownSimMs, null)
  assert.equal(residentView(createWorld(0), 'lee', 0).countdownSimMs, null)
})

test('securityView escalatedAt matches the sim time the welfare check was requested', () => {
  const w = quietLee()
  const startedSim = w.households.find(h => h.id === 'lee')!.alert!.startedSim
  tick(w, 10_000); tick(w, 20_000)
  assert.equal(securityView(w)[0].escalatedAt, startedSim + 10 * MIN)
  assert.equal(w.sim - startedSim, 10 * MIN)
})
