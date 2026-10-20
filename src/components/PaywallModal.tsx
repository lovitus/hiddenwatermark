import { Sparkles, X } from 'lucide-react';
import { PRICES } from '../utils/entitlement';
import { translations } from '../i18n/translations';
import type { Plan } from '../utils/purchase';

interface PaywallModalProps {
  t: (key: keyof typeof translations['zh'], vars?: Record<string, string | number>) => string;
  remaining: number;
  onMonthly: () => void;
  onYearly: () => void;
  onRestore: () => void;
  onClose: () => void;
}

const PLANS: Array<{ plan: Plan; price: string; labelKey: 'paywallMonthly' | 'paywallYearly' }> = [
  { plan: 'yearly', price: PRICES.yearly, labelKey: 'paywallYearly' },
  { plan: 'monthly', price: PRICES.monthly, labelKey: 'paywallMonthly' },
];

export default function PaywallModal({ t, remaining, onMonthly, onYearly, onRestore, onClose }: PaywallModalProps) {
  const choose = (plan: Plan) => (plan === 'yearly' ? onYearly() : onMonthly());

  return (
    <div className="diag-overlay" onClick={onClose}>
      <div className="diag-dialog glass-container" onClick={e => e.stopPropagation()}>
        <header className="diag-header">
          <div className="diag-title">
            <Sparkles size={20} />
            <span>{t('paywallTitle')}</span>
          </div>
          <button className="diag-close" onClick={onClose} aria-label={t('paywallLater')}>
            <X size={18} />
          </button>
        </header>

        <p className="diag-desc">{t('paywallDesc', { remaining })}</p>

        <div className="paywall-plans">
          {PLANS.map(({ plan, price, labelKey }) => (
            <button key={plan} className="paywall-plan" onClick={() => choose(plan)}>
              <span className="paywall-plan-label">{t(labelKey)}</span>
              <span className="paywall-plan-price">{price}</span>
              {plan === 'yearly' && <span className="paywall-badge">{t('paywallBestValue')}</span>}
            </button>
          ))}
        </div>

        <footer className="paywall-footer">
          <button className="paywall-link" onClick={onRestore}>{t('paywallRestore')}</button>
          <button className="paywall-link" onClick={onClose}>{t('paywallLater')}</button>
        </footer>
      </div>
    </div>
  );
}
