export const FREE_ADVANCED_PER_MONTH = 3;
export const PRICES = { monthly: '$1.99', yearly: '$4.99' } as const;

const USAGE_KEY = 'hw-advanced-usage';
const SUB_KEY = 'hw-subscribed';

interface Usage {
  month: string;
  used: number;
}

const monthKey = (now: Date) => `${now.getFullYear()}-${now.getMonth() + 1}`;

export function isAdvancedSelection(algos: string[]) {
  return algos.some(id => id !== 'dct');
}

export function isSubscribed() {
  return localStorage.getItem(SUB_KEY) === 'true';
}

export function setSubscribed(value: boolean) {
  localStorage.setItem(SUB_KEY, String(value));
}

export function getUsage(now = new Date()): Usage {
  try {
    const raw = JSON.parse(localStorage.getItem(USAGE_KEY) || 'null') as Usage | null;
    if (raw && raw.month === monthKey(now)) return raw;
  } catch {}
  return { month: monthKey(now), used: 0 };
}

export function hasAdvancedQuota(now = new Date()) {
  return isSubscribed() || getUsage(now).used < FREE_ADVANCED_PER_MONTH;
}

export function recordAdvancedUse(now = new Date()) {
  if (isSubscribed()) return;
  const usage = getUsage(now);
  localStorage.setItem(USAGE_KEY, JSON.stringify({ ...usage, used: usage.used + 1 }));
}

export function remainingAdvancedQuota(now = new Date()) {
  return isSubscribed() ? Infinity : Math.max(0, FREE_ADVANCED_PER_MONTH - getUsage(now).used);
}
