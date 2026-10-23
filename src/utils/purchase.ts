import { Capacitor } from '@capacitor/core';
import { Purchases } from '@revenuecat/purchases-capacitor';

export type Plan = 'monthly' | 'yearly';

export interface PlanInfo {
  plan: Plan;
  productId: string;
  price: string; // localized price from the App Store
}

export interface SubscriptionState {
  pro: boolean;
  plan: Plan | null;
}

export const PRODUCT_IDS: Record<Plan, string> = { monthly: 'hw.pro.monthly', yearly: 'hw.pro.yearly' };
const PLAN_BY_PRODUCT = Object.fromEntries(Object.entries(PRODUCT_IDS).map(([plan, id]) => [id, plan as Plan]));
const ENTITLEMENT = 'pro';
const apiKey = import.meta.env.VITE_REVENUECAT_IOS_KEY as string | undefined;
let configured: Promise<void> | null = null;

export const purchasesAvailable = () => Capacitor.getPlatform() === 'ios' && !!apiKey;

function configure(): Promise<void> {
  if (!configured) configured = Purchases.configure({ apiKey: apiKey! });
  return configured;
}

interface CustomerInfoLike {
  entitlements: { active: Record<string, { productIdentifier: string } | undefined> };
}

function stateOf(info: CustomerInfoLike): SubscriptionState {
  const entitlement = info.entitlements.active[ENTITLEMENT];
  if (!entitlement) return { pro: false, plan: null };
  return { pro: true, plan: PLAN_BY_PRODUCT[entitlement.productIdentifier] ?? null };
}

// Current subscription from the store; null when purchases are unavailable (web, simulator without key)
export async function currentSubscription(): Promise<SubscriptionState | null> {
  if (!purchasesAvailable()) return null;
  await configure();
  const { customerInfo } = await Purchases.getCustomerInfo();
  return stateOf(customerInfo);
}

// Calls back on every store update: purchases, renewals, refunds, restores on any device
export async function watchSubscription(onChange: (state: SubscriptionState) => void): Promise<void> {
  if (!purchasesAvailable()) return;
  await configure();
  await Purchases.addCustomerInfoUpdateListener(info => onChange(stateOf(info)));
}

// Localized prices and product IDs from the current offering
export async function loadPlans(): Promise<PlanInfo[]> {
  if (!purchasesAvailable()) return [];
  await configure();
  const offerings = await Purchases.getOfferings();
  const packages = offerings.current?.availablePackages ?? [];
  const find = (type: 'MONTHLY' | 'ANNUAL') => packages.find(p => p.packageType === type);
  const plans: PlanInfo[] = [];
  for (const [plan, type] of [['monthly', 'MONTHLY'], ['yearly', 'ANNUAL']] as const) {
    const pkg = find(type);
    if (pkg) plans.push({ plan, productId: pkg.product.identifier, price: pkg.product.priceString });
  }
  return plans;
}

// Resolves to the new state after a purchase, or null when the user cancels
export async function purchasePlan(plan: Plan): Promise<SubscriptionState | null> {
  if (!purchasesAvailable()) throw new Error('NOT_CONNECTED');
  await configure();
  const offerings = await Purchases.getOfferings();
  const pkg = offerings.current?.availablePackages.find(p => p.product.identifier === PRODUCT_IDS[plan]);
  if (!pkg) throw new Error('NOT_CONNECTED');
  try {
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
    return stateOf(customerInfo);
  } catch (err: any) {
    if (err?.userCancelled) return null;
    throw err;
  }
}

export async function restorePurchases(): Promise<SubscriptionState> {
  if (!purchasesAvailable()) throw new Error('NOT_CONNECTED');
  await configure();
  const { customerInfo } = await Purchases.restorePurchases();
  return stateOf(customerInfo);
}
