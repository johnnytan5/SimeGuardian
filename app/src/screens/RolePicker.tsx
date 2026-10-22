import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { Role } from '../api'
import { Avatar, avatars, Brand, color, lift, Screen, type } from '../ui'

const people: { role: Role; name: string; who: string; avatar: number }[] = [
  { role: 'resident', name: 'Madam Lee', who: 'Resident, 72', avatar: avatars.lee },
  { role: 'family', name: 'Daniel', who: 'Her son, family contact', avatar: avatars.daniel },
]

export function RolePicker({ onPick }: { onPick: (r: Role) => void }) {
  return (
    <Screen>
      <Brand />
      <Text style={type.title}>Who’s using this phone?</Text>
      <Text style={type.muted}>Demo: pick a person to see their view.</Text>
      <View style={{ gap: 14, marginTop: 8 }}>
        {people.map(p => (
          <Pressable key={p.role} accessibilityRole="button" accessibilityLabel={`${p.name}, ${p.who}`} onPress={() => onPick(p.role)}
            style={({ pressed }) => [s.tile, lift, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
            <Avatar source={p.avatar} size={76} />
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{p.name}</Text>
              <Text style={type.muted}>{p.who}</Text>
            </View>
            <View style={s.go}><Text style={s.goGlyph}>›</Text></View>
          </Pressable>
        ))}
      </View>
    </Screen>
  )
}

const s = StyleSheet.create({
  tile: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: color.bg, borderRadius: 28, padding: 16, borderWidth: 1, borderColor: color.line },
  go: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.panel, alignItems: 'center', justifyContent: 'center' },
  goGlyph: { fontSize: 28, lineHeight: 30, color: color.brand, fontWeight: '600' },
  name: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4, color: color.ink },
})
