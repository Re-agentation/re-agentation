import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native'
import { AgentationProbe } from '@re-agentation/probe'

/**
 * Bare RN CLI version of the demo. Identical UI to examples/expo so the
 * same GIF can be recorded from either.
 */
export default function App() {
  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <DemoHeader />
      <ScrollView contentContainerStyle={styles.scroll}>
        <DemoCard title="First card" subtitle="Tap me, then annotate" />
        <DemoCard title="Second card" subtitle="Then me" />
        <DemoCard title="Third card" subtitle="Then send the batch" />
        <DemoButton />
      </ScrollView>

      {__DEV__ && <AgentationProbe />}
    </View>
  )
}

function DemoHeader() {
  return (
    <View style={styles.header}>
      <Text style={styles.headerTitle}>Re-agentation demo</Text>
      <Text style={styles.headerSubtitle}>Tap the probe button, then components</Text>
    </View>
  )
}

function DemoCard({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardSubtitle}>{subtitle}</Text>
    </View>
  )
}

function DemoButton() {
  return (
    <Pressable style={styles.button}>
      <Text style={styles.buttonText}>Primary button</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fafafa' },
  header: { paddingTop: 64, paddingHorizontal: 24, paddingBottom: 16, backgroundColor: '#fff' },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#1a1a1a' },
  headerSubtitle: { fontSize: 14, color: '#6b6b6b', marginTop: 4 },
  scroll: { padding: 16, gap: 12 },
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ececec',
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  cardSubtitle: { fontSize: 13, color: '#6b6b6b', marginTop: 4 },
  button: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
})
