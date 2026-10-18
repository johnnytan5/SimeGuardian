import { useState } from 'react'
import { Text, View } from 'react-native'
import * as Notifications from 'expo-notifications'
import { post } from '../api'
import { BigButton, Screen, type } from '../ui'

export function Onboarding({ resident, familyContact }: { resident: string; familyContact: string }) {
  const [step, setStep] = useState(0)

  if (step === 0) {
    return (
      <Screen>
        <Text style={type.eyebrow}>SimeGuardian · a module for your township app</Text>
        <Text style={type.title}>Hello, {resident}</Text>
        <Text style={type.body}>
          SimeGuardian notices if your home has been unusually quiet for a long time, and checks that you're OK.
        </Text>
        <Text style={type.body}>
          Your family only sees a simple status. Never where you go or what you do. No cameras, nothing to wear.
        </Text>
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
      <Text style={type.eyebrow}>Step 2 of 2</Text>
      <Text style={type.title}>{familyContact} is your contact</Text>
      <Text style={type.body}>
        If you don't reply to a check-in within 30 minutes, we'll let {familyContact} know. If we can't reach them,
        township security will knock on your door.
      </Text>
      <Text style={type.muted}>You can turn on away mode or leave at any time. This is a wellbeing check, not an emergency service.</Text>
      <View style={{ flex: 1 }} />
      <BigButton label="I agree" onPress={agree} />
    </Screen>
  )
}
