// [REAL-BACKEND-ALIGNMENT] Waste type and mobility/vehicle type now match the
// actual backend enums exactly (see cleanlife-backend migrations 001, 006) —
// the SRS/ER-diagram values are authoritative, not this prototype's original
// guesses ('Plastic'/'Paper'/'Metal'/'Mixed', 'Cargo bike'). Confirmed with
// the product owner before changing this.
export type WasteType = 'Organic' | 'Recyclable' | 'Hazardous' | 'Heavy Debris';
export type VehicleType = 'Wheelbarrow' | 'Tricycle' | 'Van';

export interface UserProfile {
  id: string;
  name: string;
  phone: string;
  email: string;
  role: 'client' | 'collector';
  avatarUrl: string;
  language: 'EN' | 'FR';
  currency: 'FCFA' | 'USD' | 'EUR';
  createdAt: string;
  company?: string; // Affiliated company (e.g. 'Hysacam', 'Sanicam', 'GreenLife Logistics', or 'None')
  username?: string; // Secure credential for Corporate Collectors
  password?: string; // Secure credential for Corporate Collectors
  
  // Collector-specific fields
  mobility?: VehicleType;
  isAvailable?: boolean;
  rating?: number;
  totalCleanups?: number;
  totalWeightRemoved?: number; // in kg
  collectorLat?: number;
  collectorLng?: number;
  
  // Wallet fields (stored on user for ease of access)
  balance: number; // in FCFA

  // KYC Verification fields
  kycStatus?: 'unverified' | 'pending' | 'verified' | 'rejected';
  kycDocumentUrl?: string; // Base64 or ObjectURL or simulated storage link
  kycDocumentName?: string; // original uploaded filename
  kycSubmittedAt?: string;
}

// [REAL-BACKEND-ALIGNMENT] The backend only tracks a coarse routing_status
// (searching_corporate/admin_hold/broadcast_public/assigned/completed) — it
// does NOT store a separate enum value for each of these finer workflow
// steps. This richer status is now DERIVED client-side from real backend
// fields (collector_arrived_at, cash_collected_at, momo_confirmed_at,
// proof_of_works existence) rather than being lost — see
// apiClient.ts:deriveStatus(). Nothing here is fake; it's computed from
// real timestamps instead of stored as its own column.
export type PickupStatus = 
  | 'pending'            // Job posted, waiting for collector
  | 'admin_hold'          // Bound client submitted with zero available company collectors
  | 'broadcast_public'   // Expired admin_hold released to general public pool
  | 'accepted'           // Collector assigned
  | 'on_the_way'         // Collector on the way
  | 'arrived'            // Collector arrived at pickup site
  | 'pickup_complete'    // Weight entered and confirmed by collector
  | 'disposal_submitted' // Disposal proof submitted, awaiting admin validation (or auto-passing)
  | 'disposal_confirmed' // Disposed and validated by admin/auto-verification, final state
  | 'cancelled';         // Job cancelled

export interface PickupJob {
  id: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  clientCompany?: string; // Associated company filter for targeted routing
  
  collectorId?: string;
  collectorName?: string;
  collectorPhone?: string;
  collectorMobility?: VehicleType;
  collectorCompany?: string; // Collector's registered company
  
  wasteType: WasteType;
  vehicleType: VehicleType;
  weight: number; // in kg (UI concept — backend tracks bag_count; see apiClient.ts mapping)
  estimatedPrice: number; // in FCFA
  status: PickupStatus;
  
  adminHoldExpiresAt?: string; // Expiration timestamp for administrative hold (2 min detour)
  
  // Image links (using high-quality default images or placeholder URLs)
  photoUrl?: string; // waste photo from client
  weightPhotoUrl?: string; // photo of balance scale from collector
  disposalPhotoUrl?: string; // photo of dump site disposal from collector
  
  locationName: string;
  clientLat?: number;
  clientLng?: number;
  collectorLat?: number;
  collectorLng?: number;
  dumpSiteLat?: number;
  dumpSiteLng?: number;
  clientGpsConfirmed?: boolean;
  collectorGpsConfirmed?: boolean;
  paymentValidated?: boolean;
  escrowStatus?: 'held' | 'validated' | 'released';
  createdAt: string;
  updatedAt: string;
}

export interface WalletTransaction {
  id: string;
  userId: string;
  type: 'pickup_payment' | 'job_earnings' | 'withdraw' | 'top_up' | 'referral_bonus';
  amount: number; // in FCFA
  currency: 'FCFA' | 'USD' | 'EUR';
  status: 'completed' | 'pending' | 'failed';
  timestamp: string;
  description: string;
  referenceId?: string; // ID of the pickup or external cashout reference
  
  // Auditing tags for Pay-for-Performance exception payouts
  shorts_detour_bypass_true?: boolean;
  full_payout_applied?: boolean;
}
