import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native'

export const color = {
  bg: '#f4f6f5', panel: '#ffffff', ink: '#18221f', muted: '#5d6b66', line: '#dde3e0',
  brand: '#0f6b5c', ok: '#1f8a4c', pending: '#c98a00', alert: '#c4362b',
}

export function Screen({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[s.screen, style]}>{children}</View>
}

export function BigButton({ label, onPress, tone = 'brand' }: { label: string; onPress: () => void; tone?: 'brand' | 'ok' | 'plain' }) {
  const bg = tone === 'plain' ? color.panel : tone === 'ok' ? color.ok : color.brand
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [s.button, { backgroundColor: bg, opacity: pressed ? 0.8 : 1 }, tone === 'plain' && s.plain]}
    >
      <Text style={[s.buttonText, tone === 'plain' && { color: color.ink }]}>{label}</Text>
    </Pressable>
  )
}

export const type = StyleSheet.create({
  eyebrow: { fontSize: 16, color: color.muted, fontWeight: '600' },
  title: { fontSize: 36, fontWeight: '700', color: color.ink, lineHeight: 42 },
  body: { fontSize: 21, color: color.ink, lineHeight: 30 },
  muted: { fontSize: 18, color: color.muted, lineHeight: 26 },
})

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg, paddingHorizontal: 24, paddingTop: 72, paddingBottom: 40, gap: 18 },
  button: { minHeight: 68, borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  plain: { borderWidth: 1, borderColor: color.line },
  buttonText: { color: '#fff', fontSize: 24, fontWeight: '700' },
})
