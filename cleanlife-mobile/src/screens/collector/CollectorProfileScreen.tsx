import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiError, getStoredUserId, kycApi, telemetryApi } from '../../apiClient';

type Props = { onBack: () => void; onSessionExpired: () => void };
type Profile = Awaited<ReturnType<typeof kycApi.getCollectorProfile>>;

export default function CollectorProfileScreen({ onBack, onSessionExpired }: Props) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [documentUrl, setDocumentUrl] = useState('');
  const [documentName, setDocumentName] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [areaId, setAreaId] = useState('');
  const [checkingIn, setCheckingIn] = useState(false);

  const load = useCallback(async () => {
    try {
      setProfile(await kycApi.getCollectorProfile());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return onSessionExpired();
      Alert.alert('Could not load profile', err instanceof ApiError ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [onSessionExpired]);

  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    const collectorId = await getStoredUserId();
    if (!collectorId || !documentUrl.trim()) return Alert.alert('Missing document', 'Enter the uploaded document URL.');
    setSubmitting(true);
    try {
      await kycApi.submit(collectorId, documentUrl.trim(), documentName.trim() || undefined);
      await load();
      Alert.alert('Submitted', 'Your KYC document is pending review.');
    } catch (err) {
      Alert.alert('Submission failed', err instanceof ApiError ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const checkIn = async () => {
    if (!areaId.trim()) return Alert.alert('Area required', 'Enter your current sector or area.');
    setCheckingIn(true);
    try {
      const result = await telemetryApi.heartbeat(areaId.trim());
      Alert.alert('Checked in', `Current area: ${result.current_area_id}`);
    } catch (err) {
      Alert.alert('Check-in failed', err instanceof ApiError ? err.message : String(err));
    } finally {
      setCheckingIn(false);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color="#0891b2" /></View>;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Pressable onPress={onBack}><Text style={styles.back}>← Back</Text></Pressable>
        <Text style={styles.title}>Collector profile</Text>
        <View style={styles.card}>
          <Text style={styles.name}>{profile?.username}</Text>
          <Text style={styles.detail}>{profile?.collector_type} · {profile?.subscription_tier || 'No tier'}</Text>
          <Text style={styles.status}>KYC: {profile?.kyc_status || 'unverified'}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Availability area</Text>
          <TextInput style={styles.input} placeholder="Sector or area ID" value={areaId} onChangeText={setAreaId} />
          <Pressable style={styles.button} onPress={checkIn} disabled={checkingIn}>
            {checkingIn ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Check in to this area</Text>}
          </Pressable>
        </View>
        {profile?.kyc_status !== 'verified' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Submit KYC document</Text>
            <TextInput style={styles.input} placeholder="Document URL" value={documentUrl} onChangeText={setDocumentUrl} autoCapitalize="none" />
            <TextInput style={styles.input} placeholder="Document name (optional)" value={documentName} onChangeText={setDocumentName} />
            <Pressable style={styles.button} onPress={submit} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Submit for review</Text>}
            </Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { flexGrow: 1, padding: 20, backgroundColor: '#f8fafc' }, back: { color: '#0891b2', fontWeight: '700', marginBottom: 14 },
  title: { fontSize: 24, fontWeight: '900', color: '#0e7490', marginBottom: 16 }, card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 16, marginBottom: 14 },
  name: { fontSize: 18, fontWeight: '800', color: '#1e293b' }, detail: { color: '#64748b', marginTop: 4, textTransform: 'capitalize' }, status: { color: '#059669', fontWeight: '800', marginTop: 12, textTransform: 'capitalize' },
  sectionTitle: { fontWeight: '800', color: '#1e293b', marginBottom: 10 }, input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 12, marginBottom: 10 },
  button: { backgroundColor: '#0891b2', borderRadius: 10, padding: 14, alignItems: 'center' }, buttonText: { color: '#fff', fontWeight: '800' },
});
