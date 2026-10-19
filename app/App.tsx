import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import * as Notifications from 'expo-notifications'
import * as Haptics from 'expo-haptics'
import { usePoll } from './src/usePoll'
import type { AlertState, FamilyView, ResidentView, Role } from './src/api'
import { color, Screen } from './src/ui'
import { RolePicker } from './src/screens/RolePicker'
import { Onboarding } from './src/screens/Onboarding'
import { Home } from './src/screens/Home'
import { CheckIn } from './src/screens/CheckIn'
import { Family } from './src/screens/Family'
import { Offline } from './src/screens/Offline'

// Show the banner even though the app is open on screen during the demo.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
})

const OPEN: AlertState[] = ['CHECKIN_PENDING', 'FAMILY_ESCALATED', 'SECURITY_ESCALATED']
const ALL_CLEAR_MS = 8000

// Banner + haptic the moment the polled state enters `trigger`.
function useAlertOn(state: AlertState | null | undefined, trigger: AlertState, body: string) {
  const prev = useRef<AlertState | null | undefined>(undefined)
  useEffect(() => {
    if (state === trigger && prev.current !== undefined && prev.current !== trigger) {
      Notifications.scheduleNotificationAsync({ content: { title: 'SimeGuardian', body }, trigger: null }).catch(() => {})
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
    }
    prev.current = state
  }, [state])
}

const loading = <Screen style={{ justifyContent: 'center' }}><ActivityIndicator size="large" /></Screen>

function ResidentApp() {
  const { view, error } = usePoll<ResidentView>('/api/resident/lee')
  const prev = useRef<AlertState | null>(null)
  const [clearUntil, setClearUntil] = useState(0)
  const [, rerender] = useState(0)
  useAlertOn(view?.alertState, 'CHECKIN_PENDING', 'Are you OK, Madam Lee? Tap to let us know.')

  useEffect(() => {
    const now = view?.alertState ?? null
    if (now === 'RESOLVED' && prev.current && OPEN.includes(prev.current)) {
      setClearUntil(Date.now() + ALL_CLEAR_MS)
      setTimeout(() => rerender(n => n + 1), ALL_CLEAR_MS + 50)
    }
    prev.current = now
  }, [view?.alertState])

  if (error) return <Offline />
  if (!view) return loading
  if (!view.consented) return <Onboarding resident={view.resident} familyContact={view.familyContact} />
  if ((view.alertState && OPEN.includes(view.alertState)) || (view.alertState === 'RESOLVED' && Date.now() < clearUntil)) return <CheckIn view={view} />
  return <Home view={view} />
}

function FamilyApp() {
  const { view, error } = usePoll<FamilyView>('/api/family/lee')
  useAlertOn(view?.alertState, 'FAMILY_ESCALATED', "Mum hasn't replied to her check-in. Please check on her.")
  if (error) return <Offline />
  if (!view) return loading
  return <Family view={view} />
}

export default function App() {
  const [role, setRole] = useState<Role | null>(null)
  if (!role) return <><RolePicker onPick={setRole} /><StatusBar style="dark" /></>
  const other = role === 'resident' ? 'Daniel (family)' : 'Madam Lee (resident)'
  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      {role === 'resident' ? <ResidentApp /> : <FamilyApp />}
      <Pressable
        accessibilityRole="button"
        onPress={() => setRole(role === 'resident' ? 'family' : 'resident')}
        style={{ paddingVertical: 14, paddingBottom: 30, alignItems: 'center', borderTopWidth: 1, borderTopColor: color.line }}
      >
        <Text style={{ color: color.muted, fontSize: 15 }}>Demo · switch to {other}</Text>
      </Pressable>
      <StatusBar style="dark" />
    </View>
  )
}
