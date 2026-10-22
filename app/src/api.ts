import Constants from 'expo-constants'

export type AlertState = 'OK' | 'CHECKIN_PENDING' | 'FAMILY_ESCALATED' | 'SECURITY_ESCALATED' | 'RESOLVED'
export type GuardState = 'NONE' | 'ASSIGNED' | 'ON_THE_WAY' | 'ARRIVED_SAFE'
export interface LogEvent { sim: number; householdId: string; type: string; actor: string; text: string }
// Copied from server/src/views.ts — keep in sync.
export interface ResidentView {
  id: string; resident: string; familyContact: string; consented: boolean; away: boolean
  alertState: AlertState | null; guard: GuardState; countdownSimMs: number | null; checkinWindowMs: number; checkinsToday: LogEvent[]; sim: number
}
export interface FamilyView { id: string; resident: string; status: 'OK' | 'CHECKIN_PENDING' | 'ESCALATED'; alertState: AlertState | null; since: number | null }
export type Role = 'resident' | 'family'

// The phone reaches the Mac at the same host Expo Go loaded the bundle from.
const host = Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost'
export const SERVER_URL: string = process.env.EXPO_PUBLIC_SERVER_URL ?? `http://${host}:4000`

export async function post(path: string, body?: unknown): Promise<void> {
  const r = await fetch(SERVER_URL + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  if (!r.ok) throw new Error(`POST ${path} → ${r.status}`)
}

export const hhmm = (ms: number) => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
