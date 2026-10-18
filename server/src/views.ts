// Role-scoped projections. Privacy rules live here, not in the UI:
// security never gets home/away, family never gets the activity timeline.

import { MIN, type AlertState, type GuardState, type Household, type LogEvent, type World } from './engine.ts'

const CHECKIN_WINDOW = 30 * MIN
const SECURITY_AFTER = 45 * MIN // check-in window + family window

function find(w: World, id: string): Household {
  const h = w.households.find(x => x.id === id)
  if (!h) throw new Error('unknown household')
  return h
}

export function dashboardView(w: World, _realNow: number) {
  return { sim: w.sim, speed: w.speed, stepMs: w.stepMs, households: w.households, log: w.log }
}

export interface ResidentView {
  id: string; resident: string; familyContact: string; consented: boolean; away: boolean
  alertState: AlertState | null; guard: GuardState; countdownSimMs: number | null; checkinsToday: LogEvent[]; sim: number
}

export function residentView(w: World, id: string, realNow: number): ResidentView {
  const h = find(w, id)
  const a = h.alert
  const countdownSimMs = a?.state === 'CHECKIN_PENDING' && a.phaseEndsAt !== null
    ? Math.max(0, a.phaseEndsAt - realNow) / w.stepMs * CHECKIN_WINDOW
    : null
  return {
    id: h.id, resident: h.resident, familyContact: h.familyContact, consented: h.consented, away: h.away,
    alertState: a?.state ?? null, guard: a?.guard ?? 'NONE', countdownSimMs,
    checkinsToday: w.log.filter(e => e.householdId === id && (e.type === 'threshold' || e.type === 'resolved')),
    sim: w.sim,
  }
}

export interface FamilyView { id: string; resident: string; status: 'OK' | 'CHECKIN_PENDING' | 'ESCALATED'; alertState: AlertState | null; since: number | null }

export function familyView(w: World, id: string): FamilyView {
  const h = find(w, id)
  const a = h.alert
  const status = !a || a.state === 'RESOLVED' ? 'OK' : a.state === 'CHECKIN_PENDING' ? 'CHECKIN_PENDING' : 'ESCALATED'
  return { id: h.id, resident: h.resident, status, alertState: a?.state ?? null, since: a?.startedSim ?? null }
}

export interface SecurityItem { id: string; unit: string; resident: string; escalatedAt: number; guard: GuardState; state: AlertState }

export function securityView(w: World): SecurityItem[] {
  return w.households
    .filter(h => h.alert && (h.alert.state === 'SECURITY_ESCALATED' || h.alert.guard !== 'NONE'))
    .map(h => ({
      id: h.id, unit: h.unit, resident: h.resident,
      escalatedAt: h.alert!.startedSim + SECURITY_AFTER, guard: h.alert!.guard, state: h.alert!.state,
    }))
}
