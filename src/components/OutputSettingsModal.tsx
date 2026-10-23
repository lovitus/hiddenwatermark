import { Settings, X } from 'lucide-react';
import { translations } from '../i18n/translations';
import { MAX_EXTRACT_SIZE, OutputSettings } from '../utils/image';

type T = (key: keyof typeof translations['zh'], vars?: Record<string, string | number>) => string;

interface OutputSettingsModalProps {
  t: T;
  value: OutputSettings;
  onChange: (value: OutputSettings) => void;
  onClose: () => void;
}

const SIZE_OPTIONS = [MAX_EXTRACT_SIZE, 2048];

export default function OutputSettingsModal({ t, value, onChange, onClose }: OutputSettingsModalProps) {
  const update = (patch: Partial<OutputSettings>) => onChange({ ...value, ...patch });

  return (
    <div className="diag-overlay" onClick={onClose}>
      <div className="diag-dialog glass-container" onClick={e => e.stopPropagation()}>
        <header className="diag-header">
          <div className="diag-title">
            <Settings size={20} />
            <span>{t('outputSettingsTitle')}</span>
          </div>
          <button className="icon-close" onClick={onClose} aria-label={t('closeBtn')}>
            <X size={18} />
          </button>
        </header>

        <div className="settings-group">
          <span className="settings-label">{t('outputFormat')}</span>
          <div className="segmented">
            <button className={`segmented-btn ${value.format === 'jpeg' ? 'active' : ''}`} onClick={() => update({ format: 'jpeg' })}>JPG</button>
            <button className={`segmented-btn ${value.format === 'png' ? 'active' : ''}`} onClick={() => update({ format: 'png' })}>PNG</button>
          </div>
          <p className="settings-hint">{value.format === 'jpeg' ? t('outputJpegHint') : t('outputPngHint')}</p>
        </div>

        {value.format === 'jpeg' && (
          <div className="settings-group">
            <span className="settings-label">{t('outputQuality')}: {value.quality}%</span>
            <input
              type="range"
              min={60}
              max={100}
              step={1}
              value={value.quality}
              onChange={e => update({ quality: Number(e.target.value) })}
              className="range-slider"
            />
          </div>
        )}

        <div className="settings-group">
          <span className="settings-label">{t('outputSize')}</span>
          <div className="segmented">
            {SIZE_OPTIONS.map(size => (
              <button key={size} className={`segmented-btn ${value.maxSide === size ? 'active' : ''}`} onClick={() => update({ maxSide: size })}>
                {size === MAX_EXTRACT_SIZE ? t('outputSizeOriginal') : `${size}px`}
              </button>
            ))}
          </div>
          <p className="settings-hint">{t('outputSizeHint')}</p>
        </div>

        <footer className="diag-footer">
          <button className="btn-secondary diag-secondary" onClick={onClose}>
            <span>{t('closeBtn')}</span>
          </button>
        </footer>
      </div>
    </div>
  );
}
