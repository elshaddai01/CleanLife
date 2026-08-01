import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { pickupApi, uploadApi, ApiError } from '../../apiClient';

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
  const [snapshot, setSnapshot] = useState<{ uri: string; base64: string; mimeType: 'image/jpeg' | 'image/png' } | null>(null);
  const [openingCamera, setOpeningCamera] = useState(false);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await pickupApi.getStatus(requestId);
      setStatus(result);
      setPaymentMethod(result.payment_method);
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
    void load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
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
    if (!snapshot) {
      Alert.alert('Snapshot required', 'Take a disposal snapshot before submitting proof.');
      return;
    }
    if (lat == null || lng == null) {
      Alert.alert('GPS location required', 'Capture your current GPS location before completing the job.');
      return;
    }
    setBusy('proof');
    try {
      const uploaded = await uploadApi.uploadProofSnapshot(snapshot.base64, snapshot.mimeType);
      const result = await pickupApi.submitProofOfWork(requestId, {
        photo_storage_url: uploaded.url,
        exif_latitude: lat ?? undefined,
        exif_longitude: lng ?? undefined,
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

  const handleTakeSnapshot = async () => {
    setOpeningCamera(true);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera permission required', 'Allow camera access to photograph the completed disposal.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.7,
        base64: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset.base64) throw new Error('The camera did not return image data. Please retake the snapshot.');
      const mimeType = asset.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
      setSnapshot({ uri: asset.uri, base64: asset.base64, mimeType });
    } catch (err) {
      Alert.alert('Camera error', err instanceof Error ? err.message : String(err));
    } finally {
      setOpeningCamera(false);
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
          <Text style={styles.photoHint}>Take a clear photo of the waste inside the authorized dumpster. Gallery uploads are disabled.</Text>
          {snapshot ? (
            <View style={styles.previewCard}>
              <Image source={{ uri: snapshot.uri }} style={styles.previewImage} />
              <View style={styles.previewFooter}>
                <View>
                  <Text style={styles.previewTitle}>Snapshot ready</Text>
                  <Text style={styles.previewSubtitle}>This photo will be uploaded as proof.</Text>
                </View>
                <Pressable onPress={handleTakeSnapshot} hitSlop={10}><Text style={styles.retakeText}>Retake</Text></Pressable>
              </View>
            </View>
          ) : (
            <Pressable style={styles.cameraButton} onPress={handleTakeSnapshot} disabled={openingCamera}>
              {openingCamera ? <ActivityIndicator color="#fff" /> : <><Text style={styles.cameraIcon}>📷</Text><Text style={styles.cameraText}>Open camera</Text></>}
            </Pressable>
          )}
          <Text style={styles.label}>Disposal GPS location</Text>
          <Pressable style={styles.locationButton} onPress={handleUseLocation} disabled={locating}>
            {locating ? (
              <ActivityIndicator color="#0891b2" />
            ) : (
              <Text style={styles.locationButtonText}>
                {lat && lng ? `📍 ${lat.toFixed(4)}, ${lng.toFixed(4)}` : '📍 Capture my GPS location'}
              </Text>
            )}
          </Pressable>

          <Pressable style={[styles.submitButton, (!snapshot || lat == null || lng == null) && styles.buttonDisabled]} onPress={handleSubmitProof} disabled={busy === 'proof' || !snapshot || lat == null || lng == null}>
            {busy === 'proof' ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Upload snapshot & complete job</Text>}
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
  photoHint: { fontSize: 12, color: '#64748b', lineHeight: 18, marginBottom: 12 },
  cameraButton: { minHeight: 120, borderRadius: 14, backgroundColor: '#0891b2', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  cameraIcon: { fontSize: 32, marginBottom: 6 }, cameraText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  previewCard: { borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#a5f3fc', marginBottom: 16, backgroundColor: '#ecfeff' },
  previewImage: { width: '100%', height: 220, backgroundColor: '#cbd5e1' }, previewFooter: { padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  previewTitle: { color: '#0e7490', fontWeight: '800' }, previewSubtitle: { color: '#64748b', fontSize: 11, marginTop: 2 }, retakeText: { color: '#0891b2', fontWeight: '800' },
  infoText: { fontSize: 13, color: '#64748b' },
  refreshLink: { marginTop: 10, alignItems: 'center' },
  refreshLinkText: { color: '#0891b2', fontWeight: '600', fontSize: 12 },
  label: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 6 },
  locationButton: { borderWidth: 1, borderColor: '#0891b2', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  locationButtonText: { color: '#0891b2', fontWeight: '700', fontSize: 13 },
  submitButton: { backgroundColor: '#059669', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  submitText: { color: '#fff', fontWeight: '800' },
  buttonDisabled: { backgroundColor: '#94a3b8' },
});
