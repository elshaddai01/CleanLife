import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { walletApi, pickupApi, ApiError, clearSession } from '../../apiClient';

type Props = {
  onViewJobs: () => void;
  onOpenWallet: () => void;
  onLogout: () => void;
  onOpenProfile: () => void;
  onResumeJob: (requestId: number) => void;
};

export default function CollectorHomeScreen({ onViewJobs, onOpenWallet, onLogout, onOpenProfile, onResumeJob }: Props) {
  const [balance, setBalance] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeJobId, setActiveJobId] = useState<number | null>(null);

  const loadBalance = useCallback(async () => {
    try {
      const [balanceResult, activeJobs] = await Promise.all([walletApi.getBalance(), pickupApi.listActive()]);
      setBalance(balanceResult.balance);
      setActiveJobId(activeJobs[0]?.id ?? null);
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
  }, [onLogout]);

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
        <Pressable onPress={() => void onLogout()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Log out">
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

      <Pressable style={styles.jobsButton} onPress={onViewJobs}>
        <Text style={styles.jobsEmoji}>📋</Text>
        <Text style={styles.jobsText}>View available jobs</Text>
      </Pressable>

      {activeJobId && (
        <Pressable style={styles.activeCard} onPress={() => onResumeJob(activeJobId)}>
          <Text style={styles.activeTitle}>Resume active job #{activeJobId}</Text>
          <Text style={styles.activeText}>Continue arrival, payment, and disposal proof →</Text>
        </Pressable>
      )}

      <Pressable style={styles.profileButton} onPress={onOpenProfile}>
        <Text style={styles.profileText}>Profile and KYC</Text>
      </Pressable>
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
  jobsButton: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#0891b2',
  },
  jobsEmoji: { fontSize: 40, marginBottom: 8 },
  jobsText: { fontSize: 17, fontWeight: '800', color: '#0e7490' },
  activeCard: { marginTop: 16, padding: 16, borderRadius: 14, backgroundColor: '#ecfeff', borderWidth: 1, borderColor: '#67e8f9' },
  activeTitle: { color: '#0e7490', fontWeight: '800' }, activeText: { color: '#0891b2', marginTop: 4, fontSize: 12 },
  profileButton: { marginTop: 14, paddingVertical: 14, alignItems: 'center' }, profileText: { color: '#475569', fontWeight: '700' },
});
