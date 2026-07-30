import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

type Props = {
  onSelectRole: (role: 'client' | 'collector') => void;
};

export default function RoleSelectionScreen({ onSelectRole }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to CleanLife</Text>
      <Text style={styles.subtitle}>How would you like to continue?</Text>

      <Pressable style={styles.card} onPress={() => onSelectRole('client')}>
        <Text style={styles.cardEmoji}>🏠</Text>
        <Text style={styles.cardTitle}>I need a pickup</Text>
        <Text style={styles.cardText}>Request waste collection for your home or business.</Text>
      </Pressable>

      <Pressable style={[styles.card, styles.cardCollector]} onPress={() => onSelectRole('collector')}>
        <Text style={styles.cardEmoji}>🚲</Text>
        <Text style={styles.cardTitle}>I collect waste</Text>
        <Text style={styles.cardText}>Find nearby jobs and get paid for pickups.</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0fdf4', padding: 24, justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '900', color: '#065f46', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#475569', textAlign: 'center', marginTop: 6, marginBottom: 28 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 22,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#059669',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  cardCollector: { borderColor: '#0891b2' },
  cardEmoji: { fontSize: 34, marginBottom: 8 },
  cardTitle: { fontSize: 18, fontWeight: '800', color: '#1e293b', marginBottom: 4 },
  cardText: { fontSize: 13, color: '#64748b' },
});
