import { Sparkles, X } from 'lucide-react';
import { translations } from '../i18n/translations';
import type { Plan, PlanInfo } from '../utils/purchase';

type T = (key: keyof typeof translations['zh'], vars?: Record<string, string | number>) => string;

interface PaywallModalProps {
  t: T;
  plans: PlanInfo[];
  current: Plan | null;
  busy: boolean;
  remaining: number;
  onChoose: (plan: Plan) => void;
  onRestore: () => void;
  onClose: () => void;
}

const TERMS_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
const PRIVACY_URL = 'https://lovitus.github.io/hiddenwatermark/privacy/';

export default function PaywallModal({ t, plans, current, busy, remaining, onChoose, onRestore, onClose }: PaywallModalProps) {
  // Label and availability for each card, based on the subscription the user already has
  const cardFor = (plan: Plan) => {
    if (current === plan) return { label: t('paywallCurrentPlan'), note: '', disabled: true, badge: '' };
    if (current === 'monthly' && plan === 'yearly') return { label: t('paywallUpgradeToYearly'), note: t('paywallUpgradeNote'), disabled: false, badge: t('paywallBestValue') };
    if (current === 'yearly' && plan === 'monthly') return { label: t('paywallSwitchToMonthly'), note: t('paywallSwitchNote'), disabled: false, badge: '' };
    return { label: plan === 'monthly' ? t('paywallMonthly') : t('paywallYearly'), note: '', disabled: false, badge: plan === 'yearly' ? t('paywallBestValue') : '' };
  };

  const order: Plan[] = ['yearly', 'monthly'];
  return (
    <div className="diag-overlay" onClick={onClose}>
      <div className="diag-dialog glass-container" onClick={e => e.stopPropagation()}>
        <header className="diag-header">
          <div className="diag-title">
            <Sparkles size={20} />
            <span>{t('paywallTitle')}</span>
          </div>
          <button className="icon-close" onClick={onClose} aria-label={t('paywallLater')}>
            <X size={18} />
          </button>
        </header>

        <p className="diag-desc">{current ? t('paywallCurrentDesc', { plan: current === 'monthly' ? t('paywallMonthly') : t('paywallYearly') }) : t('paywallDesc', { remaining })}</p>

        {plans.length === 0 ? (
          <p className="paywall-unavailable">{t('paywallNotConnected')}</p>
        ) : (
          <div className="paywall-plans">
            {order.map(plan => {
              const info = plans.find(p => p.plan === plan);
              const card = cardFor(plan);
              return (
                <button
                  key={plan}
                  className="paywall-plan"
                  disabled={!info || busy || card.disabled}
                  onClick={() => onChoose(plan)}
                >
                  {card.badge && <span className="paywall-badge">{card.badge}</span>}
                  <span className="paywall-plan-label">{card.label}</span>
                  <span className="paywall-plan-price">{info?.price ?? '—'}</span>
                  <span className="paywall-plan-length">{plan === 'monthly' ? t('paywallPerMonth') : t('paywallPerYear')}</span>
                  {card.note && <span className="paywall-plan-note">{card.note}</span>}
                </button>
              );
            })}
          </div>
        )}

        <p className="paywall-legal">{t('paywallAutoRenew')}</p>

        <footer className="paywall-footer">
          <button className="paywall-link" onClick={onRestore} disabled={busy}>{t('paywallRestore')}</button>
          <a className="paywall-link" href={TERMS_URL} target="_blank" rel="noreferrer">{t('paywallTerms')}</a>
          <a className="paywall-link" href={PRIVACY_URL} target="_blank" rel="noreferrer">{t('paywallPrivacy')}</a>
          <button className="paywall-link" onClick={onClose}>{t('paywallLater')}</button>
        </footer>
      </div>
    </div>
  );
}
