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
import { authApi, setSession, ApiError } from '../apiClient';

type Props = {
  initialRole: 'client' | 'collector';
  onAuthenticated: (role: 'client' | 'collector') => void;
  onBack: () => void;
};

export default function AuthScreen({ initialRole, onAuthenticated, onBack }: Props) {
  const [role, setRole] = useState<'client' | 'collector'>(initialRole);
  const [mode, setMode] = useState<'login' | 'register'>('login');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [companyCode, setCompanyCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      if (role === 'client') {
        if (mode === 'register') {
          await authApi.registerClient({
            name,
            phone_number: phone,
            password,
            company_code: companyCode || undefined,
          });
        }
        const result = await authApi.loginClient(phone, password);
        await setSession(result.token, 'client', result.client.id);
        onAuthenticated('client');
      } else {
        if (mode === 'register') {
          await authApi.registerCollector({ username, password });
        }
        const result = await authApi.loginCollector(username, password);
        await setSession(result.token, 'collector', result.collector.id);
        onAuthenticated('collector');
      }
    } catch (err) {
      const message = err instanceof ApiError ? `[${err.status}] ${err.message}` : String(err);
      Alert.alert(mode === 'register' ? 'Registration failed' : 'Login failed', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable onPress={onBack} style={styles.backButton}>
        <Text style={styles.backText}>← Back to role selection</Text>
      </Pressable>
      <Text style={styles.title}>CleanLife</Text>
      <Text style={styles.subtitle}>
        {role === 'client' ? 'Client account' : 'Collector account'}
      </Text>

      <View style={styles.toggleRow}>
        <Pressable
          style={[styles.toggleButton, mode === 'login' && styles.toggleButtonActive]}
          onPress={() => setMode('login')}
        >
          <Text style={mode === 'login' ? styles.toggleTextActive : styles.toggleText}>Log in</Text>
        </Pressable>
        <Pressable
          style={[styles.toggleButton, mode === 'register' && styles.toggleButtonActive]}
          onPress={() => setMode('register')}
        >
          <Text style={mode === 'register' ? styles.toggleTextActive : styles.toggleText}>Register</Text>
        </Pressable>
      </View>

      {role === 'client' ? (
        <>
          {mode === 'register' && (
            <TextInput style={styles.input} placeholder="Name" value={name} onChangeText={setName} />
          )}
          <TextInput
            style={styles.input}
            placeholder="Phone number"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          {mode === 'register' && (
            <TextInput
              style={styles.input}
              placeholder="Company code (optional)"
              value={companyCode}
              onChangeText={setCompanyCode}
            />
          )}
        </>
      ) : (
        <TextInput style={styles.input} placeholder="Username" value={username} onChangeText={setUsername} />
      )}

      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <Pressable style={styles.submitButton} onPress={handleSubmit} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitText}>{mode === 'register' ? 'Register & log in' : 'Log in'}</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: '#f8fafc' },
  backButton: { marginBottom: 12 },
  backText: { color: '#059669', fontWeight: '700', fontSize: 14 },
  title: { fontSize: 32, fontWeight: '900', color: '#065f46', textAlign: 'center' },
  subtitle: { fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 24 },
  toggleRow: { flexDirection: 'row', marginBottom: 12, backgroundColor: '#e2e8f0', borderRadius: 10, padding: 4 },
  toggleButton: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  toggleButtonActive: { backgroundColor: '#10b981' },
  toggleText: { color: '#475569', fontWeight: '600' },
  toggleTextActive: { color: '#fff', fontWeight: '700' },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    fontSize: 15,
  },
  submitButton: {
    backgroundColor: '#059669',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
