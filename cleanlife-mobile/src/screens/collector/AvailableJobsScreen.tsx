import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { pickupApi, ApiError, BackendPickupRequest } from '../../apiClient';

type Props = {
  onBack: () => void;
  onJobClaimed: (requestId: number) => void;
  onSessionExpired: () => void;
};

export default function AvailableJobsScreen({ onBack, onJobClaimed, onSessionExpired }: Props) {
  const [jobs, setJobs] = useState<BackendPickupRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [claimingId, setClaimingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await pickupApi.listAvailable();
      setJobs(result);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSessionExpired();
        return;
      }
      console.warn('available jobs load failed', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [onSessionExpired]);

  useEffect(() => {
    load();
    // [DISP-06] No push notifications yet — poll so Premium collectors
    // actually see rank-1 jobs close to instantly instead of only on
    // manual pull-to-refresh. Lower this for tighter cascade testing.
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handleClaim = async (id: number) => {
    setClaimingId(id);
    try {
      await pickupApi.claim(id);
      onJobClaimed(id);
    } catch (err) {
      const message = err instanceof ApiError ? `[${err.status}] ${err.message}` : String(err);
      Alert.alert('Could not claim job', message);
      load();
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={onBack} style={styles.backButton}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>Available jobs</Text>

      {loading && <ActivityIndicator color="#0891b2" style={{ marginTop: 20 }} />}

      <FlatList
        data={jobs}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={jobs.length === 0 && styles.emptyContainer}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.emptyText}>
              No jobs visible right now. Pull down to refresh — new requests cascade to your tier over time.
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.jobCard}>
            <Text style={styles.jobTitle}>
              #{item.id} — {item.bag_count} bag{item.bag_count > 1 ? 's' : ''}, {item.waste_type}
            </Text>
            <Text style={styles.jobSubtitle}>
              Payment: {item.payment_method} · Est. {item.estimated_price_fcfa ?? '—'} FCFA
            </Text>
            <Pressable
              style={styles.claimButton}
              onPress={() => handleClaim(item.id)}
              disabled={claimingId === item.id}
            >
              {claimingId === item.id ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.claimButtonText}>Accept job</Text>
              )}
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 20 },
  backButton: { marginBottom: 12 },
  backText: { color: '#0891b2', fontWeight: '700', fontSize: 14 },
  title: { fontSize: 22, fontWeight: '900', color: '#0e7490', marginBottom: 16 },
  emptyContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  emptyText: { color: '#94a3b8', fontSize: 13, textAlign: 'center' },
  jobCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  jobTitle: { fontSize: 15, fontWeight: '700', color: '#1e293b' },
  jobSubtitle: { fontSize: 12, color: '#64748b', marginTop: 4, marginBottom: 12 },
  claimButton: { backgroundColor: '#0891b2', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  claimButtonText: { color: '#fff', fontWeight: '700' },
});