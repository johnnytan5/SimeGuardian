// Demo engine: one in-memory world, a simulated clock, fake activity signals,
// the inactivity rule and the escalation state machine. Pure — no timers, no I/O.

export type AlertState = 'OK' | 'CHECKIN_PENDING' | 'FAMILY_ESCALATED' | 'SECURITY_ESCALATED' | 'RESOLVED'
export type GuardState = 'NONE' | 'ASSIGNED' | 'ON_THE_WAY' | 'ARRIVED_SAFE'
export type Actor = 'system' | 'resident' | 'family' | 'security' | 'presenter'

export interface Alert { state: AlertState; guard: GuardState; phaseEndsAt: number | null; startedSim: number }
export interface LogEvent { sim: number; householdId: string; type: string; actor: Actor; text: string }
export interface Household {
  id: string; resident: string; unit: string; familyContact: string
  baseline: number[]
  today: number[]
  thresholdMin: number
  activityEveryMin: number
  lastActivity: number
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
const AWAKE_FROM = 6
const AWAKE_UNTIL = 23

// Typical activity events per hour: quiet nights, morning and evening peaks.
// Peaks sit near the generator cadence (~2–4/h) so today's bars and the usual pattern share a scale.
const DAY = [0, 0, 0, 0, 0, 0, 1, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 2, 1, 0]
const shift = (by: number) => DAY.map((_, i) => DAY[(i - by + 24) % 24])

function seed(): Omit<Household, 'today' | 'lastActivity' | 'home' | 'away' | 'consented' | 'quiet' | 'alert'>[] {
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
      ...h, today: new Array(24).fill(0), lastActivity: sim,
      // Madam Lee consents on camera; the rest of the precinct is already enrolled
      home: true, away: false, consented: h.id !== 'lee', quiet: false, alert: null,
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

function openAlert(w: World, h: Household, realNow: number) {
  h.alert = { state: 'CHECKIN_PENDING', guard: 'NONE', phaseEndsAt: realNow + w.stepMs, startedSim: w.sim }
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
  // ponytail: one shared clock; it pauses while any alert is open so the log reads as real minutes
  if (!w.households.some(active)) w.sim += (realNow - w.lastReal) * w.speed
  w.lastReal = realNow

  for (const h of w.households) {
    if (h.home && !h.quiet && !h.away && awake(w.sim) && w.sim - h.lastActivity >= h.activityEveryMin * MIN) {
      h.lastActivity = w.sim
      h.today[hourOf(w.sim)]++
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

export function reset(w: World, realNow: number): void {
  Object.assign(w, createWorld(realNow))
}
