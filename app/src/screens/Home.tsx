import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { hhmm, post, type ResidentView } from '../api'
import { color, Screen, type } from '../ui'

export function Home({ view }: { view: ResidentView }) {
  return (
    <Screen>
      <Text style={type.eyebrow}>SimeGuardian</Text>
      <Text style={type.title}>{view.away ? 'Away mode is on' : `You're all set, ${view.resident}`}</Text>
      <Text style={type.muted}>
        {view.away
          ? 'Check-ins are paused while you are away.'
          : `${view.familyContact} will only be told if you don't reply to a check-in.`}
      </Text>

      <View style={s.card}>
        <View style={{ flex: 1 }}>
          <Text style={type.body}>Away mode</Text>
          <Text style={type.muted}>For travel or a hospital stay</Text>
        </View>
        <Switch
          value={view.away}
          onValueChange={away => post('/api/households/lee/away', { away }).catch(() => {})}
          trackColor={{ true: color.brand }}
          style={{ transform: [{ scale: 1.2 }] }}
        />
      </View>

      <Text style={type.eyebrow}>Today's check-ins</Text>
      <ScrollView style={s.list}>
        {view.checkinsToday.length === 0
          ? <Text style={type.muted}>No check-ins today.</Text>
          : view.checkinsToday.slice().reverse().map((e, i) => (
              <Text key={i} style={[type.body, s.row]}><Text style={{ fontWeight: '700' }}>{hhmm(e.sim)}</Text>  {e.text}</Text>
            ))}
      </ScrollView>
    </Screen>
  )
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: color.panel, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: color.line },
  list: { flex: 1 },
  row: { fontSize: 18, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: color.line },
})
