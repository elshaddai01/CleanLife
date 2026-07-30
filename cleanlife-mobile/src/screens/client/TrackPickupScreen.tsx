import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { pickupApi, ApiError } from '../../apiClient';

type Props = {
  requestId: number;
  onBack: () => void;
  onSessionExpired: () => void;
};

type Stage = {
  key: string;
  label: string;
  done: boolean;
};

const POLL_INTERVAL_MS = 5000;

export default function TrackPickupScreen({ requestId, onBack, onSessionExpired }: Props) {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof pickupApi.getStatus>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await pickupApi.getStatus(requestId);
      setStatus(result);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSessionExpired();
        return;
      }
      setError(err instanceof ApiError ? `[${err.status}] ${err.message}` : String(err));
    } finally {
      setLoading(false);
    }
  }, [requestId, onSessionExpired]);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  const buildStages = (): Stage[] => {
    if (!status) return [];
    const isPublicOrCorporate = status.routing_status !== 'assigned' && status.routing_status !== 'completed';
    return [
      { key: 'posted', label: 'Request posted', done: true },
      { key: 'assigned', label: 'Collector assigned', done: !isPublicOrCorporate || !!status.collector_id },
      { key: 'arrived', label: 'Collector arrived', done: !!status.collector_arrived_at },
      {
        key: 'payment',
        label: 'Payment handled',
        done: !!status.cash_collected_at || !!status.momo_confirmed_at,
      },
      { key: 'disposed', label: 'Disposal verified', done: status.has_proof_of_work },
      { key: 'completed', label: 'Completed', done: status.routing_status === 'completed' },
    ];
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={onBack} style={styles.backButton}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>Request #{requestId}</Text>

      {loading && <ActivityIndicator color="#059669" style={{ marginTop: 20 }} />}
      {error && <Text style={styles.errorText}>{error}</Text>}

      {status && (
        <>
          <View style={styles.statusBadge}>
            <Text style={styles.statusBadgeText}>{status.routing_status.replace('_', ' ')}</Text>
          </View>

          {buildStages().map((stage) => (
            <View key={stage.key} style={styles.stageRow}>
              <View style={[styles.dot, stage.done && styles.dotDone]} />
              <Text style={[styles.stageText, stage.done && styles.stageTextDone]}>{stage.label}</Text>
            </View>
          ))}

          <Text style={styles.paymentStatus}>
            Payment: {status.payment_status === 'COMPLETED' ? 'Released ✅' : 'Pending completion'}
          </Text>

          <Text style={styles.autoRefreshNote}>Auto-refreshing every 5 seconds…</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 20 },
  backButton: { marginBottom: 12 },
  backText: { color: '#059669', fontWeight: '700', fontSize: 14 },
  title: { fontSize: 22, fontWeight: '900', color: '#065f46', marginBottom: 16 },
  errorText: { color: '#dc2626', marginTop: 12 },
  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#059669',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 20,
  },
  statusBadgeText: { color: '#fff', fontWeight: '800', fontSize: 13, textTransform: 'capitalize' },
  stageRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#e2e8f0', marginRight: 12 },
  dotDone: { backgroundColor: '#059669' },
  stageText: { fontSize: 14, color: '#94a3b8' },
  stageTextDone: { color: '#1e293b', fontWeight: '700' },
  paymentStatus: { marginTop: 16, fontSize: 14, fontWeight: '700', color: '#1e293b' },
  autoRefreshNote: { marginTop: 20, fontSize: 11, color: '#94a3b8', textAlign: 'center' },
});
