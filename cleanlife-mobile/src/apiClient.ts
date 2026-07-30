// Real HTTP client for cleanlife-backend, adapted for React Native.
// Two real platform differences from the web version (src/apiClient.ts in
// the web frontend project):
// 1. AsyncStorage is ASYNC (unlike web localStorage), so every function
//    that needs the token must await it — this file's request() does that.
// 2. On an Android emulator, "localhost" refers to the emulator itself, not
//    your PC — you must use 10.0.2.2 to reach a server running on your host
//    machine. That's why the default below is 10.0.2.2, not localhost.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PickupStatus, WasteType, VehicleType } from './types';

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://10.0.2.2:3000';
const TOKEN_KEY = 'cleanlife_auth_token';
const ROLE_KEY = 'cleanlife_auth_role';
const USER_ID_KEY = 'cleanlife_auth_user_id';

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function getStoredRole(): Promise<'client' | 'collector' | null> {
  return AsyncStorage.getItem(ROLE_KEY) as Promise<'client' | 'collector' | null>;
}

export async function getStoredUserId(): Promise<number | null> {
  const raw = await AsyncStorage.getItem(USER_ID_KEY);
  return raw ? Number(raw) : null;
}

export async function setSession(token: string, role: 'client' | 'collector', userId: number) {
  await AsyncStorage.setItem(TOKEN_KEY, token);
  await AsyncStorage.setItem(ROLE_KEY, role);
  await AsyncStorage.setItem(USER_ID_KEY, String(userId));
}

export async function clearSession() {
  await AsyncStorage.removeItem(TOKEN_KEY);
  await AsyncStorage.removeItem(ROLE_KEY);
  await AsyncStorage.removeItem(USER_ID_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json() : null;

  if (!res.ok) {
    const message = (body && (body.error || body.message)) || `Request failed with status ${res.status}`;
    throw new ApiError(res.status, message);
  }
  return body as T;
}

// ---------- Auth ----------

export interface ClientAuthResult {
  token: string;
  client: { id: number; name: string; phone_number: string; company_id: number | null };
}

export interface CollectorAuthResult {
  token: string;
  collector: {
    id: number;
    username: string;
    collector_type: 'corporate' | 'independent';
    company_id: number | null;
    subscription_tier: 'Premium' | 'Gold' | 'Silver' | null;
  };
}

export const authApi = {
  registerClient(params: { name: string; phone_number: string; password: string; company_code?: string }) {
    return request<{ id: number; name: string; phone_number: string; company_id: number | null; company_name: string | null; created_at: string }>(
      '/clients/register',
      { method: 'POST', body: JSON.stringify(params) }
    );
  },

  loginClient(phone_number: string, password: string) {
    return request<ClientAuthResult>('/auth/client/login', {
      method: 'POST',
      body: JSON.stringify({ phone_number, password }),
    });
  },

  registerCollector(params: { username: string; password: string; subscription_tier?: 'Premium' | 'Gold' | 'Silver' }) {
    return request<{ id: number; username: string; collector_type: string; company_id: number | null; subscription_tier: string; created_at: string }>(
      '/collectors/register',
      { method: 'POST', body: JSON.stringify(params) }
    );
  },

  loginCollector(username: string, password: string) {
    return request<CollectorAuthResult>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },
};

// ---------- Pickup Requests ----------

export interface BackendPickupRequest {
  id: number;
  client_id: number;
  collector_id?: number | null;
  bag_count: number;
  waste_type: WasteType;
  mobility_type_id: number | null;
  routing_status: 'searching_corporate' | 'admin_hold' | 'broadcast_public' | 'assigned' | 'completed';
  admin_hold_expires_at: string | null;
  current_stage_rank: number;
  payment_method: 'CASH' | 'MOMO';
  payment_status: 'PENDING_COMPLETION' | 'COMPLETED' | 'FAILED';
  estimated_price_fcfa: number | null;
  collector_arrived_at?: string | null;
  cash_collected_at?: string | null;
  momo_requested_at?: string | null;
  momo_confirmed_at?: string | null;
  mobility_type?: string;
  nearest_dumpster_id?: number | null;
  nearest_dumpster_distance_meters?: number | null;
  created_at: string;
}

export function deriveStatus(pr: BackendPickupRequest, hasProofOfWork: boolean): PickupStatus {
  if (pr.routing_status === 'completed') return 'disposal_confirmed';
  if (hasProofOfWork) return 'disposal_submitted';
  if (pr.cash_collected_at || pr.momo_confirmed_at) return 'pickup_complete';
  if (pr.collector_arrived_at) return 'arrived';
  if (pr.routing_status === 'assigned') return 'on_the_way';
  if (pr.routing_status === 'broadcast_public') return 'broadcast_public';
  if (pr.routing_status === 'searching_corporate') return 'admin_hold';
  return 'pending';
}

export const pickupApi = {
  create(params: {
    client_id: number;
    bag_count: number;
    waste_type: WasteType;
    latitude: number;
    longitude: number;
    payment_method: 'CASH' | 'MOMO';
  }) {
    return request<BackendPickupRequest & { mobility_type: string; nearest_dumpster_id: number | null; nearest_dumpster_distance_meters: number | null }>(
      '/pickup-requests',
      { method: 'POST', body: JSON.stringify(params) }
    );
  },

  listAvailable() {
    return request<BackendPickupRequest[]>('/pickup-requests/available');
  },

  claim(requestId: number) {
    return request<{ id: number; routing_status: string; collector_id: number }>(
      `/pickup-requests/${requestId}/claim`,
      { method: 'POST' }
    );
  },

  arrive(requestId: number) {
    return request<{ id: number; payment_method: string; collector_arrived_at: string; momo_requested_at: string | null }>(
      `/pickup-requests/${requestId}/arrive`,
      { method: 'POST' }
    );
  },

  collectCash(requestId: number) {
    return request<{ id: number; cash_collected_at: string }>(
      `/pickup-requests/${requestId}/collect-cash`,
      { method: 'POST' }
    );
  },

  submitProofOfWork(requestId: number, params: { photo_storage_url: string; exif_latitude?: number; exif_longitude?: number; bin_code?: string }) {
    return request<{
      proof_of_work: { id: number; is_verified: boolean; verification_method: string; dumpster_id: number | null };
      pickup_request: { id: number; routing_status: string; payment_status: string; estimated_price_fcfa: number };
      wallet_credit: { id: number; new_balance: string } | null;
    }>(`/pickup-requests/${requestId}/proof-of-work`, { method: 'POST', body: JSON.stringify(params) });
  },

  // [TRACK-01] Read-only status check — see backend migration 019.
  getStatus(requestId: number) {
    return request<{
      id: number;
      routing_status: BackendPickupRequest['routing_status'];
      collector_id: number | null;
      payment_status: BackendPickupRequest['payment_status'];
      collector_arrived_at: string | null;
      cash_collected_at: string | null;
      momo_confirmed_at: string | null;
      has_proof_of_work: boolean;
    }>(`/pickup-requests/${requestId}`);
  },
};

// ---------- Wallet ----------

export const walletApi = {
  getBalance() {
    return request<{ balance: string }>('/wallet/balance');
  },
  getTransactions() {
    return request<Array<{
      id: number;
      type: 'pickup_payment' | 'job_earnings' | 'withdraw' | 'top_up' | 'referral_bonus';
      amount: string;
      currency: string;
      status: string;
      description: string;
      reference_pickup_request_id: number | null;
      created_at: string;
    }>>('/wallet/transactions');
  },
  topup(amount: number, description?: string) {
    return request<{ id: number; new_balance: string }>('/wallet/topup', {
      method: 'POST',
      body: JSON.stringify({ amount, description }),
    });
  },
  withdraw(amount: number, description?: string) {
    return request<{ id: number; new_balance: string }>('/wallet/withdraw', {
      method: 'POST',
      body: JSON.stringify({ amount, description }),
    });
  },
};

// ---------- KYC ----------

export const kycApi = {
  submit(collectorId: number, document_url: string, document_name?: string) {
    return request<{ id: number; kyc_status: string; kyc_submitted_at: string }>(
      `/collectors/${collectorId}/kyc`,
      { method: 'POST', body: JSON.stringify({ document_url, document_name }) }
    );
  },
};
