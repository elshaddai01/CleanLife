import React, { useCallback, useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { getToken, getStoredRole, clearSession } from './src/apiClient';

import SplashScreen from './src/screens/SplashScreen';
import RoleSelectionScreen from './src/screens/RoleSelectionScreen';
import AuthScreen from './src/screens/AuthScreen';

import ClientHomeScreen from './src/screens/client/ClientHomeScreen';
import RequestPickupScreen from './src/screens/client/RequestPickupScreen';
import TrackPickupScreen from './src/screens/client/TrackPickupScreen';
import MyRequestsScreen from './src/screens/client/MyRequestsScreen';

import CollectorHomeScreen from './src/screens/collector/CollectorHomeScreen';
import AvailableJobsScreen from './src/screens/collector/AvailableJobsScreen';
import ActiveJobScreen from './src/screens/collector/ActiveJobScreen';
import CollectorProfileScreen from './src/screens/collector/CollectorProfileScreen';

import WalletScreen from './src/screens/shared/WalletScreen';

type Phase = 'checking' | 'splash' | 'role_select' | 'auth' | 'client_app' | 'collector_app';

// Client-side screens within the client app, once logged in.
type ClientScreen = 'home' | 'request' | 'requests' | 'track' | 'wallet';
// Collector-side screens within the collector app, once logged in.
type CollectorScreen = 'home' | 'jobs' | 'active_job' | 'wallet' | 'profile';

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

  const handleSessionExpired = useCallback(async () => {
    await clearSession();
    setPhase('role_select');
    setClientScreen('home');
    setCollectorScreen('home');
  }, []);

  const handleLogout = useCallback(async () => {
    // Change screens immediately so logout never appears unresponsive while
    // AsyncStorage is completing its disk write.
    setPhase('role_select');
    setRole('client');
    setClientScreen('home');
    setCollectorScreen('home');
    setLastRequestId(null);
    setTrackingId(null);
    setActiveJobId(null);
    try {
      await clearSession();
    } catch (error) {
      console.error('Could not clear the persisted session:', error);
    }
  }, []);

  const handleRecentRequest = useCallback((id: number) => setLastRequestId(id), []);

  if (phase === 'checking') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#059669" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style={phase === 'splash' ? 'light' : 'dark'} />
      <SafeAreaView
        style={[
          styles.safeArea,
          phase === 'splash' && styles.safeAreaSplash,
          phase === 'role_select' && styles.safeAreaRoleSelection,
        ]}
        edges={['top', 'right', 'bottom', 'left']}
      >

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
          onViewRequests={() => setClientScreen('requests')}
          onOpenTracking={(id) => {
            setTrackingId(id);
            setClientScreen('track');
          }}
          onLogout={handleLogout}
          onRecentRequest={handleRecentRequest}
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
        <WalletScreen role="client" onBack={() => setClientScreen('home')} onSessionExpired={handleSessionExpired} />
      )}

      {/* ---------- COLLECTOR APP ---------- */}
      {phase === 'collector_app' && collectorScreen === 'home' && (
        <CollectorHomeScreen
          onViewJobs={() => setCollectorScreen('jobs')}
          onOpenWallet={() => setCollectorScreen('wallet')}
          onLogout={handleLogout}
          onOpenProfile={() => setCollectorScreen('profile')}
          onResumeJob={(id) => {
            setActiveJobId(id);
            setCollectorScreen('active_job');
          }}
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
        <WalletScreen role="collector" onBack={() => setCollectorScreen('home')} onSessionExpired={handleSessionExpired} />
      )}
      {phase === 'collector_app' && collectorScreen === 'profile' && (
        <CollectorProfileScreen onBack={() => setCollectorScreen('home')} onSessionExpired={handleSessionExpired} />
      )}
      {phase === 'client_app' && clientScreen === 'requests' && (
        <MyRequestsScreen
          onBack={() => setClientScreen('home')}
          onSessionExpired={handleSessionExpired}
          onOpenRequest={(id) => {
            setTrackingId(id);
            setClientScreen('track');
          }}
        />
      )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
  safeArea: { flex: 1, backgroundColor: '#f8fafc' },
  safeAreaSplash: { backgroundColor: '#059669' },
  safeAreaRoleSelection: { backgroundColor: '#f0fdf4' },
});
