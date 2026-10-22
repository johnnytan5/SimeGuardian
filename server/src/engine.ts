// Demo engine: one in-memory world, a simulated clock, fake activity signals,
// the inactivity rule and the escalation state machine. Pure — no timers, no I/O.

export type AlertState = 'OK' | 'CHECKIN_PENDING' | 'FAMILY_ESCALATED' | 'SECURITY_ESCALATED' | 'RESOLVED'
export type GuardState = 'NONE' | 'ASSIGNED' | 'ON_THE_WAY' | 'ARRIVED_SAFE'
export type Actor = 'system' | 'resident' | 'family' | 'security' | 'presenter'

export type Signal = 'electricity' | 'water' | 'gate' | 'app'
// Why a check-in was sent: one line per signal, comparing the quiet window with her usual pattern.
export interface Reason { signal: Signal; label: string; detail: string; concerning: boolean; percentOfUsual: number | null }
export interface Alert { state: AlertState; guard: GuardState; phaseEndsAt: number | null; startedSim: number; reasons: Reason[] }
interface Activity { sim: number; gate: boolean; app: boolean }
export interface LogEvent { sim: number; householdId: string; type: string; actor: Actor; text: string }
export interface Household {
  id: string; resident: string; unit: string; familyContact: string
  baseline: number[]
  today: number[]
  thresholdMin: number
  activityEveryMin: number
  lastActivity: number
  activities: Activity[]
  home: boolean; away: boolean; consented: boolean; quiet: boolean
  alert: Alert | null
}
export interface World { sim: number; lastReal: number; speed: number; stepMs: number; households: Household[]; log: LogEvent[] }

export const MIN = 60_000
export const CHECKIN_WINDOW = 5 * MIN
export const FAMILY_WINDOW = 5 * MIN
const GUARD_STEPS: [GuardState, number, string][] = [
  ['ASSIGNED', 2 * MIN, 'Guard assigned'],
  ['ON_THE_WAY', 3 * MIN, 'Guard on the way'],
  ['ARRIVED_SAFE', 3 * MIN, 'Guard arrived — resident safe'],
]
// Simulated meter readings per activity event, plus an always-on electricity baseload (fridge, router).
const WATER_L_PER_EVENT = 15
const KWH_PER_EVENT = 0.2
const BASELOAD_KWH_PER_H = 0.08
const AWAKE_FROM = 6
const AWAKE_UNTIL = 23

// Typical activity events per hour: quiet nights, morning and evening peaks.
// Peaks sit near the generator cadence (~2–4/h) so today's bars and the usual pattern share a scale.
const DAY = [0, 0, 0, 0, 0, 0, 1, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 2, 1, 0]
const shift = (by: number) => DAY.map((_, i) => DAY[(i - by + 24) % 24])

function seed(): Omit<Household, 'today' | 'lastActivity' | 'activities' | 'home' | 'away' | 'consented' | 'quiet' | 'alert'>[] {
  return [
    { id: 'lee', resident: 'Madam Lee', unit: 'No. 12, Jalan Elmina 3', familyContact: 'Daniel', baseline: DAY, thresholdMin: 120, activityEveryMin: 25 },
    { id: 'tan', resident: 'Mr Tan', unit: 'No. 4, Jalan Elmina 3', familyContact: 'Mei Ling', baseline: shift(1), thresholdMin: 150, activityEveryMin: 20 },
    { id: 'rahman', resident: 'Encik Rahman', unit: 'No. 27, Jalan Elmina 5', familyContact: 'Aisyah', baseline: shift(-1), thresholdMin: 180, activityEveryMin: 30 },
    { id: 'kaur', resident: 'Mrs Kaur', unit: 'No. 9, Jalan Elmina 6', familyContact: 'Harpreet', baseline: DAY, thresholdMin: 120, activityEveryMin: 15 },
    { id: 'wong', resident: 'Mr Wong', unit: 'No. 31, Jalan Elmina 6', familyContact: 'Kevin', baseline: shift(2), thresholdMin: 240, activityEveryMin: 40 },
  ]
}

export function createWorld(realNow: number): World {
  const start = new Date()
  start.setHours(8, 0, 0, 0)
  const sim = start.getTime()
  return {
    sim, lastReal: realNow, speed: 120, stepMs: 10_000, log: [],
    households: seed().map(h => ({
      ...h, today: new Array(24).fill(0), lastActivity: sim, activities: [],
      // Everyone, Madam Lee included, starts opted in so the demo can begin straight away
      home: true, away: false, consented: true, quiet: false, alert: null,
    })),
  }
}

const hourOf = (sim: number) => new Date(sim).getHours()
const awake = (sim: number) => { const h = hourOf(sim); return h >= AWAKE_FROM && h < AWAKE_UNTIL }
const active = (h: Household) => h.alert !== null && h.alert.state !== 'RESOLVED'

function find(w: World, id: string): Household {
  const h = w.households.find(x => x.id === id)
  if (!h) throw new Error('unknown household')
  return h
}

function log(w: World, h: Household, type: string, actor: Actor, text: string) {
  w.log.push({ sim: w.sim, householdId: h.id, type, actor, text })
}

// Gap since last activity, not counting quiet hours (time before today's 06:00).
function gap(h: Household, sim: number): number {
  const morning = new Date(sim)
  morning.setHours(AWAKE_FROM, 0, 0, 0)
  return sim - Math.max(h.lastActivity, morning.getTime())
}

const fmt = (n: number, unit: string) => `${n === 0 || n >= 10 ? Math.round(n) : n.toFixed(1)} ${unit}`
const pct = (actual: number, usual: number) => usual > 0 ? Math.round(actual / usual * 100) : null

// Compare the quiet window with the household's own baseline for the same hours.
export function explain(h: Household, sim: number): Reason[] {
  const from = sim - h.thresholdMin * MIN
  const hours = (sim - from) / (60 * MIN)
  let usualEvents = 0
  for (let t = from; t < sim; t += 60 * MIN) usualEvents += h.baseline[hourOf(t)] * Math.min(1, (sim - t) / (60 * MIN))
  // If the window falls in her usual quiet hours (e.g. the presenter triggers it at night), comparing with
  // ~0 would read as normal; compare with her typical active-hours level instead.
  const active = h.baseline.slice(AWAKE_FROM, AWAKE_UNTIL)
  const activeEvents = active.reduce((sum, n) => sum + n, 0) / active.length * hours
  const offHours = usualEvents < activeEvents * 0.25
  if (offHours) usualEvents = activeEvents
  const usually = offHours ? 'in active hours' : 'at this time'
  const recent = h.activities.filter(a => a.sim >= from)
  const window = `Last ${hours >= 1 ? `${+hours.toFixed(1)} h` : `${Math.round(hours * 60)} min`}`

  const kwh = BASELOAD_KWH_PER_H * hours + recent.length * KWH_PER_EVENT
  const usualKwh = BASELOAD_KWH_PER_H * hours + usualEvents * KWH_PER_EVENT
  const litres = recent.length * WATER_L_PER_EVENT
  const usualLitres = usualEvents * WATER_L_PER_EVENT
  const ePct = pct(kwh, usualKwh), wPct = pct(litres, usualLitres)

  const morning = new Date(sim); morning.setHours(AWAKE_FROM, 0, 0, 0)
  if (morning.getTime() > sim) morning.setDate(morning.getDate() - 1) // before dawn: since yesterday's 6 am
  const lastGate = h.activities.filter(a => a.gate && a.sim >= morning.getTime()).at(-1)
  const lastApp = h.activities.filter(a => a.app).at(-1)
  const appQuietH = lastApp ? (sim - lastApp.sim) / (60 * MIN) : null

  return [
    { signal: 'water', percentOfUsual: wPct, concerning: wPct !== null && wPct < 50,
      label: litres === 0 ? 'No water used' : `Water ${wPct}% of usual`,
      detail: `${window}: ${fmt(litres, 'L')} (usually about ${fmt(usualLitres, 'L')} ${usually})` },
    { signal: 'electricity', percentOfUsual: ePct, concerning: ePct !== null && ePct < 50,
      label: `Electricity ${ePct}% of usual`,
      detail: `${window}: ${fmt(kwh, 'kWh')}${ePct !== null && ePct < 50 ? ', about fridge level' : ''} (usually ${fmt(usualKwh, 'kWh')} ${usually})` },
    { signal: 'gate', percentOfUsual: null, concerning: !lastGate,
      label: lastGate ? 'Access card used today' : 'No access card in or out today',
      detail: lastGate ? `Last used at the guardhouse at ${hhmm(lastGate.sim)}` : 'No gate entry or exit since 6 am' },
    { signal: 'app', percentOfUsual: null, concerning: appQuietH === null || appQuietH >= h.thresholdMin / 60,
      label: appQuietH === null ? 'No app activity today' : `No app activity for ${Math.floor(appQuietH)} h`,
      detail: lastApp ? `Last opened the township app at ${hhmm(lastApp.sim)}` : 'The township app has not been opened today' },
  ]
}

const hhmm = (sim: number) => { const d = new Date(sim); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

function openAlert(w: World, h: Household, realNow: number) {
  h.alert = { state: 'CHECKIN_PENDING', guard: 'NONE', phaseEndsAt: realNow + w.stepMs, startedSim: w.sim, reasons: explain(h, w.sim) }
  const mins = Math.round((w.sim - h.lastActivity) / MIN)
  log(w, h, 'threshold', 'system', `Inactive ${Math.floor(mins / 60)}h ${mins % 60}m — check-in sent to ${h.resident}`)
}

function resolve(w: World, h: Household, actor: Actor, text: string) {
  h.alert!.state = 'RESOLVED'
  h.alert!.phaseEndsAt = null
  h.quiet = false
  h.lastActivity = w.sim
  log(w, h, 'resolved', actor, text)
}

export function tick(w: World, realNow: number): void {
  // ponytail: one shared clock; it pauses during the timed resident/family stages so the log reads as
  // real minutes. A welfare check waiting for a guard (e.g. a seeded sample shift) does not freeze it.
  if (!w.households.some(h => h.alert?.phaseEndsAt != null)) w.sim += (realNow - w.lastReal) * w.speed
  w.lastReal = realNow

  for (const h of w.households) {
    if (h.home && !h.quiet && !h.away && awake(w.sim) && w.sim - h.lastActivity >= h.activityEveryMin * MIN) {
      h.lastActivity = w.sim
      h.today[hourOf(w.sim)]++
      // ponytail: fixed cadence for app (every 2nd event) and gate use (every 4th); fine for a demo simulator
      const n = h.activities.length
      h.activities.push({ sim: w.sim, app: n % 2 === 0, gate: n % 4 === 1 })
    }
    if (h.consented && h.home && !h.away && !active(h) && awake(w.sim) && gap(h, w.sim) > h.thresholdMin * MIN) {
      openAlert(w, h, realNow)
    }
    const a = h.alert
    if (!a || a.phaseEndsAt === null || realNow < a.phaseEndsAt) continue
    if (a.state === 'CHECKIN_PENDING') {
      a.state = 'FAMILY_ESCALATED'
      a.phaseEndsAt = realNow + w.stepMs
      w.sim += CHECKIN_WINDOW
      log(w, h, 'family', 'system', `No reply in ${CHECKIN_WINDOW / MIN} min — ${h.familyContact} notified`)
    } else if (a.state === 'FAMILY_ESCALATED') {
      a.state = 'SECURITY_ESCALATED'
      a.phaseEndsAt = null
      w.sim += FAMILY_WINDOW
      log(w, h, 'security', 'system', `No reply in ${(CHECKIN_WINDOW + FAMILY_WINDOW) / MIN} min — welfare check requested`)
    }
  }
}

export function goQuiet(w: World, id: string, realNow: number): void {
  const h = find(w, id)
  if (!h.consented || h.away || active(h)) return
  h.quiet = true
  h.lastActivity = w.sim - h.thresholdMin * MIN
  // The presenter shortcut stands for 'she has been quiet this long', so drop activity inside that window.
  h.activities = h.activities.filter(a => a.sim < h.lastActivity)
  openAlert(w, h, realNow)
}

export function checkIn(w: World, id: string, actor: 'resident' | 'family'): void {
  const h = find(w, id)
  if (!active(h)) return
  resolve(w, h, actor, actor === 'resident' ? `${h.resident} tapped I'm OK` : `${h.familyContact} marked safe`)
}

export function setAway(w: World, id: string, away: boolean): void {
  const h = find(w, id)
  h.away = away
  if (away && active(h)) resolve(w, h, 'resident', `${h.resident} turned on away mode`)
  else log(w, h, 'away', 'resident', away ? 'Away mode on' : 'Away mode off')
}

export function consent(w: World, id: string): void {
  const h = find(w, id)
  h.consented = true
  h.lastActivity = w.sim
}

export function advanceGuard(w: World, id: string): void {
  const h = find(w, id)
  const a = h.alert
  if (!a || a.state !== 'SECURITY_ESCALATED') return
  const i = GUARD_STEPS.findIndex(([g]) => g === a.guard) + 1
  const [next, mins, text] = GUARD_STEPS[i]
  a.guard = next
  w.sim += mins
  if (next === 'ARRIVED_SAFE') resolve(w, h, 'security', text)
  else log(w, h, 'guard', 'security', text)
}

// Sample guardhouse load for the Rescue page: two open welfare checks at different stages and two
// cases closed earlier today, on the neighbours (Madam Lee stays free for the live demo).
export function seedRescue(w: World): void {
  if (w.log.some(e => e.householdId === 'rahman' && e.type === 'resolved')) return // already loaded
  const at = (minsAgo: number) => w.sim - minsAgo * MIN
  const past = (h: Household, minsAgo: number, type: string, actor: Actor, text: string) =>
    w.log.push({ sim: at(minsAgo), householdId: h.id, type, actor, text })
  const open = (id: string, startedMinsAgo: number, guard: GuardState) => {
    const h = find(w, id)
    h.consented = true
    h.quiet = true
    h.lastActivity = at(startedMinsAgo + h.thresholdMin)
    h.activities = h.activities.filter(a => a.sim < h.lastActivity)
    h.alert = { state: 'SECURITY_ESCALATED', guard, phaseEndsAt: null, startedSim: at(startedMinsAgo), reasons: explain(h, at(startedMinsAgo)) }
    past(h, startedMinsAgo, 'threshold', 'system', `Inactive ${h.thresholdMin / 60}h 0m — check-in sent to ${h.resident}`)
    past(h, startedMinsAgo - 5, 'family', 'system', `No reply in 5 min — ${h.familyContact} notified`)
    past(h, startedMinsAgo - 10, 'security', 'system', 'No reply in 10 min — welfare check requested')
    if (guard !== 'NONE') past(h, startedMinsAgo - 12, 'guard', 'security', 'Guard assigned')
    if (guard === 'ON_THE_WAY') past(h, startedMinsAgo - 15, 'guard', 'security', 'Guard on the way')
  }
  open('wong', 18, 'ON_THE_WAY')
  open('kaur', 11, 'NONE')

  const rahman = find(w, 'rahman'), tan = find(w, 'tan')
  past(rahman, 95, 'threshold', 'system', 'Inactive 3h 0m — check-in sent to Encik Rahman')
  past(rahman, 85, 'security', 'system', 'No reply in 10 min — welfare check requested')
  past(rahman, 70, 'resolved', 'security', 'Guard arrived — resident safe (was in the garden, phone indoors)')
  past(tan, 60, 'threshold', 'system', 'Inactive 2h 30m — check-in sent to Mr Tan')
  past(tan, 56, 'resolved', 'family', 'Mei Ling marked safe after a phone call')
  w.log.sort((a, b) => a.sim - b.sim)
}

export function reset(w: World, realNow: number): void {
  Object.assign(w, createWorld(realNow))
}
