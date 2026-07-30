import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';

type Props = {
  onFinished: () => void;
};

export default function SplashScreen({ onFinished }: Props) {
  useEffect(() => {
    const timer = setTimeout(onFinished, 1400);
    return () => clearTimeout(timer);
  }, [onFinished]);

  return (
    <View style={styles.container}>
      <View style={styles.logoCircle}>
        <Text style={styles.logoEmoji}>♻️</Text>
      </View>
      <Text style={styles.title}>CleanLife</Text>
      <Text style={styles.subtitle}>Waste management, on demand</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  logoEmoji: { fontSize: 44 },
  title: { fontSize: 34, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },
  subtitle: { fontSize: 14, color: '#d1fae5', marginTop: 6 },
});
