import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { walletApi, pickupApi, ApiError, clearSession } from '../../apiClient';

type Props = {
  onRequestPickup: () => void;
  onOpenWallet: () => void;
  onOpenTracking: (requestId: number) => void;
  onLogout: () => void;
  lastRequestId: number | null;
  onRecentRequest: (requestId: number) => void;
};

export default function ClientHomeScreen({
  onRequestPickup,
  onOpenWallet,
  onOpenTracking,
  onLogout,
  lastRequestId,
  onRecentRequest,
}: Props) {
  const [balance, setBalance] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadBalance = useCallback(async () => {
    try {
      const [balanceResult, requests] = await Promise.all([walletApi.getBalance(), pickupApi.listMine()]);
      setBalance(balanceResult.balance);
      if (requests[0]) onRecentRequest(requests[0].id);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await clearSession();
        onLogout();
        return;
      }
      console.warn('balance load failed', err);
    } finally {
      setRefreshing(false);
    }
  }, [onLogout, onRecentRequest]);

  useEffect(() => {
    loadBalance();
  }, [loadBalance]);

  const onRefresh = () => {
    setRefreshing(true);
    loadBalance();
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>CleanLife</Text>
        <Pressable onPress={onLogout}>
          <Text style={styles.logout}>Log out</Text>
        </Pressable>
      </View>

      <Pressable style={styles.balanceCard} onPress={onOpenWallet}>
        <Text style={styles.balanceLabel}>Wallet balance</Text>
        <Text style={styles.balanceValue}>
          {balance !== null ? `${balance} FCFA` : <ActivityIndicator color="#fff" />}
        </Text>
        <Text style={styles.balanceLink}>View transactions →</Text>
      </Pressable>

      <Pressable style={styles.requestButton} onPress={onRequestPickup}>
        <Text style={styles.requestEmoji}>🗑️</Text>
        <Text style={styles.requestText}>Request a pickup</Text>
      </Pressable>

      {lastRequestId && (
        <Pressable style={styles.trackCard} onPress={() => onOpenTracking(lastRequestId)}>
          <Text style={styles.trackTitle}>Track your last request</Text>
          <Text style={styles.trackSubtitle}>Request #{lastRequestId} →</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: '#f8fafc', flexGrow: 1 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 24, fontWeight: '900', color: '#065f46' },
  logout: { color: '#dc2626', fontWeight: '600' },
  balanceCard: { backgroundColor: '#059669', borderRadius: 16, padding: 20, marginBottom: 20 },
  balanceLabel: { color: '#d1fae5', fontSize: 13 },
  balanceValue: { color: '#fff', fontSize: 28, fontWeight: '900', marginTop: 4 },
  balanceLink: { color: '#d1fae5', fontSize: 12, marginTop: 10, fontWeight: '600' },
  requestButton: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#059669',
    marginBottom: 16,
  },
  requestEmoji: { fontSize: 40, marginBottom: 8 },
  requestText: { fontSize: 17, fontWeight: '800', color: '#065f46' },
  trackCard: {
    backgroundColor: '#ecfdf5',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  trackTitle: { fontSize: 14, fontWeight: '700', color: '#065f46' },
  trackSubtitle: { fontSize: 13, color: '#059669', marginTop: 4 },
});
