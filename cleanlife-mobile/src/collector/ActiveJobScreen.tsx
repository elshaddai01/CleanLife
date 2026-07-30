import React, { useCallback, useEffect, useState } from 'react';
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
import { pickupApi, ApiError } from '../../apiClient';

type Props = {
  requestId: number;
  onBack: () => void;
  onCompleted: () => void;
  onSessionExpired: () => void;
};

export default function ActiveJobScreen({ requestId, onBack, onCompleted, onSessionExpired }: Props) {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof pickupApi.getStatus>> | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'MOMO' | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [binCode, setBinCode] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await pickupApi.getStatus(requestId);
      setStatus(result);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSessionExpired();
        return;
      }
      console.warn('status load failed', err);
    } finally {
      setLoading(false);
    }
  }, [requestId, onSessionExpired]);

  useEffect(() => {
    load();
  }, [load]);

  const handleArrive = async () => {
    setBusy('arrive');
    try {
      const result = await pickupApi.arrive(requestId);
      setPaymentMethod(result.payment_method as 'CASH' | 'MOMO');
      await load();
    } catch (err) {
      const message = err instanceof ApiError ? `[${err.status}] ${err.message}` : String(err);
      Alert.alert('Could not mark arrival', message);
    } finally {
      setBusy(null);
    }
  };

  const handleCollectCash = async () => {
    setBusy('cash');
    try {
      await pickupApi.collectCash(requestId);
      await load();
    } catch (err) {
      const message = err instanceof ApiError ? `[${err.status}] ${err.message}` : String(err);
      Alert.alert('Could not confirm cash', message);
    } finally {
      setBusy(null);
    }
  };

  const handleUseLocation = async () => {
    setLocating(true);
    try {
      const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
      if (permStatus !== 'granted') {
        Alert.alert('Location permission needed', 'Enable location access, or use the bin code instead.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      setLat(position.coords.latitude);
      setLng(position.coords.longitude);
    } catch (err) {
      Alert.alert('Could not get location', String(err));
    } finally {
      setLocating(false);
    }
  };

  const handleSubmitProof = async () => {
    if (!binCode && (lat == null || lng == null)) {
      Alert.alert('Missing verification', 'Either enter a bin code or capture your location.');
      return;
    }
    setBusy('proof');
    try {
      const result = await pickupApi.submitProofOfWork(requestId, {
        photo_storage_url: 's3://mobile-disposal-photo.jpg',
        exif_latitude: lat ?? undefined,
        exif_longitude: lng ?? undefined,
        bin_code: binCode || undefined,
      });
      Alert.alert(
        'Job completed!',
        `Verified via ${result.proof_of_work.verification_method}.\n${
          result.wallet_credit ? `Earned ${result.wallet_credit.new_balance} FCFA total balance.` : ''
        }`
      );
      onCompleted();
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        Alert.alert('Verification failed', err.message);
      } else {
        const message = err instanceof ApiError ? `[${err.status}] ${err.message}` : String(err);
        Alert.alert('Submission failed', message);
      }
    } finally {
      setBusy(null);
    }
  };

  if (loading || !status) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator color="#0891b2" size="large" />
      </View>
    );
  }

  const arrived = !!status.collector_arrived_at;
  const paymentDone = !!status.cash_collected_at || !!status.momo_confirmed_at;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable onPress={onBack} style={styles.backButton}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>Job #{requestId}</Text>
      <Text style={styles.subtitle}>Status: {status.routing_status.replace('_', ' ')}</Text>

      {!arrived && (
        <Pressable style={styles.actionButton} onPress={handleArrive} disabled={busy === 'arrive'}>
          {busy === 'arrive' ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionText}>Mark arrival</Text>}
        </Pressable>
      )}

      {arrived && !paymentDone && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment</Text>
          {paymentMethod === 'MOMO' ? (
            <Text style={styles.infoText}>
              MoMo Request-to-Pay sent. Waiting for the client to confirm on their phone — pull to refresh or check back.
            </Text>
          ) : (
            <Pressable style={styles.actionButton} onPress={handleCollectCash} disabled={busy === 'cash'}>
              {busy === 'cash' ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionText}>Confirm cash received</Text>}
            </Pressable>
          )}
          <Pressable style={styles.refreshLink} onPress={load}>
            <Text style={styles.refreshLinkText}>Refresh status</Text>
          </Pressable>
        </View>
      )}

      {arrived && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Proof of disposal</Text>
          <Text style={styles.label}>Bin code (if painted on the dumpster)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. BIN-YAO-042"
            value={binCode}
            onChangeText={setBinCode}
            autoCapitalize="characters"
          />
          <Text style={styles.orText}>— or —</Text>
          <Pressable style={styles.locationButton} onPress={handleUseLocation} disabled={locating}>
            {locating ? (
              <ActivityIndicator color="#0891b2" />
            ) : (
              <Text style={styles.locationButtonText}>
                {lat && lng ? `📍 ${lat.toFixed(4)}, ${lng.toFixed(4)}` : '📍 Capture my GPS location'}
              </Text>
            )}
          </Pressable>

          <Pressable style={styles.submitButton} onPress={handleSubmitProof} disabled={busy === 'proof'}>
            {busy === 'proof' ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Submit proof & complete job</Text>}
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: '#f8fafc', flexGrow: 1 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
  backButton: { marginBottom: 12 },
  backText: { color: '#0891b2', fontWeight: '700', fontSize: 14 },
  title: { fontSize: 22, fontWeight: '900', color: '#0e7490' },
  subtitle: { fontSize: 13, color: '#64748b', marginBottom: 20, textTransform: 'capitalize' },
  actionButton: { backgroundColor: '#0891b2', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 8 },
  actionText: { color: '#fff', fontWeight: '800' },
  section: { marginTop: 12, backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#1e293b', marginBottom: 10 },
  infoText: { fontSize: 13, color: '#64748b' },
  refreshLink: { marginTop: 10, alignItems: 'center' },
  refreshLinkText: { color: '#0891b2', fontWeight: '600', fontSize: 12 },
  label: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 6 },
  input: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  orText: { textAlign: 'center', color: '#94a3b8', fontSize: 12, marginVertical: 10 },
  locationButton: { borderWidth: 1, borderColor: '#0891b2', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  locationButtonText: { color: '#0891b2', fontWeight: '700', fontSize: 13 },
  submitButton: { backgroundColor: '#059669', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  submitText: { color: '#fff', fontWeight: '800' },
});
