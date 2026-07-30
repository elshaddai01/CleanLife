import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getToken, getStoredRole, clearSession } from './src/apiClient';

import SplashScreen from './src/screens/SplashScreen';
import RoleSelectionScreen from './src/screens/RoleSelectionScreen';
import AuthScreen from './src/screens/AuthScreen';

import ClientHomeScreen from './src/screens/client/ClientHomeScreen';
import RequestPickupScreen from './src/screens/client/RequestPickupScreen';
import TrackPickupScreen from './src/screens/client/TrackPickupScreen';

import CollectorHomeScreen from './src/screens/collector/CollectorHomeScreen';
import AvailableJobsScreen from './src/screens/collector/AvailableJobsScreen';
import ActiveJobScreen from './src/screens/collector/ActiveJobScreen';

import WalletScreen from './src/screens/shared/WalletScreen';

type Phase = 'checking' | 'splash' | 'role_select' | 'auth' | 'client_app' | 'collector_app';

// Client-side screens within the client app, once logged in.
type ClientScreen = 'home' | 'request' | 'track' | 'wallet';
// Collector-side screens within the collector app, once logged in.
type CollectorScreen = 'home' | 'jobs' | 'active_job' | 'wallet';

export default function App() {
  const [phase, setPhase] = useState<Phase>('checking');
  const [role, setRole] = useState<'client' | 'collector'>('client');

  const [clientScreen, setClientScreen] = useState<ClientScreen>('home');
  const [lastRequestId, setLastRequestId] = useState<number | null>(null);
  const [trackingId, setTrackingId] = useState<number | null>(null);

  const [collectorScreen, setCollectorScreen] = useState<CollectorScreen>('home');
  const [activeJobId, setActiveJobId] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      const storedRole = await getStoredRole();
      if (token && storedRole) {
        setRole(storedRole);
        setPhase(storedRole === 'client' ? 'client_app' : 'collector_app');
      } else {
        setPhase('splash');
      }
    })();
  }, []);

  const handleSessionExpired = async () => {
    await clearSession();
    setPhase('role_select');
    setClientScreen('home');
    setCollectorScreen('home');
  };

  const handleLogout = async () => {
    await clearSession();
    setPhase('role_select');
    setClientScreen('home');
    setCollectorScreen('home');
  };

  if (phase === 'checking') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#059669" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />

      {phase === 'splash' && <SplashScreen onFinished={() => setPhase('role_select')} />}

      {phase === 'role_select' && (
        <RoleSelectionScreen
          onSelectRole={(r) => {
            setRole(r);
            setPhase('auth');
          }}
        />
      )}

      {phase === 'auth' && (
        <AuthScreen
          initialRole={role}
          onBack={() => setPhase('role_select')}
          onAuthenticated={(r) => {
            setRole(r);
            setPhase(r === 'client' ? 'client_app' : 'collector_app');
          }}
        />
      )}

      {/* ---------- CLIENT APP ---------- */}
      {phase === 'client_app' && clientScreen === 'home' && (
        <ClientHomeScreen
          lastRequestId={lastRequestId}
          onRequestPickup={() => setClientScreen('request')}
          onOpenWallet={() => setClientScreen('wallet')}
          onOpenTracking={(id) => {
            setTrackingId(id);
            setClientScreen('track');
          }}
          onLogout={handleLogout}
        />
      )}
      {phase === 'client_app' && clientScreen === 'request' && (
        <RequestPickupScreen
          onBack={() => setClientScreen('home')}
          onCreated={(id) => {
            setLastRequestId(id);
            setTrackingId(id);
            setClientScreen('track');
          }}
        />
      )}
      {phase === 'client_app' && clientScreen === 'track' && trackingId && (
        <TrackPickupScreen
          requestId={trackingId}
          onBack={() => setClientScreen('home')}
          onSessionExpired={handleSessionExpired}
        />
      )}
      {phase === 'client_app' && clientScreen === 'wallet' && (
        <WalletScreen onBack={() => setClientScreen('home')} onSessionExpired={handleSessionExpired} />
      )}

      {/* ---------- COLLECTOR APP ---------- */}
      {phase === 'collector_app' && collectorScreen === 'home' && (
        <CollectorHomeScreen
          onViewJobs={() => setCollectorScreen('jobs')}
          onOpenWallet={() => setCollectorScreen('wallet')}
          onLogout={handleLogout}
        />
      )}
      {phase === 'collector_app' && collectorScreen === 'jobs' && (
        <AvailableJobsScreen
          onBack={() => setCollectorScreen('home')}
          onSessionExpired={handleSessionExpired}
          onJobClaimed={(id) => {
            setActiveJobId(id);
            setCollectorScreen('active_job');
          }}
        />
      )}
      {phase === 'collector_app' && collectorScreen === 'active_job' && activeJobId && (
        <ActiveJobScreen
          requestId={activeJobId}
          onBack={() => setCollectorScreen('jobs')}
          onSessionExpired={handleSessionExpired}
          onCompleted={() => {
            setActiveJobId(null);
            setCollectorScreen('home');
          }}
        />
      )}
      {phase === 'collector_app' && collectorScreen === 'wallet' && (
        <WalletScreen onBack={() => setCollectorScreen('home')} onSessionExpired={handleSessionExpired} />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
});
