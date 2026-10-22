import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { hhmm, post, type ResidentView } from '../api'
import { Avatar, avatars, Brand, color, lift, Screen, type } from '../ui'

const greeting = (sim: number) => {
  const h = new Date(sim).getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export function Home({ view }: { view: ResidentView }) {
  const events = view.checkinsToday.slice().reverse()
  return (
    <Screen>
      <Brand right={<Avatar source={avatars.lee} size={48} badge={view.away ? color.muted : color.ok} />} />
      <Text style={type.title}>{greeting(view.sim)}, {view.resident}</Text>

      <View style={[s.status, lift, { shadowColor: view.away ? color.ink : color.ok, shadowOpacity: 0.25 }, view.away && { backgroundColor: color.ink }]}>
        <View style={s.statusHead}>
          <View style={s.statusIcon}><Text style={[s.statusGlyph, view.away && { color: color.ink }]}>{view.away ? '❚❚' : '✓'}</Text></View>
          <Text style={s.statusTitle}>{view.away ? 'Away mode is on' : 'You’re looked after'}</Text>
        </View>
        <Text style={s.statusBody}>
          {view.away
            ? 'Check-ins are paused until you turn this off.'
            : `If your home is quiet for too long, we’ll ask you first. ${view.familyContact} is only told if you don’t reply.`}
        </Text>
      </View>

      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Text style={[type.body, { fontWeight: '700' }]}>Away mode</Text>
          <Text style={type.muted}>For travel or a hospital stay</Text>
        </View>
        <Switch
          value={view.away}
          onValueChange={away => post('/api/households/lee/away', { away }).catch(() => {})}
          trackColor={{ true: color.brand, false: color.line }}
          style={{ transform: [{ scale: 1.2 }] }}
        />
      </View>

      <Text style={[type.label, { marginTop: 6 }]}>Today</Text>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
        {events.length === 0
          ? <Text style={type.muted}>No check-ins today.</Text>
          : events.map((e, i) => (
              <View key={i} style={s.event}>
                <View style={s.rail}>
                  <View style={[s.dot, i === 0 && s.dotLatest]} />
                  {i < events.length - 1 && <View style={s.line} />}
                </View>
                <Text style={s.eventTime}>{hhmm(e.sim)}</Text>
                <Text style={[type.muted, { flex: 1, color: color.ink, paddingBottom: 14 }]}>{e.text}</Text>
              </View>
            ))}
      </ScrollView>
    </Screen>
  )
}

const s = StyleSheet.create({
  status: { backgroundColor: color.ok, borderRadius: 28, padding: 22, gap: 10 },
  statusHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  statusGlyph: { fontSize: 20, fontWeight: '800', color: color.ok },
  statusTitle: { fontSize: 25, fontWeight: '800', letterSpacing: -0.4, color: color.onField, flex: 1 },
  statusBody: { fontSize: 19, lineHeight: 27, color: color.onFieldMuted },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: color.bg, borderRadius: 24, padding: 18, borderWidth: 1, borderColor: color.line },
  event: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  rail: { width: 14, alignItems: 'center', alignSelf: 'stretch' },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: color.line, marginTop: 8 },
  dotLatest: { backgroundColor: color.brand, borderWidth: 3, borderColor: '#f6d9cc', width: 16, height: 16, borderRadius: 8, marginTop: 6 },
  line: { flex: 1, width: 2, backgroundColor: color.line, marginTop: 4 },
  eventTime: { fontSize: 18, fontWeight: '700', color: color.ink, width: 56, fontVariant: ['tabular-nums'], lineHeight: 26 },
})
