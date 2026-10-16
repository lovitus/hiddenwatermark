import type { CSSProperties } from 'react';
import { FlaskConical, CheckCircle2, XCircle, RefreshCw, X } from 'lucide-react';
import { TestCaseResult } from '../utils/selfTest';
import { translations } from '../i18n/translations';

interface DiagnosticModalProps {
  t: (key: keyof typeof translations['zh']) => string;
  running: boolean;
  progress: { current: number; total: number; currentName: string };
  results: TestCaseResult[];
  onRerun: () => void;
  onClose: () => void;
}

export default function DiagnosticModal({ t, running, progress, results, onRerun, onClose }: DiagnosticModalProps) {
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.length - passed;
  const percent = results.length ? Math.round((passed / results.length) * 100) : 0;
  const totalMs = results.reduce((acc, r) => acc + r.durationMs, 0);
  const tone = failed === 0 ? 'ok' : 'bad';

  return (
    <div className="diag-overlay" onClick={onClose}>
      <div className="diag-dialog glass-container" onClick={e => e.stopPropagation()}>
        <header className="diag-header">
          <div className="diag-title">
            <FlaskConical size={20} />
            <span>{t('selfTestTitle')}</span>
          </div>
          <button className="diag-close" onClick={onClose} aria-label={t('closeSelfTestBtn')}>
            <X size={18} />
          </button>
        </header>

        <p className="diag-desc">{t('selfTestDesc')}</p>

        {running && (
          <div>
            <div className="diag-progress-meta">
              <span>{progress.currentName}</span>
              <span>{progress.current}/{progress.total}</span>
            </div>
            <div className="diag-progress-track">
              <div className="diag-progress-fill" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
            </div>
          </div>
        )}

        {results.length > 0 && !running && (
          <div className={`diag-summary ${tone}`}>
            <div className="diag-ring" style={{ '--pct': percent } as CSSProperties}>
              <span>{percent}%</span>
            </div>
            <div>
              <div className="diag-summary-title">
                {failed === 0 ? t('selfTestAllPassed') : `${failed} ${t('selfTestFailedLabel')}`}
              </div>
              <div className="diag-summary-sub">
                {t('selfTestPassRate')} {passed}/{results.length} · {t('selfTestTotalTime')} {totalMs}ms
              </div>
            </div>
          </div>
        )}

        <div className="diag-list">
          {results.map(test => {
            const ok = test.status === 'pass';
            return (
              <div key={test.id} className={`diag-item ${ok ? 'pass' : 'fail'}`}>
                {ok
                  ? <CheckCircle2 size={20} className="diag-item-icon pass" />
                  : <XCircle size={20} className="diag-item-icon fail" />}
                <div>
                  <div className="diag-item-name">{test.name}</div>
                  <div className="diag-item-detail">{test.details}</div>
                </div>
                <span className="diag-item-time">{test.durationMs}ms</span>
              </div>
            );
          })}
        </div>

        <footer className="diag-footer">
          <button className="btn-primary" onClick={onRerun} disabled={running}>
            {running ? <div className="spinner" /> : <RefreshCw size={16} />}
            <span>{t('reRunSelfTestBtn')}</span>
          </button>
          <button className="btn-primary diag-secondary" onClick={onClose}>
            <span>{t('closeSelfTestBtn')}</span>
          </button>
        </footer>
      </div>
    </div>
  );
}
