import type { ReactNode } from 'react'
import type { Reason } from './api'
import { Image, Pressable, StyleSheet, Text, View, type ImageSourcePropType, type ViewStyle } from 'react-native'

// Calm states sit on white; a state that needs attention takes over the whole screen in a deep
// SDP tone. Field colours are dark enough for white body text (WCAG AA) for older eyes.
export const color = {
  bg: '#ffffff', panel: '#f6f4f2', ink: '#1d2230', muted: '#5f6472', line: '#e9e5e1',
  brand: '#c94a1b', ok: '#1f7a4a', pending: '#c94a1b', alert: '#b3261e', onField: '#ffffff', onFieldMuted: 'rgba(255,255,255,0.84)',
}

// One soft, low shadow for anything you can touch; flat surfaces stay flat.
export const lift: ViewStyle = {
  shadowColor: '#1d2230', shadowOpacity: 0.1, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 5,
}

export const avatars = {
  lee: require('../assets/avatar-madam-lee.png'),
  daniel: require('../assets/avatar-daniel.png'),
}

export function Screen({ children, style, field }: { children: ReactNode; style?: ViewStyle; field?: string }) {
  return <View style={[s.screen, field ? { backgroundColor: field } : null, style]}>{children}</View>
}

// Brand row at the top of every screen: the module lives inside SDP's township app.
export function Brand({ onField, right }: { onField?: boolean; right?: ReactNode }) {
  return (
    <View style={s.brand}>
      <View style={[s.logoChip, lift]}>
        <Image source={require('../assets/sdp-logo.png')} style={s.logo} resizeMode="contain" />
      </View>
      <View>
        <Text style={[s.brandName, onField && { color: color.onField }]}>SimeGuardian</Text>
        <Text style={[s.brandSub, onField && { color: color.onFieldMuted }]}>Sime Darby Property</Text>
      </View>
      <View style={{ flex: 1 }} />
      {right}
    </View>
  )
}

// Photo inside a white inner ring; an optional dot shows the person's current status.
export function Avatar({ source, size = 56, ring, badge }: { source: ImageSourcePropType; size?: number; ring?: string; badge?: string }) {
  const dot = Math.max(14, size * 0.26)
  return (
    <View style={{ width: size, height: size }}>
      <View style={{ flex: 1, borderRadius: size / 2, padding: 3, backgroundColor: ring ?? color.line }}>
        <View style={{ flex: 1, borderRadius: size / 2, overflow: 'hidden', borderWidth: 2, borderColor: '#fff', backgroundColor: '#fff' }}>
          <Image source={source} style={{ width: '100%', height: '100%' }} />
        </View>
      </View>
      {badge && <View style={{ position: 'absolute', right: 0, bottom: 0, width: dot, height: dot, borderRadius: dot / 2, backgroundColor: badge, borderWidth: 3, borderColor: '#fff' }} />}
    </View>
  )
}

export function Chip({ text, onField }: { text: string; onField?: boolean }) {
  return (
    <View style={[s.chip, onField ? { backgroundColor: 'rgba(255,255,255,0.16)', borderColor: 'rgba(255,255,255,0.3)' } : null]}>
      <Text style={[s.chipText, onField && { color: color.onField }]}>{text}</Text>
    </View>
  )
}

type Tone = 'brand' | 'ok' | 'plain' | 'light' | 'ghost'
export function BigButton({ label, onPress, tone = 'brand', hint }: { label: string; onPress: () => void; tone?: Tone; hint?: string }) {
  const t = tones[tone]
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={hint}
      onPress={onPress}
      style={({ pressed }) => [s.button, t.box, { transform: [{ scale: pressed ? 0.98 : 1 }], opacity: pressed ? 0.92 : 1 }]}
    >
      <Text style={[s.buttonText, { color: t.text }]}>{label}</Text>
      {hint && <Text style={[s.buttonHint, { color: t.text }]}>{hint}</Text>}
    </Pressable>
  )
}

const tones: Record<Tone, { box: ViewStyle; text: string }> = {
  brand: { box: { backgroundColor: color.brand, ...lift, shadowColor: color.brand, shadowOpacity: 0.3 }, text: '#fff' },
  ok: { box: { backgroundColor: color.ok, ...lift }, text: '#fff' },
  plain: { box: { backgroundColor: color.bg, borderWidth: 1.5, borderColor: color.line }, text: color.ink },
  light: { box: { backgroundColor: '#fff', ...lift, shadowColor: '#000', shadowOpacity: 0.22 }, text: color.ink },
  ghost: { box: { borderWidth: 2, borderColor: 'rgba(255,255,255,0.65)' }, text: '#fff' },
}

export const type = StyleSheet.create({
  display: { fontSize: 52, fontWeight: '800', lineHeight: 56, letterSpacing: -1.2, color: color.ink },
  title: { fontSize: 34, fontWeight: '700', lineHeight: 40, letterSpacing: -0.6, color: color.ink },
  body: { fontSize: 21, lineHeight: 30, color: color.ink },
  muted: { fontSize: 18, lineHeight: 26, color: color.muted },
  label: { fontSize: 16, fontWeight: '600', color: color.muted },
})

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg, paddingHorizontal: 24, paddingTop: 64, paddingBottom: 56, gap: 18 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  logoChip: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  logo: { width: 34, height: 28 },
  brandName: { fontSize: 17, fontWeight: '700', color: color.ink, letterSpacing: -0.2 },
  brandSub: { fontSize: 13, color: color.muted, marginTop: 1 },
  chip: { alignSelf: 'flex-start', flexDirection: 'row', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: color.panel, borderWidth: 1, borderColor: color.line },
  chipText: { fontSize: 16, fontWeight: '600', color: color.ink, fontVariant: ['tabular-nums'] },
  button: { minHeight: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 10 },
  buttonText: { fontSize: 23, fontWeight: '700', letterSpacing: -0.2 },
  buttonHint: { fontSize: 14, opacity: 0.7, marginTop: 2 },
})

const GLYPH: Record<Reason['signal'], string> = { electricity: 'ϟ', water: '◈', gate: '⇄', app: '▢' }

// Explainable alert: which signals made us ask, each compared with this home's usual pattern.
// On a coloured field (onField) it is a translucent panel; `compact` hides the detail line.
export function Reasons({ reasons, title, onField, compact, limit }: { reasons: Reason[]; title: string; onField?: boolean; compact?: boolean; limit?: number }) {
  const shown = reasons.filter(r => r.concerning).slice(0, limit)
  if (shown.length === 0) return null
  const ink = onField ? color.onField : color.ink
  const sub = onField ? color.onFieldMuted : color.muted
  return (
    <View accessibilityRole="summary" style={[r.panel, onField ? r.panelField : r.panelPlain]}>
      <Text style={[r.title, { color: sub }]}>{title}</Text>
      {shown.map(x => (
        <View key={x.signal} style={r.row}>
          <View style={[r.icon, { backgroundColor: onField ? 'rgba(255,255,255,0.18)' : color.panel }]}>
            <Text style={[r.glyph, { color: ink }]}>{GLYPH[x.signal]}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[r.label, { color: ink }]}>{x.label}</Text>
            {!compact && <Text style={[r.detail, { color: sub }]}>{x.detail}</Text>}
          </View>
          {x.percentOfUsual !== null && <Meter pct={x.percentOfUsual} onField={onField} />}
        </View>
      ))}
    </View>
  )
}

// A short bar showing actual use as a share of usual, so "17%" reads at a glance.
function Meter({ pct, onField }: { pct: number; onField?: boolean }) {
  return (
    <View style={[r.meter, { backgroundColor: onField ? 'rgba(255,255,255,0.22)' : color.line }]}>
      <View style={{ width: `${Math.max(4, Math.min(100, pct))}%`, height: '100%', borderRadius: 3, backgroundColor: onField ? '#fff' : color.brand }} />
    </View>
  )
}

const r = StyleSheet.create({
  panel: { borderRadius: 22, padding: 16, gap: 12 },
  panelField: { backgroundColor: 'rgba(0,0,0,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  panelPlain: { backgroundColor: color.bg, borderWidth: 1, borderColor: color.line },
  title: { fontSize: 14, fontWeight: '600', letterSpacing: 0.3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  glyph: { fontSize: 17, fontWeight: '700' },
  label: { fontSize: 18, fontWeight: '600', letterSpacing: -0.2 },
  detail: { fontSize: 14, lineHeight: 19, marginTop: 1 },
  meter: { width: 40, height: 6, borderRadius: 3, overflow: 'hidden' },
})
