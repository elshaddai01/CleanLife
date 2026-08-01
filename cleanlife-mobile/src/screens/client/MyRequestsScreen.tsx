import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { ApiError, BackendPickupRequest, pickupApi } from '../../apiClient';

type Props = {
  onBack: () => void;
  onOpenRequest: (requestId: number) => void;
  onSessionExpired: () => void;
};

const STATUS_LABEL: Record<BackendPickupRequest['routing_status'], string> = {
  searching_corporate: 'Finding company collector',
  admin_hold: 'Awaiting assignment',
  broadcast_public: 'Finding collector',
  assigned: 'Collector assigned',
  completed: 'Completed',
};

export default function MyRequestsScreen({ onBack, onOpenRequest, onSessionExpired }: Props) {
  const [requests, setRequests] = useState<BackendPickupRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRequests(await pickupApi.listMine());
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return onSessionExpired();
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [onSessionExpired]);

  useEffect(() => { void load(); }, [load]);

  return (
    <View style={styles.container}>
      <Pressable onPress={onBack} hitSlop={12}><Text style={styles.back}>← Back</Text></Pressable>
      <Text style={styles.title}>My requests</Text>
      <Text style={styles.subtitle}>Track every pickup you have requested.</Text>
      {loading && <ActivityIndicator color="#059669" style={styles.loader} />}
      {!!error && <Text style={styles.error}>{error}</Text>}
      <FlatList
        data={requests}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
        contentContainerStyle={requests.length === 0 ? styles.emptyContainer : styles.list}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>You have not requested a pickup yet.</Text> : null}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => onOpenRequest(item.id)}>
            <View style={styles.cardHeader}>
              <Text style={styles.requestId}>Request #{item.id}</Text>
              <View style={[styles.badge, item.routing_status === 'completed' && styles.badgeCompleted]}>
                <Text style={styles.badgeText}>{STATUS_LABEL[item.routing_status]}</Text>
              </View>
            </View>
            <Text style={styles.details}>{item.bag_count} bag{item.bag_count === 1 ? '' : 's'} · {item.waste_type}</Text>
            <Text style={styles.meta}>{item.payment_method} · {item.estimated_price_fcfa ?? 0} FCFA</Text>
            <View style={styles.footer}>
              <Text style={styles.date}>{new Date(item.created_at).toLocaleString()}</Text>
              <Text style={styles.track}>Track →</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', paddingHorizontal: 20, paddingTop: 14 },
  back: { color: '#059669', fontWeight: '700', marginBottom: 14 }, title: { fontSize: 24, fontWeight: '900', color: '#065f46' },
  subtitle: { color: '#64748b', fontSize: 13, marginTop: 4, marginBottom: 16 }, loader: { marginTop: 24 }, error: { color: '#dc2626', marginBottom: 12 },
  list: { paddingBottom: 24 }, emptyContainer: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' }, empty: { color: '#94a3b8', textAlign: 'center' },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbeafe', borderRadius: 16, padding: 16, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }, requestId: { color: '#1e293b', fontWeight: '800', fontSize: 15 },
  badge: { flexShrink: 1, backgroundColor: '#ecfeff', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5 }, badgeCompleted: { backgroundColor: '#dcfce7' },
  badgeText: { color: '#0e7490', fontWeight: '700', fontSize: 10, textAlign: 'center' }, details: { color: '#334155', fontWeight: '700', marginTop: 14 },
  meta: { color: '#64748b', fontSize: 12, marginTop: 4 }, footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, alignItems: 'center' },
  date: { color: '#94a3b8', fontSize: 10 }, track: { color: '#059669', fontWeight: '800', fontSize: 12 },
});
