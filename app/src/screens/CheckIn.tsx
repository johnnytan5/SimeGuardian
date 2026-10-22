import { useEffect, useRef, type ReactNode } from 'react'
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native'
import { post, type ResidentView } from '../api'
import { BigButton, Brand, color, Screen, type } from '../ui'

const GUARD_LINE: Record<string, string> = {
  NONE: 'A guard is being assigned.',
  ASSIGNED: 'A guard has been assigned.',
  ON_THE_WAY: 'The guard is on the way to your door.',
}

const mmss = (ms: number) => {
  const total = Math.ceil(ms / 1000)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

// Watch-face dial: 60 ticks, the remaining share stays bright and the elapsed share fades,
// so the ring drains as the five minutes run out.
function Dial({ fraction, children }: { fraction: number; children: ReactNode }) {
  const lit = Math.ceil(Math.min(1, Math.max(0, fraction)) * 60)
  return (
    <View style={s.face}>
      {Array.from({ length: 60 }, (_, i) => {
        const major = i % 5 === 0
        return (
          <View key={i} style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${i * 6}deg` }] }]}>
            <View style={[s.tickBar, major && s.tickMajor, { opacity: i < lit ? 1 : 0.22 }]} />
          </View>
        )
      })}
      <View style={s.core}>{children}</View>
    </View>
  )
}

// The one moving thing in the app: a slow breath around the dial so the check-in is noticed.
function Pulse() {
  const t = useRef(new Animated.Value(0)).current
  useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined
    let cancelled = false
    AccessibilityInfo.isReduceMotionEnabled().then(reduce => {
      if (reduce || cancelled) return
      loop = Animated.loop(Animated.timing(t, { toValue: 1, duration: 2400, easing: Easing.out(Easing.quad), useNativeDriver: true }))
      loop.start()
    }).catch(() => {})
    return () => { cancelled = true; loop?.stop() }
  }, [t])
  return (
    <Animated.View pointerEvents="none" style={[s.pulse, {
      opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
      transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) }],
    }]} />
  )
}

export function CheckIn({ view }: { view: ResidentView }) {
  const ok = () => post('/api/households/lee/checkin', { actor: 'resident' }).catch(() => {})

  if (view.alertState === 'RESOLVED') {
    return (
      <Screen field={color.ok} style={{ justifyContent: 'center', alignItems: 'center' }}>
        <View style={s.tickHalo}><View style={s.tick}><Text style={s.tickMark}>✓</Text></View></View>
        <Text style={[type.display, s.onField, { textAlign: 'center' }]}>All clear</Text>
        <Text style={[type.body, s.onFieldMuted, { textAlign: 'center' }]}>Thank you, {view.resident}. Everyone has been told you're fine.</Text>
      </Screen>
    )
  }

  const { title, detail, field } =
    view.alertState === 'CHECKIN_PENDING'
      ? { title: 'Are you OK?', detail: 'Your home has been quiet for a while. Tap below so we know you’re fine.', field: color.pending }
      : view.alertState === 'FAMILY_ESCALATED'
        ? { title: `We’ve let ${view.familyContact} know`, detail: `${view.familyContact} may call you. If you’re fine, tap below.`, field: color.alert }
        : { title: 'Security is on the way', detail: GUARD_LINE[view.guard] ?? '', field: color.alert }

  return (
    <Screen field={field}>
      <Brand onField />
      <Text style={[type.display, s.onField]}>{title}</Text>
      <Text style={[type.body, s.onFieldMuted]}>{detail}</Text>
      {view.countdownSimMs !== null && (
        <View style={s.dialWrap}>
          <Pulse />
          <Dial fraction={view.countdownSimMs / view.checkinWindowMs}>
            <Text style={s.time}>{mmss(view.countdownSimMs)}</Text>
            <View style={s.rule} />
            <Text style={s.dialNote}>before we contact</Text>
            <Text style={s.dialName}>{view.familyContact}</Text>
          </Dial>
        </View>
      )}
      <View style={{ flex: 1 }} />
      <BigButton label="I'm OK" tone="light" onPress={ok} />
    </Screen>
  )
}

const DIAL = 264
const s = StyleSheet.create({
  onField: { color: color.onField },
  onFieldMuted: { color: color.onFieldMuted },
  dialWrap: { alignItems: 'center', justifyContent: 'center', marginTop: 20, height: DIAL + 40 },
  pulse: { position: 'absolute', width: DIAL, height: DIAL, borderRadius: DIAL / 2, borderWidth: 1, borderColor: '#fff' },
  face: { width: DIAL, height: DIAL, borderRadius: DIAL / 2, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  tickBar: { alignSelf: 'center', marginTop: 6, width: 2, height: 10, borderRadius: 1, backgroundColor: '#fff' },
  tickMajor: { width: 3, height: 18, marginTop: 4, borderRadius: 1.5 },
  core: { width: DIAL - 64, height: DIAL - 64, borderRadius: (DIAL - 64) / 2, backgroundColor: 'rgba(0,0,0,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  time: { fontSize: 56, fontWeight: '200', letterSpacing: 1, color: color.onField, fontVariant: ['tabular-nums'] },
  rule: { width: 28, height: 1, backgroundColor: 'rgba(255,255,255,0.5)', marginVertical: 8 },
  dialNote: { fontSize: 13, fontWeight: '500', letterSpacing: 0.6, color: 'rgba(255,255,255,0.7)' },
  dialName: { fontSize: 19, fontWeight: '600', letterSpacing: 0.2, color: color.onField, marginTop: 2 },
  tickHalo: { width: 148, height: 148, borderRadius: 74, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  tick: { width: 112, height: 112, borderRadius: 56, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  tickMark: { fontSize: 60, color: color.ok, fontWeight: '800' },
})
