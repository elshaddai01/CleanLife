import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Pressable,
} from 'react-native';
import { walletApi, ApiError } from '../../apiClient';

type Transaction = {
  id: number;
  type: 'pickup_payment' | 'job_earnings' | 'withdraw' | 'top_up' | 'referral_bonus';
  amount: string;
  currency: string;
  status: string;
  description: string;
  reference_pickup_request_id: number | null;
  created_at: string;
};

const TYPE_LABEL: Record<Transaction['type'], string> = {
  job_earnings: 'Job earnings',
  withdraw: 'Withdrawal',
  top_up: 'Top-up',
  pickup_payment: 'Pickup payment',
  referral_bonus: 'Referral bonus',
};

const CREDIT_TYPES = new Set(['job_earnings', 'top_up', 'referral_bonus']);

type Props = {
  onBack: () => void;
  onSessionExpired: () => void;
};

export default function WalletScreen({ onBack, onSessionExpired }: Props) {
  const [balance, setBalance] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [balanceResult, txResult] = await Promise.all([
        walletApi.getBalance(),
        walletApi.getTransactions(),
      ]);
      setBalance(balanceResult.balance);
      setTransactions(txResult);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSessionExpired();
        return;
      }
      console.warn('wallet load failed', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [onSessionExpired]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={onBack} style={styles.backButton}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Wallet balance</Text>
        {loading ? (
          <ActivityIndicator color="#fff" style={{ marginTop: 8 }} />
        ) : (
          <Text style={styles.balanceValue}>{balance} FCFA</Text>
        )}
      </View>

      <Text style={styles.sectionTitle}>Transaction history</Text>

      <FlatList
        data={transactions}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={transactions.length === 0 && styles.emptyContainer}
        ListEmptyComponent={
          !loading ? <Text style={styles.emptyText}>No transactions yet.</Text> : null
        }
        renderItem={({ item }) => {
          const isCredit = CREDIT_TYPES.has(item.type);
          return (
            <View style={styles.txRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.txType}>{TYPE_LABEL[item.type]}</Text>
                {!!item.description && <Text style={styles.txDescription}>{item.description}</Text>}
                <Text style={styles.txDate}>{new Date(item.created_at).toLocaleString()}</Text>
              </View>
              <Text style={[styles.txAmount, isCredit ? styles.txCredit : styles.txDebit]}>
                {isCredit ? '+' : '-'}
                {item.amount} {item.currency}
              </Text>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 20 },
  backButton: { marginBottom: 12 },
  backText: { color: '#059669', fontWeight: '700', fontSize: 14 },
  balanceCard: { backgroundColor: '#059669', borderRadius: 14, padding: 20, marginBottom: 20 },
  balanceLabel: { color: '#d1fae5', fontSize: 13 },
  balanceValue: { color: '#fff', fontSize: 28, fontWeight: '900', marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1e293b', marginBottom: 10 },
  emptyContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#94a3b8', fontSize: 13 },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  txType: { fontSize: 14, fontWeight: '700', color: '#1e293b' },
  txDescription: { fontSize: 12, color: '#64748b', marginTop: 2 },
  txDate: { fontSize: 11, color: '#94a3b8', marginTop: 4 },
  txAmount: { fontSize: 14, fontWeight: '800' },
  txCredit: { color: '#059669' },
  txDebit: { color: '#dc2626' },
});
