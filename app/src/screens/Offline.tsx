import { Text } from 'react-native'
import { SERVER_URL } from '../api'
import { Screen, type } from '../ui'

export function Offline() {
  return (
    <Screen style={{ justifyContent: 'center' }}>
      <Text style={type.title}>Can't reach SimeGuardian server</Text>
      <Text style={[type.body, { fontFamily: 'Menlo' }]}>{SERVER_URL}</Text>
      <Text style={type.muted}>
        Check the server is running (cd server && npm start) and the Mac and phone are on the same Wi-Fi. Set
        EXPO_PUBLIC_SERVER_URL to override the address.
      </Text>
    </Screen>
  )
}
