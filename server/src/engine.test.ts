import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createWorld, tick, goQuiet, checkIn, setAway, consent, advanceGuard, reset, MIN,
  type World,
} from './engine.ts'

const get = (w: World, id: string) => w.households.find(h => h.id === id)!

function quietLee(realNow = 0): World {
  const w = createWorld(0)
  consent(w, 'lee')
  goQuiet(w, 'lee', realNow)
  return w
}

test('createWorld seeds Madam Lee at 08:00, consented false, stepMs 10000', () => {
  const w = createWorld(0)
  const lee = get(w, 'lee')
  assert.equal(lee.resident, 'Madam Lee')
  assert.equal(lee.consented, false)
  assert.equal(new Date(w.sim).getHours(), 8)
  assert.equal(w.stepMs, 10_000)
  assert.ok(w.households.length >= 4 && w.households.length <= 5)
  assert.ok(w.households.filter(h => h.id !== 'lee').every(h => h.consented))
})

test('goQuiet jumps sim to threshold crossing and opens CHECKIN_PENDING', () => {
  const w = createWorld(0)
  consent(w, 'lee')
  const lee = get(w, 'lee')
  goQuiet(w, 'lee', 1000)
  assert.equal(lee.alert!.state, 'CHECKIN_PENDING')
  assert.equal(w.sim - lee.lastActivity, lee.thresholdMin * MIN)
  assert.equal(lee.alert!.phaseEndsAt, 1000 + 10_000)
})

test('full escalation sim-times: +5, +5, guard +2 +3 +3', () => {
  const w = quietLee()
  const t0 = w.sim
  tick(w, 10_000)
  assert.equal(get(w, 'lee').alert!.state, 'FAMILY_ESCALATED')
  assert.equal(w.sim - t0, 5 * MIN)
  tick(w, 20_000)
  assert.equal(get(w, 'lee').alert!.state, 'SECURITY_ESCALATED')
  assert.equal(w.sim - t0, 10 * MIN)
  advanceGuard(w, 'lee'); advanceGuard(w, 'lee'); advanceGuard(w, 'lee')
  assert.equal(get(w, 'lee').alert!.state, 'RESOLVED')
  assert.equal(get(w, 'lee').alert!.guard, 'ARRIVED_SAFE')
  assert.equal(w.sim - t0, 18 * MIN)
})

test('resident checkIn resolves and stops escalation', () => {
  const w = quietLee()
  checkIn(w, 'lee', 'resident')
  tick(w, 30_000)
  assert.equal(get(w, 'lee').alert!.state, 'RESOLVED')
  assert.equal(w.log.at(-1)!.actor, 'resident')
})

test('family checkIn resolves FAMILY_ESCALATED', () => {
  const w = quietLee()
  tick(w, 10_000)
  checkIn(w, 'lee', 'family')
  assert.equal(get(w, 'lee').alert!.state, 'RESOLVED')
  assert.equal(w.log.at(-1)!.actor, 'family')
})

test('checkIn after expiry tick still resolves', () => {
  const w = quietLee()
  checkIn(w, 'lee', 'resident')
  tick(w, 10_000)
  assert.equal(get(w, 'lee').alert!.state, 'RESOLVED')
})

test('goQuiet is idempotent', () => {
  const w = quietLee()
  goQuiet(w, 'lee', 500)
  assert.equal(w.log.filter(e => e.type === 'threshold').length, 1)
  assert.equal(get(w, 'lee').alert!.phaseEndsAt, 10_000)
})

test('setAway during alert resolves it', () => {
  const w = quietLee()
  setAway(w, 'lee', true)
  assert.equal(get(w, 'lee').alert!.state, 'RESOLVED')
  assert.equal(w.log.at(-1)!.actor, 'resident')
  goQuiet(w, 'lee', 100)
  assert.equal(get(w, 'lee').alert!.state, 'RESOLVED')
  for (let r = 1; r <= 1200; r++) tick(w, r * 250) // 10 sim-hours
  assert.equal(get(w, 'lee').alert!.state, 'RESOLVED')
})

test('reset clears pending escalation', () => {
  const w = quietLee()
  tick(w, 10_000)
  assert.equal(get(w, 'lee').alert!.state, 'FAMILY_ESCALATED')
  reset(w, 15_000)
  tick(w, 40_000)
  assert.equal(get(w, 'lee').alert, null)
  assert.equal(w.log.length, 0)
  assert.equal(get(w, 'lee').consented, false)
})

test('not consented: goQuiet does nothing', () => {
  const w = createWorld(0)
  goQuiet(w, 'lee', 0)
  assert.equal(get(w, 'lee').alert, null)
})

test('normal households never alert across a full sim-day incl. night', () => {
  const w = createWorld(0)
  w.households.forEach(h => consent(w, h.id))
  for (let r = 0; r < 3000; r++) tick(w, r * 250) // speed 120 → ≈ 25 sim-hours
  assert.ok(w.sim - createWorld(0).sim >= 24 * 60 * MIN)
  assert.ok(w.households.every(h => h.alert === null))
})

test('goQuiet on lee does not alert other households', () => {
  const w = createWorld(0)
  w.households.forEach(h => consent(w, h.id))
  goQuiet(w, 'lee', 0)
  tick(w, 10_000); tick(w, 20_000)
  assert.ok(w.households.filter(h => h.id !== 'lee').every(h => h.alert === null))
})

test('resolved alert does not re-fire', () => {
  const w = quietLee()
  tick(w, 10_000); tick(w, 20_000)
  advanceGuard(w, 'lee'); advanceGuard(w, 'lee'); advanceGuard(w, 'lee')
  for (let r = 1; r <= 8; r++) tick(w, 20_000 + r * 250)
  assert.equal(get(w, 'lee').alert!.state, 'RESOLVED')
  assert.equal(w.log.filter(e => e.type === 'threshold').length, 1)
})

test('unknown id throws', () => {
  assert.throws(() => goQuiet(createWorld(0), 'nope', 0), /unknown household/)
})
