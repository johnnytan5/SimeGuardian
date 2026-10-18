import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import * as Notifications from 'expo-notifications'
import * as Haptics from 'expo-haptics'
import { useResident } from './src/useResident'
import type { AlertState } from './src/api'
import { Screen } from './src/ui'
import { Onboarding } from './src/screens/Onboarding'
import { Home } from './src/screens/Home'
import { CheckIn } from './src/screens/CheckIn'
import { Offline } from './src/screens/Offline'

// Show the banner even though the app is open on screen during the demo.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
})

const OPEN: AlertState[] = ['CHECKIN_PENDING', 'FAMILY_ESCALATED', 'SECURITY_ESCALATED']
const ALL_CLEAR_MS = 8000

export default function App() {
  const { view, error } = useResident('lee')
  const prev = useRef<AlertState | null>(null)
  const [clearUntil, setClearUntil] = useState(0)
  const [, rerender] = useState(0)

  useEffect(() => {
    const now = view?.alertState ?? null
    if (now === 'CHECKIN_PENDING' && prev.current !== 'CHECKIN_PENDING') {
      Notifications.scheduleNotificationAsync({
        content: { title: 'SimeGuardian', body: 'Are you OK, Madam Lee? Tap to let us know.' },
        trigger: null,
      }).catch(() => {})
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
    }
    if (now === 'RESOLVED' && prev.current && OPEN.includes(prev.current)) {
      setClearUntil(Date.now() + ALL_CLEAR_MS)
      setTimeout(() => rerender(n => n + 1), ALL_CLEAR_MS + 50)
    }
    prev.current = now
  }, [view?.alertState])

  let screen
  if (error) screen = <Offline />
  else if (!view) screen = <Screen style={{ justifyContent: 'center' }}><ActivityIndicator size="large" /></Screen>
  else if (!view.consented) screen = <Onboarding resident={view.resident} familyContact={view.familyContact} />
  else if ((view.alertState && OPEN.includes(view.alertState)) || (view.alertState === 'RESOLVED' && Date.now() < clearUntil)) screen = <CheckIn view={view} />
  else screen = <Home view={view} />

  return <>{screen}<StatusBar style="dark" /></>
}
