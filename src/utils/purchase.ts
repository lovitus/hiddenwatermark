export type Plan = 'monthly' | 'yearly';

// Store integration point. Until the App Store subscription products are configured and a
// StoreKit bridge is installed, purchases are unavailable and report NOT_CONNECTED.
export async function purchasePlan(_plan: Plan): Promise<boolean> {
  throw new Error('NOT_CONNECTED');
}

export async function restorePurchases(): Promise<boolean> {
  throw new Error('NOT_CONNECTED');
}
