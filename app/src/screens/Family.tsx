import { useState } from 'react'
import { Text, View } from 'react-native'
import { hhmm, post, type FamilyView } from '../api'
import { BigButton, color, Screen, type } from '../ui'

export function Family({ view }: { view: FamilyView }) {
  const [calling, setCalling] = useState(false)
  const call = () => { setCalling(true); setTimeout(() => setCalling(false), 2000) }
  const safe = () => post(`/api/households/${view.id}/checkin`, { actor: 'family' }).catch(() => {})

  let [title, tint, detail] =
    view.status === 'OK' ? ['Mum is OK', color.ok, "You'll only hear from us if Mum doesn't reply to a check-in."]
    : view.status === 'CHECKIN_PENDING' ? ['Check-in sent to Mum', color.pending, 'Her home has been unusually quiet. We have asked her if she is OK.']
    : ["Mum hasn't responded — please check on her", color.alert, 'Call her now, or mark her safe once you have spoken to her.']
  if (view.alertState === 'RESOLVED') [title, tint, detail] = ['Resolved — Mum is safe', color.ok, 'Thank you. The alert is closed.']
  if (view.alertState === 'SECURITY_ESCALATED') detail = 'Township security has been asked to check on her at home.'
  const open = view.status !== 'OK'

  return (
    <Screen style={open ? { backgroundColor: '#fff8ec' } : undefined}>
      <Text style={type.eyebrow}>SimeGuardian · Family · {view.resident}</Text>
      <Text style={[type.title, { color: tint }]}>{title}</Text>
      <Text style={type.body}>{detail}</Text>
      {open && view.since !== null && <Text style={type.muted}>Since {hhmm(view.since)}</Text>}
      <View style={{ flex: 1 }} />
      {calling && <Text style={[type.body, { textAlign: 'center' }]}>Calling Mum… (demo)</Text>}
      {open && (
        <View style={{ gap: 14 }}>
          <BigButton label="Call Mum" tone="plain" onPress={call} />
          <BigButton label="Mark safe" tone="ok" onPress={safe} />
        </View>
      )}
    </Screen>
  )
}
