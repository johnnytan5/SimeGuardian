import { Text, View } from 'react-native'
import type { Role } from '../api'
import { BigButton, Screen, type } from '../ui'

export function RolePicker({ onPick }: { onPick: (r: Role) => void }) {
  return (
    <Screen style={{ justifyContent: 'center' }}>
      <Text style={type.eyebrow}>SimeGuardian · demo</Text>
      <Text style={type.title}>Who is using this phone?</Text>
      <View style={{ gap: 14, marginTop: 12 }}>
        <BigButton label="Madam Lee (resident)" onPress={() => onPick('resident')} />
        <BigButton label="Daniel (family)" tone="plain" onPress={() => onPick('family')} />
      </View>
    </Screen>
  )
}
