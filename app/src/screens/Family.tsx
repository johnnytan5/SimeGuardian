import { useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { hhmm, post, type FamilyView } from '../api'
import { Avatar, avatars, BigButton, Brand, Chip, color, Reasons, Screen, type } from '../ui'

export function Family({ view }: { view: FamilyView }) {
  const [calling, setCalling] = useState(false)
  const call = () => { setCalling(true); setTimeout(() => setCalling(false), 2000) }
  const safe = () => post(`/api/households/${view.id}/checkin`, { actor: 'family' }).catch(() => {})

  let [title, field, detail] =
    view.status === 'OK' ? ['Mum is OK', undefined, "You'll only hear from us if Mum doesn't reply to a check-in."]
    : view.status === 'CHECKIN_PENDING' ? ['We’ve asked Mum if she’s OK', color.pending, 'Her home has been unusually quiet. You’ll hear from us if she doesn’t reply.']
    : ['Mum hasn’t replied', color.alert, 'Please call her now, or mark her safe once you’ve spoken to her.']
  if (view.alertState === 'RESOLVED') [title, field, detail] = ['Mum is safe', color.ok, 'Thank you. The check-in is closed.']
  if (view.alertState === 'SECURITY_ESCALATED') detail = 'Township security has been asked to check on her at home.'
  const open = view.status !== 'OK' && view.alertState !== 'RESOLVED'
  const onField = field !== undefined

  return (
    <Screen field={field}>
      <Brand onField={onField} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 16, paddingBottom: 8 }}>
        <View style={s.who}>
          <Avatar source={avatars.lee} size={68} ring={onField ? 'rgba(255,255,255,0.35)' : color.line} badge={field ?? color.ok} />
          <View>
            <Text style={[type.label, onField && s.onFieldMuted]}>Your mum</Text>
            <Text style={[s.name, onField && s.onField]}>{view.resident}</Text>
          </View>
        </View>
        <Text style={[type.display, { fontSize: 40, lineHeight: 44 }, onField && s.onField]}>{title}</Text>
        <Text style={[type.body, onField && s.onFieldMuted]}>{detail}</Text>
        {open && view.since !== null && <Chip onField text={`Quiet since ${hhmm(view.since)}`} />}
        {open && <Reasons reasons={view.reasons} title="Why you’re seeing this" onField />}
      </ScrollView>
      {calling && <Text style={[type.body, s.onField, { textAlign: 'center' }]}>Calling Mum… (demo)</Text>}
      {open && (
        <View style={{ gap: 14 }}>
          <BigButton label="Call Mum" tone="light" onPress={call} />
          <BigButton label="Mark safe" tone="ghost" onPress={safe} />
        </View>
      )}
    </Screen>
  )
}

const s = StyleSheet.create({
  onField: { color: color.onField },
  onFieldMuted: { color: color.onFieldMuted },
  who: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  name: { fontSize: 22, fontWeight: '700', color: color.ink },
})
