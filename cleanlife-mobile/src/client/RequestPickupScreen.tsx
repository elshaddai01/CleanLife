import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as Location from 'expo-location';
import { pickupApi, getStoredUserId, ApiError } from '../../apiClient';
import type { WasteType } from '../../types';

const WASTE_TYPES: WasteType[] = ['Organic', 'Recyclable', 'Hazardous', 'Heavy Debris'];

type Props = {
  onBack: () => void;
  onCreated: (requestId: number) => void;
};

export default function RequestPickupScreen({ onBack, onCreated }: Props) {
  const [bagCount, setBagCount] = useState('3');
  const [wasteType, setWasteType] = useState<WasteType>('Organic');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'MOMO'>('CASH');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [creating, setCreating] = useState(false);

  const handleUseCurrentLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location permission needed', 'Enable location access to auto-fill your coordinates, or they will default to a fixed test location.');
        return;
      }
      // One-shot read — no continuous tracking, matching the backend's
      // no-continuous-polling design (see SRS 4.5 / Heartbeat & Zones).
      const position = await Location.getCurrentPositionAsync({});
      setLat(position.coords.latitude);
      setLng(position.coords.longitude);
    } catch (err) {
      Alert.alert('Could not get location', String(err));
    } finally {
      setLocating(false);
    }
  };

  const handleSubmit = async () => {
    const clientId = await getStoredUserId();
    if (!clientId) {
      Alert.alert('Not logged in', 'Please log in again.');
      return;
    }
    const effectiveLat = lat ?? 3.848;
    const effectiveLng = lng ?? 11.5021;

    setCreating(true);
    try {
      const result = await pickupApi.create({
        client_id: clientId,
        bag_count: Number(bagCount),
        waste_type: wasteType,
        latitude: effectiveLat,
        longitude: effectiveLng,
        payment_method: paymentMethod,
      });
      onCreated(result.id);
    } catch (err) {
      const message = err instanceof ApiError ? `[${err.status}] ${err.message}` : String(err);
      Alert.alert('Request failed', message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable onPress={onBack} style={styles.backButton}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>Request a pickup</Text>

      <Text style={styles.label}>How many bags?</Text>
      <TextInput
        style={styles.input}
        value={bagCount}
        onChangeText={setBagCount}
        keyboardType="number-pad"
      />

      <Text style={styles.label}>Waste type</Text>
      <View style={styles.pillRow}>
        {WASTE_TYPES.map((t) => (
          <Pressable
            key={t}
            style={[styles.pill, wasteType === t && styles.pillActive]}
            onPress={() => setWasteType(t)}
          >
            <Text style={wasteType === t ? styles.pillTextActive : styles.pillText}>{t}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Pickup location</Text>
      <Pressable style={styles.locationButton} onPress={handleUseCurrentLocation} disabled={locating}>
        {locating ? (
          <ActivityIndicator color="#059669" />
        ) : (
          <Text style={styles.locationButtonText}>
            {lat && lng ? `📍 ${lat.toFixed(4)}, ${lng.toFixed(4)}` : '📍 Use my current location'}
          </Text>
        )}
      </Pressable>
      {!lat && <Text style={styles.locationHint}>If skipped, a default test location will be used.</Text>}

      <Text style={styles.label}>Payment method</Text>
      <View style={styles.pillRow}>
        {(['CASH', 'MOMO'] as const).map((m) => (
          <Pressable
            key={m}
            style={[styles.pill, paymentMethod === m && styles.pillActive]}
            onPress={() => setPaymentMethod(m)}
          >
            <Text style={paymentMethod === m ? styles.pillTextActive : styles.pillText}>{m}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable style={styles.submitButton} onPress={handleSubmit} disabled={creating}>
        {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Submit request</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: '#f8fafc', flexGrow: 1 },
  backButton: { marginBottom: 12 },
  backText: { color: '#059669', fontWeight: '700', fontSize: 14 },
  title: { fontSize: 22, fontWeight: '900', color: '#065f46', marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '700', color: '#475569', marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#fff' },
  pillActive: { backgroundColor: '#059669', borderColor: '#059669' },
  pillText: { color: '#475569', fontSize: 13 },
  pillTextActive: { color: '#fff', fontSize: 13, fontWeight: '700' },
  locationButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#059669',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  locationButtonText: { color: '#059669', fontWeight: '700' },
  locationHint: { fontSize: 11, color: '#94a3b8', marginTop: 6 },
  submitButton: { backgroundColor: '#059669', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 28 },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
