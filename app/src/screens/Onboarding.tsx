import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import * as Notifications from 'expo-notifications'
import { post } from '../api'
import { Avatar, avatars, BigButton, Brand, color, Screen, type } from '../ui'

export function Onboarding({ resident, familyContact }: { resident: string; familyContact: string }) {
  const [step, setStep] = useState(0)

  if (step === 0) {
    return (
      <Screen>
        <Brand />
        <Avatar source={avatars.lee} size={96} ring={color.line} />
        <Text style={type.display}>Hello, {resident}</Text>
        <Text style={type.body}>
          SimeGuardian notices if your home has been unusually quiet for a long time, and checks that you’re OK.
        </Text>
        <View style={s.promise}>
          <Text style={s.promiseLine}>No cameras. Nothing to wear.</Text>
          <Text style={s.promiseLine}>Your family sees a simple status, never where you go.</Text>
        </View>
        <View style={{ flex: 1 }} />
        <BigButton label="Continue" onPress={() => setStep(1)} />
      </Screen>
    )
  }

  const agree = async () => {
    await Notifications.requestPermissionsAsync().catch(() => {})
    await post('/api/households/lee/consent').catch(() => {})
  }

  return (
    <Screen>
      <Brand />
      <Text style={type.title}>If your home goes quiet</Text>
      <View style={s.steps}>
        {[
          ['We ask you first', 'A check-in appears on this phone.'],
          [`${familyContact} after 5 minutes`, 'Only if you haven’t replied.'],
          ['Security after 10 minutes', 'A guard knocks on your door.'],
        ].map(([head, sub], i) => (
          <View key={head} style={s.step}>
            <View style={s.stepNum}><Text style={s.stepNumText}>{i + 1}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={[type.body, { fontWeight: '700' }]}>{head}</Text>
              <Text style={type.muted}>{sub}</Text>
            </View>
          </View>
        ))}
      </View>
      <Text style={type.muted}>Turn on away mode or leave at any time. This is a wellbeing check, not an emergency service.</Text>
      <View style={{ flex: 1 }} />
      <BigButton label="I agree" onPress={agree} />
    </Screen>
  )
}

const s = StyleSheet.create({
  promise: { backgroundColor: color.panel, borderRadius: 22, padding: 18, gap: 6 },
  promiseLine: { fontSize: 19, lineHeight: 27, color: color.ink, fontWeight: '600' },
  steps: { gap: 18, marginTop: 4 },
  step: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  stepNum: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.brand, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: '#fff', fontSize: 19, fontWeight: '800' },
})
