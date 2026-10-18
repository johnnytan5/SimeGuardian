import { Text, View } from 'react-native'
import { post, type ResidentView } from '../api'
import { BigButton, color, Screen, type } from '../ui'

const GUARD_LINE: Record<string, string> = {
  NONE: 'A guard is being assigned.',
  ASSIGNED: 'A guard has been assigned.',
  ON_THE_WAY: 'The guard is on the way to your door.',
}

const mmss = (ms: number) => {
  const total = Math.ceil(ms / 1000)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function CheckIn({ view }: { view: ResidentView }) {
  const ok = () => post('/api/households/lee/checkin', { actor: 'resident' }).catch(() => {})

  if (view.alertState === 'RESOLVED') {
    return (
      <Screen style={{ justifyContent: 'center' }}>
        <Text style={[type.title, { color: color.ok, textAlign: 'center' }]}>All clear.</Text>
        <Text style={[type.body, { textAlign: 'center' }]}>Thank you, {view.resident}.</Text>
      </Screen>
    )
  }

  const { title, detail, tint } =
    view.alertState === 'CHECKIN_PENDING'
      ? { title: 'Are you OK?', detail: `Your home has been quiet for a while. Tap below so we know you're fine.`, tint: color.pending }
      : view.alertState === 'FAMILY_ESCALATED'
        ? { title: `We've let ${view.familyContact} know`, detail: `${view.familyContact} may call you. If you're fine, tap below.`, tint: color.alert }
        : { title: 'Security is coming to check on you', detail: GUARD_LINE[view.guard] ?? '', tint: color.alert }

  return (
    <Screen style={{ backgroundColor: '#fff8ec' }}>
      <Text style={type.eyebrow}>SimeGuardian check-in</Text>
      <Text style={[type.title, { color: tint, fontSize: 44, lineHeight: 50 }]}>{title}</Text>
      <Text style={type.body}>{detail}</Text>
      {view.countdownSimMs !== null && (
        <View style={{ alignItems: 'center', marginTop: 12 }}>
          <Text style={{ fontSize: 64, fontWeight: '700', color: color.ink, fontVariant: ['tabular-nums'] }}>
            {mmss(view.countdownSimMs)}
          </Text>
          <Text style={type.muted}>before we contact {view.familyContact}</Text>
        </View>
      )}
      <View style={{ flex: 1 }} />
      <BigButton label="I'm OK" tone="ok" onPress={ok} />
    </Screen>
  )
}
