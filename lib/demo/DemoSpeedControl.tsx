import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { useDemoMode, type DemoSpeed } from './DemoContext';

const SPEEDS: DemoSpeed[] = [1, 2, 5];

export function DemoSpeedControl() {
  const { demoSpeed, setDemoSpeed } = useDemoMode();

  return (
    <View style={styles.container}>
      <Text style={styles.label}>DEMO</Text>
      {SPEEDS.map(s => {
        const active = demoSpeed === s;
        return (
          <Pressable
            key={s}
            onPress={() => setDemoSpeed(s)}
            style={[styles.btn, active && styles.btnActive]}
          >
            <Text style={[styles.btnText, active && styles.btnTextActive]}>
              {s}×
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(10,10,20,0.75)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  label: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.45)',
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1,
    marginRight: 4,
  },
  btn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  btnActive: {
    backgroundColor: '#6366f1',
  },
  btnText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    fontFamily: 'Inter_600SemiBold',
  },
  btnTextActive: {
    color: '#fff',
  },
});
