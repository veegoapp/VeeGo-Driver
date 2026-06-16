import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useDemoMode, type DemoSpeed } from './DemoContext';

const SPEEDS: DemoSpeed[] = [1, 2, 5];

export function DemoSpeedControl() {
  const { demoSpeed, setDemoSpeed } = useDemoMode();
  return (
    <View style={styles.row}>
      <Text style={styles.label}>DEMO</Text>
      {SPEEDS.map(s => (
        <Pressable
          key={s}
          onPress={() => setDemoSpeed(s)}
          style={[styles.btn, demoSpeed === s && styles.btnActive]}
        >
          <Text style={[styles.btnText, demoSpeed === s && styles.btnTextActive]}>
            {s}×
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(10,10,20,0.72)', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  label: { fontSize: 9, color: 'rgba(255,255,255,0.45)', letterSpacing: 1, marginRight: 2 },
  btn: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  btnActive: { backgroundColor: '#4f46e5' },
  btnText: { fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: '700' },
  btnTextActive: { color: '#fff' },
});
