import { Capacitor } from '@capacitor/core';
import { Purchases, PurchasesPackage } from '@revenuecat/purchases-capacitor';

export type Plan = 'monthly' | 'yearly';

const ENTITLEMENT = 'pro';
const apiKey = import.meta.env.VITE_REVENUECAT_IOS_KEY as string | undefined;
let configured: Promise<void> | null = null;

export const purchasesAvailable = () => Capacitor.getPlatform() === 'ios' && !!apiKey;

function configure(): Promise<void> {
  if (!configured) {
    configured = Purchases.configure({ apiKey: apiKey! });
  }
  return configured;
}

const isPro = (info: { entitlements: { active: Record<string, unknown> } }) => ENTITLEMENT in info.entitlements.active;

// Returns the current subscription state from RevenueCat, or null when purchases are unavailable.
export async function syncSubscription(): Promise<boolean | null> {
  if (!purchasesAvailable()) return null;
  await configure();
  const { customerInfo } = await Purchases.getCustomerInfo();
  return isPro(customerInfo);
}

function packageFor(plan: Plan, packages: PurchasesPackage[]): PurchasesPackage | undefined {
  const type = plan === 'monthly' ? 'MONTHLY' : 'ANNUAL';
  return packages.find(p => p.packageType === type);
}

// Resolves true when the purchase grants the pro entitlement, false when the user cancels.
export async function purchasePlan(plan: Plan): Promise<boolean> {
  if (!purchasesAvailable()) throw new Error('NOT_CONNECTED');
  await configure();
  const offerings = await Purchases.getOfferings();
  const pkg = packageFor(plan, offerings.current?.availablePackages ?? []);
  if (!pkg) throw new Error('NOT_CONNECTED');
  try {
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
    return isPro(customerInfo);
  } catch (err: any) {
    if (err?.userCancelled) return false;
    throw err;
  }
}

export async function restorePurchases(): Promise<boolean> {
  if (!purchasesAvailable()) throw new Error('NOT_CONNECTED');
  await configure();
  const { customerInfo } = await Purchases.restorePurchases();
  return isPro(customerInfo);
}
