import React, { useState, useRef, useEffect } from 'react';
import { 
  Shield, 
  Image as ImageIcon, 
  Unlock, 
  HelpCircle, 
  Download, 
  RefreshCw, 
  AlertTriangle, 
  FileText, 
  Sparkles,
  CheckCircle,
  Activity,
  Sliders,
  Share2,
  Clock,
  Square,
  Eye,
  SlidersHorizontal,
  Globe,
  Search,
  Camera as CameraIcon,
  FolderArchive,
  Award,
  History as HistoryIcon,
  Trash2,
  Layers,
  QrCode,
  FlaskConical,
  Sun,
  Moon
} from 'lucide-react';
import { Share } from '@capacitor/share';
import { Toast } from '@capacitor/toast';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { analyzeImageTexture, calculateExtractionMetrics, TextureAnalysis } from './algorithms/utils';
import { translations, Language } from './i18n/translations';
import { isAdvancedSelection, hasAdvancedQuota, recordAdvancedUse, remainingAdvancedQuota, setSubscribed } from './utils/entitlement';
import { purchasePlan, restorePurchases, syncSubscription, Plan } from './utils/purchase';
import PaywallModal from './components/PaywallModal';
import { createZip, ZipEntry } from './utils/zip';
import { generateCertificateCard, CertificateData } from './utils/certificate';
import { runAllAutomatedDiagnostics, TestCaseResult } from './utils/selfTest';
import DiagnosticModal from './components/DiagnosticModal';

// Vite inlined worker import
import WatermarkWorker from './workers/watermark.worker?worker&inline';

// Interactive Split-Screen Image Comparison Slider Component
function ImageCompareSlider({ originalUrl, watermarkedUrl, leftLabel, rightLabel }: { originalUrl: string; watermarkedUrl: string; leftLabel: string; rightLabel: string }) {
  const [sliderPos, setSliderPos] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleMove = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    let pos = (x / rect.width) * 100;
    if (pos < 0) pos = 0;
    if (pos > 100) pos = 100;
    setSliderPos(pos);
  };

  const onMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    handleMove(e.clientX);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    isDragging.current = true;
    handleMove(e.touches[0].clientX);
  };

  useEffect(() => {
    const onMouseUp = () => { isDragging.current = false; };
    const onMouseMove = (e: MouseEvent) => {
      if (isDragging.current) handleMove(e.clientX);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (isDragging.current && e.touches[0]) handleMove(e.touches[0].clientX);
    };

    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('touchend', onMouseUp);
    window.addEventListener('touchmove', onTouchMove);

    return () => {
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('touchend', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  return (
    <div 
      ref={containerRef}
      className="compare-slider-container"
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
    >
      <span className="compare-badge left">{leftLabel}</span>
      <span className="compare-badge right">{rightLabel}</span>

      <img src={originalUrl} className="compare-img-left" alt="Original" />

      <div className="compare-right-wrapper" style={{ width: `${100 - sliderPos}%` }}>
        <img src={watermarkedUrl} className="compare-img-right" alt="Watermarked" />
      </div>

      <div className="compare-splitter-bar" style={{ left: `${sliderPos}%` }}>
        <div className="compare-splitter-handle">↔</div>
      </div>
    </div>
  );
}

// Algorithms metadata
const ALGORITHMS = [
  {
    id: 'dct',
    nameKey: 'algoDctName',
    badgeKey: 'algoDctBadge',
    badgeType: 'robust',
    descKey: 'algoDctDesc',
    defaultStrength: 25,
    minStrength: 10,
    maxStrength: 60
  },
  {
    id: 'chroma',
    nameKey: 'algoChromaName',
    badgeKey: 'algoChromaBadge',
    badgeType: 'capacity',
    descKey: 'algoChromaDesc',
    defaultStrength: 35,
    minStrength: 15,
    maxStrength: 80
  },
  {
    id: 'dft',
    nameKey: 'algoDftName',
    badgeKey: 'algoDftBadge',
    badgeType: 'robust',
    descKey: 'algoDftDesc',
    defaultStrength: 30,
    minStrength: 10,
    maxStrength: 80
  },
  {
    id: 'dwt',
    nameKey: 'algoDwtName',
    badgeKey: 'algoDwtBadge',
    badgeType: 'robust',
    descKey: 'algoDwtDesc',
    defaultStrength: 25,
    minStrength: 10,
    maxStrength: 60
  },
  {
    id: 'dsss',
    nameKey: 'algoDsssName',
    badgeKey: 'algoDsssBadge',
    badgeType: 'robust',
    descKey: 'algoDsssDesc',
    defaultStrength: 8,
    minStrength: 2,
    maxStrength: 25
  },
  {
    id: 'lsb',
    nameKey: 'algoLsbName',
    badgeKey: 'algoLsbBadge',
    badgeType: 'capacity',
    descKey: 'algoLsbDesc',
    defaultStrength: 5,
    minStrength: 1,
    maxStrength: 15
  }
] as const;

const TAB_HINTS = {
  embed: 'tabEmbedDesc',
  extract: 'tabExtractDesc',
  simulator: 'tabSimulatorDesc',
  history: 'tabHistoryDesc',
  help: 'tabHelpDesc'
} as const;

export interface HistoryRecord {
  id: string;
  type: 'embed' | 'extract';
  timestamp: string;
  payload: string;
  algorithms: string[];
  imgUrl?: string;
  confidence?: string;
}

export interface BatchItem {
  id: string;
  name: string;
  origUrl: string;
  status: 'waiting' | 'processing' | 'done' | 'error';
  resultUrl?: string;
}

const StepTitle = ({ n, children }: { n: string; children: React.ReactNode }) => (
  <div className="step-title">
    <span className="step-num">{n}</span>
    <span>{children}</span>
  </div>
);

export default function App() {
  const [activeTab, setActiveTab] = useState<'embed' | 'extract' | 'simulator' | 'history' | 'help'>('embed');
  
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (typeof localStorage !== 'undefined' && localStorage.getItem('hw-theme') === 'dark' ? 'dark' : 'light'));
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('hw-theme', theme);
  }, [theme]);

  // i18n Language State (Auto-detect browser/system language)
  const [lang, setLang] = useState<Language>(() => {
    return typeof navigator !== 'undefined' && navigator.language.startsWith('zh') ? 'zh' : 'en';
  });

  const t = (key: keyof typeof translations['zh'], vars?: Record<string, string | number>) => {
    let text: string = translations[lang][key] || translations['zh'][key] || key;
    if (vars) for (const name in vars) text = text.split(`{${name}}`).join(String(vars[name]));
    return text;
  };
  
  // Multiple algorithms selection
  const [selectedAlgos, setSelectedAlgos] = useState<string[]>(['dct']);
  
  // Payload Configuration
  const [payloadType, setPayloadType] = useState<'text' | 'logo'>('text');
  const [watermarkText, setWatermarkText] = useState('Secure Watermark 2026');
  const [logoImgUrl, setLogoImgUrl] = useState<string | null>(null);
  const [securityKey, setSecurityKey] = useState('antigravity_safe');
  const [strength, setStrength] = useState(25);

  // Single vs Batch Mode
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchFiles, setBatchFiles] = useState<BatchItem[]>([]);
  const batchInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Images state
  const [sourceImgUrl, setSourceImgUrl] = useState<string | null>(null);
  const [watermarkedImgUrl, setWatermarkedImgUrl] = useState<string | null>(null);
  const [imageMeta, setImageMeta] = useState<{ origW: number; origH: number; procW: number; procH: number } | null>(null);
  const [textureAnalysis, setTextureAnalysis] = useState<TextureAnalysis | null>(null);
  const [showCompareSlider, setShowCompareSlider] = useState(true);
  
  // Extraction results mapping: { [algoId]: extractedText }
  const [extractionResults, setExtractionResults] = useState<Record<string, string>>({});

  // Robustness Simulator state
  const [simCrop, setSimCrop] = useState(false);
  const [simCropPct, setSimCropPct] = useState(20);
  const [simJpeg, setSimJpeg] = useState(false);
  const [simJpegQual, setSimJpegQual] = useState(40);
  const [simNoise, setSimNoise] = useState(false);
  const [simNoiseLevel, setSimNoiseLevel] = useState(15);
  const [simMask, setSimMask] = useState(false);
  const [simMaskPct, setSimMaskPct] = useState(25);
  const [simGray, setSimGray] = useState(false);
  const [simResize, setSimResize] = useState(false);
  const [simWebp, setSimWebp] = useState(false);
  const [simResultImgUrl, setSimResultImgUrl] = useState<string | null>(null);
  const [simResults, setSimResults] = useState<Record<string, string>>({});

  // Processing & progress indicators
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [progressInfo, setProgressInfo] = useState<{ step: number; total: number; algo: string } | null>(null);

  // Modals & History
  const [showForensicModal, setShowForensicModal] = useState(false);
  const [showCertModal, setShowCertModal] = useState(false);
  const [certImgUrl, setCertImgUrl] = useState<string | null>(null);

  // Automated Diagnostic Self-Test State
  const [showDiagnosticModal, setShowDiagnosticModal] = useState(false);
  const [diagnosticRunning, setDiagnosticRunning] = useState(false);
  const [diagnosticResults, setDiagnosticResults] = useState<TestCaseResult[]>([]);
  const [diagnosticProgress, setDiagnosticProgress] = useState({ current: 0, total: 11, currentName: '' });

  const handleRunDiagnosticSelfTest = async () => {
    setShowDiagnosticModal(true);
    setDiagnosticRunning(true);
    setDiagnosticResults([]);
    setDiagnosticProgress({ current: 0, total: 11, currentName: t('selfTestStarting') });

    try {
      const results = await runAllAutomatedDiagnostics(t, (current, total, currentName) => {
        setDiagnosticProgress({ current, total, currentName });
      });
      setDiagnosticResults(results);
      const passedCount = results.filter(r => r.status === 'pass').length;
      showToast(t('selfTestDone', { p: passedCount, n: results.length, pct: Math.round((passedCount / results.length) * 100) }), passedCount === results.length ? 'success' : 'error');
    } catch (err: any) {
      showToast(`${t('selfTestError')}: ${err.message}`, 'error');
    } finally {
      setDiagnosticRunning(false);
    }
  };
  
  const [historyList, setHistoryList] = useState<HistoryRecord[]>(() => {
    try {
      const saved = localStorage.getItem('hw_history_records_v1');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const addHistoryRecord = (record: Omit<HistoryRecord, 'id' | 'timestamp'>) => {
    const newRecord: HistoryRecord = {
      ...record,
      id: `REC-${Date.now().toString(36).toUpperCase()}`,
      timestamp: new Date().toLocaleString()
    };
    setHistoryList(prev => {
      const updated = [newRecord, ...prev.slice(0, 19)];
      try { localStorage.setItem('hw_history_records_v1', JSON.stringify(updated)); } catch {}
      return updated;
    });
  };

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const extractInputRef = useRef<HTMLInputElement>(null);

  // Toggle algorithm selection (multi-select)
  const handleToggleAlgo = (algoId: string) => {
    setSelectedAlgos(prev => {
      if (prev.includes(algoId)) {
        // Keep at least one algorithm selected
        if (prev.length === 1) return prev;
        return prev.filter(id => id !== algoId);
      } else {
        return [...prev, algoId];
      }
    });
  };

  // Exhaustive Extract: Automatically tests all 6 algorithms
  const [showPaywall, setShowPaywall] = useState(false);

  // The store is the source of truth for subscriptions on native iOS
  useEffect(() => {
    syncSubscription().then(pro => { if (pro !== null) setSubscribed(pro); }).catch(() => undefined);
  }, []);

  // Gate an advanced operation: allowed with quota or subscription, otherwise shows the paywall
  const requireAdvanced = (): boolean => {
    if (hasAdvancedQuota()) return true;
    setShowPaywall(true);
    return false;
  };

  const handlePurchase = async (plan: Plan) => {
    try {
      const ok = await purchasePlan(plan);
      if (ok) { setSubscribed(true); setShowPaywall(false); showToast(t('paywallSubscribed'), 'success'); }
    } catch {
      showToast(t('paywallNotConnected'), 'error');
    }
  };

  const handleRestore = async () => {
    try {
      const ok = await restorePurchases();
      if (ok) { setSubscribed(true); setShowPaywall(false); showToast(t('paywallSubscribed'), 'success'); }
      else showToast(t('paywallNoPurchase'), 'info');
    } catch {
      showToast(t('paywallNotConnected'), 'error');
    }
  };

  const handleExhaustiveExtract = async () => {
    if (!watermarkedImgUrl) return;
    const allAlgoIds = ALGORITHMS.map(a => a.id);
    setSelectedAlgos(allAlgoIds);
    
    if (!securityKey) {
      showToast(t('keyWarnToast'), 'info');
    }

    setIsProcessing(true);
    setProgressInfo({ step: 0, total: allAlgoIds.length, algo: t('startingExhaustive') });
    setStatusMsg(t('exhaustiveStatus'));

    try {
      const imgData = await getImageDataFromUrl(watermarkedImgUrl);
      const res = await runWorkerTask(
        {
          type: 'extract',
          pixels: imgData.data.buffer,
          width: imgData.width,
          height: imgData.height,
          key: securityKey,
          algorithms: allAlgoIds,
          strength
        },
        (p) => {
          const algoObj = ALGORITHMS.find(a => a.id === p.algo);
          setProgressInfo({
            step: p.step,
            total: p.total,
            algo: algoObj ? algoObj.id.toUpperCase() : p.algo
          });
        }
      );

      setExtractionResults(res.results);
      showToast(t('exhaustiveComplete'), 'success');
      setStatusMsg(t('exhaustiveDoneStatus'));
      setTimeout(() => setStatusMsg(''), 2000);
    } catch (err: any) {
      showToast(`${t('exhaustiveFail')}: ${err.message}`, 'error');
      setStatusMsg('');
    } finally {
      setIsProcessing(false);
      setProgressInfo(null);
    }
  };

  // Quick Preset Mode: General (1 algo), Complex (3 algos), Ultimate (5 algos)
  const applyPresetMode = (mode: 'general' | 'complex' | 'ultimate') => {
    if (mode === 'general') {
      setSelectedAlgos(['dct']);
      setStrength(20);
      showToast(t('appliedGeneral'), 'info');
    } else if (mode === 'complex') {
      setSelectedAlgos(['dct', 'chroma', 'dwt']);
      setStrength(30);
      showToast(t('appliedComplex'), 'info');
    } else if (mode === 'ultimate') {
      setSelectedAlgos(['dct', 'chroma', 'dwt', 'dft', 'dsss']);
      setStrength(40);
      showToast(t('appliedUltimate'), 'success');
    }
  };

  // Utility: Show non-blocking Toast notification
  const showToast = async (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    try {
      await Toast.show({
        text: message,
        duration: 'short',
        position: 'bottom'
      });
    } catch (e) {
      // Ignore web fallback error
    }
    setTimeout(() => setToast(null), 3500);
  };

  // Utility: Run background task in Web Worker to prevent UI blocking with real-time progress callbacks
  const runWorkerTask = (data: any, onProgress?: (progressData: any) => void): Promise<any> => {
    return new Promise((resolve, reject) => {
      try {
        const worker = new WatermarkWorker();
        worker.onmessage = (e: MessageEvent) => {
          if (e.data.type === 'progress' && onProgress) {
            onProgress(e.data);
            return;
          }
          if (e.data.success) {
            resolve(e.data);
          } else {
            reject(new Error(e.data.error));
          }
          worker.terminate();
        };
        worker.onerror = (err: ErrorEvent | Event) => {
          reject(err);
          worker.terminate();
        };
        worker.postMessage(data);
      } catch (err) {
        reject(err);
      }
    });
  };

  // Utility: Extract ImageData from Image URL with automatic size limiting (max 1024px) & texture analysis
  const getImageDataFromUrl = (url: string): Promise<ImageData> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const origW = img.naturalWidth;
        const origH = img.naturalHeight;
        const MAX_SIZE = 1024;
        let width = origW;
        let height = origH;

        // Perform proportional downscaling to prevent out-of-memory errors on high-res camera photos
        if (width > MAX_SIZE || height > MAX_SIZE) {
          if (width > height) {
            height = Math.round((height * MAX_SIZE) / width);
            width = MAX_SIZE;
          } else {
            width = Math.round((width * MAX_SIZE) / height);
            height = MAX_SIZE;
          }
        }

        setImageMeta({ origW, origH, procW: width, procH: height });

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Cannot create Canvas 2D context'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const imgData = ctx.getImageData(0, 0, width, height);
        
        // Run smart texture analysis for strength recommendation
        try {
          const analysis = analyzeImageTexture(imgData);
          setTextureAnalysis(analysis);
        } catch (e) {
          console.warn('Texture analysis error:', e);
        }

        resolve(imgData);
      };
      img.onerror = () => reject(new Error('Image failed to load or decode; check the file format'));
      img.src = url;
    });
  };

  // One-click timestamp signature generator
  const generateTimestampSignature = () => {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 16).replace('T', ' ');
    const randomHash = Math.random().toString(36).substring(2, 8).toUpperCase();
    setWatermarkText(`[AUTH] ${dateStr} | Hash:${randomHash}`);
    showToast(t('timestampInserted'), 'success');
  };

  // Utility: Convert ImageData to Base64 URL
  const imageDataToUrl = (imageData: ImageData): string => {
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  };

  // Native share / save handler
  const handleShareOrSave = async () => {
    if (!watermarkedImgUrl) return;
    try {
      const canShare = await Share.canShare();
      if (canShare.value) {
        await Share.share({
          title: t('shareTitle'),
          text: t('shareText'),
          url: watermarkedImgUrl,
          dialogTitle: t('shareDialogTitle')
        });
        showToast(t('shareOpened'), 'success');
        return;
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.warn('Share API non-native or cancelled', e);
      }
    }

    // Fallback: Trigger standard download link
    const link = document.createElement('a');
    link.href = watermarkedImgUrl;
    link.download = `watermarked_multi_${Date.now()}.png`;
    link.click();
    showToast(t('downloadTriggered'), 'success');
  };

  // Native Camera Capture
  const handleCameraCapture = async () => {
    try {
      const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera
      });
      if (photo.dataUrl) {
        setSourceImgUrl(photo.dataUrl);
        setWatermarkedImgUrl(null);
        const img = new Image();
        img.src = photo.dataUrl;
        await new Promise(r => { img.onload = r; });
        setImageMeta({ origW: img.naturalWidth, origH: img.naturalHeight, procW: Math.min(1024, img.naturalWidth), procH: Math.min(1024, img.naturalHeight) });
        showToast(t('cameraLoaded'), 'success');
      }
    } catch (err: any) {
      if (!err.message?.includes('cancelled') && !err.message?.includes('User cancelled')) {
        fileInputRef.current?.click();
      }
    }
  };

  // Logo upload & 32x32 binarizer
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result as string;
      setLogoImgUrl(url);

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, 32, 32);
        const imgData = ctx.getImageData(0, 0, 32, 32);
        let bits = '[LOGO:32]';
        for (let i = 0; i < imgData.data.length; i += 4) {
          const avg = (imgData.data[i] + imgData.data[i+1] + imgData.data[i+2]) / 3;
          bits += avg > 128 ? '1' : '0';
        }
        setWatermarkText(bits);
        showToast(t('stampConverted'), 'success');
      };
      img.src = url;
    };
    reader.readAsDataURL(file);
  };

  // Batch Image Upload
  const handleBatchUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const url = ev.target?.result as string;
        setBatchFiles(prev => [...prev, {
          id: `BATCH-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 5)}`,
          name: file.name,
          origUrl: url,
          status: 'waiting'
        }]);
      };
      reader.readAsDataURL(file);
    });
    showToast(t('batchQueued', { n: files.length }), 'info');
  };

  // Sequential Batch Embedding Queue
  const handleBatchEmbed = async () => {
    if (batchFiles.length === 0) return;
    if (!requireAdvanced()) return;
    setIsProcessing(true);
    setStatusMsg(t('batchStatus'));

    for (let i = 0; i < batchFiles.length; i++) {
      const item = batchFiles[i];
      setBatchFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'processing' } : f));
      setProgressInfo({ step: i + 1, total: batchFiles.length, algo: item.name });

      try {
        const imgData = await getImageDataFromUrl(item.origUrl);
        const res = await runWorkerTask({
          type: 'embed',
          pixels: imgData.data.buffer,
          width: imgData.width,
          height: imgData.height,
          text: watermarkText,
          key: securityKey,
          algorithms: selectedAlgos,
          strength
        });

        const canvas = document.createElement('canvas');
        canvas.width = imgData.width;
        canvas.height = imgData.height;
        const ctx = canvas.getContext('2d')!;
        const outImgData = new ImageData(new Uint8ClampedArray(res.pixels), imgData.width, imgData.height);
        ctx.putImageData(outImgData, 0, 0);
        const resultUrl = canvas.toDataURL('image/png');

        setBatchFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'done', resultUrl } : f));
      } catch {
        setBatchFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'error' } : f));
      }
    }

    setIsProcessing(false);
    setProgressInfo(null);
    setStatusMsg('');
    recordAdvancedUse();
    showToast(t('batchSuccessToast'), 'success');
    addHistoryRecord({
      type: 'embed',
      payload: watermarkText,
      algorithms: selectedAlgos
    });
  };

  // Download all batch watermarked photos as ZIP
  const handleDownloadBatchZip = async () => {
    const completed = batchFiles.filter(f => f.status === 'done' && f.resultUrl);
    if (completed.length === 0) {
      showToast(t('batchNone'), 'error');
      return;
    }

    const zipEntries: ZipEntry[] = [];
    for (const item of completed) {
      const base64Data = item.resultUrl!.split(',')[1];
      const binary = atob(base64Data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const safeName = item.name.replace(/\.[^/.]+$/, "") + "_watermarked.png";
      zipEntries.push({ name: safeName, data: bytes });
    }

    const zipBlob = createZip(zipEntries);
    const zipUrl = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = zipUrl;
    a.download = `watermarked_batch_${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(zipUrl);
    showToast(t('zipDone'), 'success');
  };

  // Generate Digital Copyright Certificate Card
  const handleGenerateCertificate = async () => {
    if (!watermarkedImgUrl) return;
    if (!requireAdvanced()) return;
    try {
      showToast(t('certGenerating'), 'info');
      const firstAlgo = selectedAlgos[0] || 'dct';
      const firstResult = extractionResults[firstAlgo] || watermarkText;
      const metrics = calculateExtractionMetrics(firstResult, watermarkText);

      const certUrl = await generateCertificateCard({
        certId: `AUTH-${Date.now().toString(36).toUpperCase()}`,
        thumbnailUrl: watermarkedImgUrl,
        extractedPayload: firstResult,
        algorithms: selectedAlgos.map(id => id.toUpperCase()),
        confidenceScore: t(metrics.badgeKey, { s: metrics.similarity, b: metrics.ber }),
        berScore: metrics.ber.toFixed(3),
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        securityKeyHash: securityKey ? Array.from(securityKey).reduce((acc, char) => ((acc << 5) - acc) + char.charCodeAt(0), 0).toString(16).toUpperCase() : 'DEFAULT_NONE',
        language: lang
      });

      setCertImgUrl(certUrl);
      recordAdvancedUse();
      setShowCertModal(true);
    } catch (err: any) {
      showToast(`${t('certFailed')}: ${err.message}`, 'error');
    }
  };

  // Image upload handler
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, target: 'source' | 'extract') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target?.result as string;
      if (target === 'source') {
        setSourceImgUrl(url);
        setWatermarkedImgUrl(null);
        showToast(t('imageLoadedExtract'), 'info');
      } else {
        setWatermarkedImgUrl(url);
        setExtractionResults({});
        showToast(t('detectImageLoaded'), 'info');
      }
    };
    reader.onerror = () => {
      showToast(t('readFileFailed'), 'error');
    };
    reader.readAsDataURL(file);
  };

  // Core action: Embed Watermark (Sequentially embeds all selected algorithms with live progress)
  const handleEmbed = async () => {
    if (!sourceImgUrl) return;
    if (selectedAlgos.length === 0) {
      showToast(t('selectOneAlgoEmbed'), 'error');
      return;
    }
    if (isAdvancedSelection(selectedAlgos) && !requireAdvanced()) return;
    setIsProcessing(true);
    setProgressInfo({ step: 0, total: selectedAlgos.length, algo: t('initEngine') });
    setStatusMsg(t('embedStatus', { algos: selectedAlgos.join(' -> ') }));

    try {
      const imgData = await getImageDataFromUrl(sourceImgUrl);
      const res = await runWorkerTask(
        {
          type: 'embed',
          pixels: imgData.data.buffer,
          width: imgData.width,
          height: imgData.height,
          text: watermarkText,
          key: securityKey,
          algorithms: selectedAlgos,
          strength
        },
        (p) => {
          const algoObj = ALGORITHMS.find(a => a.id === p.algo);
          setProgressInfo({
            step: p.step,
            total: p.total,
            algo: algoObj ? algoObj.id.toUpperCase() : p.algo
          });
        }
      );

      const outputImgData = new ImageData(new Uint8ClampedArray(res.pixels), imgData.width, imgData.height);
      const finalUrl = imageDataToUrl(outputImgData);
      setWatermarkedImgUrl(finalUrl);
      if (isAdvancedSelection(selectedAlgos)) recordAdvancedUse();
      showToast(t('embedSuccessToast'), 'success');
      setStatusMsg(t('embedDoneStatus'));
      addHistoryRecord({
        type: 'embed',
        payload: watermarkText,
        algorithms: selectedAlgos,
        imgUrl: finalUrl
      });
      setTimeout(() => setStatusMsg(''), 2000);
    } catch (err: any) {
      showToast(`${t('embedFailed')}: ${err.message}`, 'error');
      setStatusMsg('');
    } finally {
      setIsProcessing(false);
      setProgressInfo(null);
    }
  };

  // Core action: Extract Watermark from all selected algorithms with live progress
  const handleExtract = async () => {
    if (!watermarkedImgUrl) return;
    if (selectedAlgos.length === 0) {
      showToast(t('selectOneAlgoExtract'), 'error');
      return;
    }
    setIsProcessing(true);
    setProgressInfo({ step: 0, total: selectedAlgos.length, algo: t('preparingDetect') });
    setStatusMsg(t('detectStatus'));

    try {
      const imgData = await getImageDataFromUrl(watermarkedImgUrl);
      const res = await runWorkerTask(
        {
          type: 'extract',
          pixels: imgData.data.buffer,
          width: imgData.width,
          height: imgData.height,
          key: securityKey,
          algorithms: selectedAlgos,
          strength
        },
        (p) => {
          const algoObj = ALGORITHMS.find(a => a.id === p.algo);
          setProgressInfo({
            step: p.step,
            total: p.total,
            algo: algoObj ? algoObj.id.toUpperCase() : p.algo
          });
        }
      );

      setExtractionResults(res.results);
      showToast(t('multiDetectDone'), 'success');
      setStatusMsg(t('detectDoneStatus'));
      const firstAlgo = selectedAlgos[0] || 'dct';
      addHistoryRecord({
        type: 'extract',
        payload: res.results[firstAlgo] || t('detectComplete'),
        algorithms: selectedAlgos,
        imgUrl: watermarkedImgUrl
      });
      setTimeout(() => setStatusMsg(''), 2000);
    } catch (err: any) {
      showToast(`${t('detectFailed')}: ${err.message}`, 'error');
      setStatusMsg('');
    } finally {
      setIsProcessing(false);
      setProgressInfo(null);
    }
  };

  // Simulator action: Apply attacks and test extraction
  const handleSimulateAttackAndExtract = async () => {
    if (!watermarkedImgUrl) return;
    setIsProcessing(true);
    setProgressInfo({ step: 0, total: selectedAlgos.length, algo: t('applyingAttack') });
    setStatusMsg(t('attackStatus'));

    try {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = watermarkedImgUrl!;
      });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      // 1. Calculate Crop Attack
      let startX = 0, startY = 0;
      let targetWidth = img.naturalWidth;
      let targetHeight = img.naturalHeight;

      if (simCrop) {
        const cropScale = 1 - simCropPct / 100;
        targetWidth = Math.floor(img.naturalWidth * cropScale);
        targetHeight = Math.floor(img.naturalHeight * cropScale);
        startX = Math.floor((img.naturalWidth - targetWidth) / 2);
        startY = Math.floor((img.naturalHeight - targetHeight) / 2);
      }

      canvas.width = targetWidth;
      canvas.height = targetHeight;

      ctx.drawImage(
        img,
        startX, startY, targetWidth, targetHeight,
        0, 0, targetWidth, targetHeight
      );

      let attackImgData = ctx.getImageData(0, 0, targetWidth, targetHeight);

      // 2. Grayscale Conversion Attack
      if (simGray) {
        const data = attackImgData.data;
        for (let i = 0; i < data.length; i += 4) {
          const y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          data[i] = y;
          data[i + 1] = y;
          data[i + 2] = y;
        }
        ctx.putImageData(attackImgData, 0, 0);
      }

      // 3. Resampling Downscale-Upscale Attack (50% Downsample)
      if (simResize) {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d')!;
        tempCanvas.width = Math.max(64, Math.floor(targetWidth / 2));
        tempCanvas.height = Math.max(64, Math.floor(targetHeight / 2));
        tempCtx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
        
        ctx.clearRect(0, 0, targetWidth, targetHeight);
        ctx.drawImage(tempCanvas, 0, 0, tempCanvas.width, tempCanvas.height, 0, 0, targetWidth, targetHeight);
        attackImgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
      }

      // 4. Add Noise Attack
      if (simNoise) {
        const data = attackImgData.data;
        for (let i = 0; i < data.length; i += 4) {
          const noise = (Math.random() - 0.5) * simNoiseLevel * 2;
          data[i] = Math.max(0, Math.min(255, data[i] + noise));
          data[i+1] = Math.max(0, Math.min(255, data[i+1] + noise));
          data[i+2] = Math.max(0, Math.min(255, data[i+2] + noise));
        }
        ctx.putImageData(attackImgData, 0, 0);
      }

      // 5. Mask / Sticker Blockage Attack
      if (simMask) {
        const maskW = Math.floor(targetWidth * (simMaskPct / 100));
        const maskH = Math.floor(targetHeight * (simMaskPct / 100));
        const maskX = Math.floor((targetWidth - maskW) / 2);
        const maskY = Math.floor((targetHeight - maskH) / 2);

        ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
        ctx.fillRect(maskX, maskY, maskW, maskH);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.strokeRect(maskX, maskY, maskW, maskH);
        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(t('maskLabel'), maskX + maskW / 2, maskY + maskH / 2 + 5);
        attackImgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
      }

      // 6. Format Conversion (WebP vs JPEG vs PNG)
      let finalImgUrl = '';
      if (simWebp) {
        finalImgUrl = canvas.toDataURL('image/webp', 0.4);
      } else if (simJpeg) {
        finalImgUrl = canvas.toDataURL('image/jpeg', simJpegQual / 100);
      } else {
        finalImgUrl = canvas.toDataURL('image/png');
      }

      setSimResultImgUrl(finalImgUrl);
      setStatusMsg(t('attackedGenerated'));

      // 4. Extract from Attacked Image
      const attackedData = await getImageDataFromUrl(finalImgUrl);
      const res = await runWorkerTask(
        {
          type: 'extract',
          pixels: attackedData.data.buffer,
          width: attackedData.width,
          height: attackedData.height,
          key: securityKey,
          algorithms: selectedAlgos,
          strength
        },
        (p) => {
          const algoObj = ALGORITHMS.find(a => a.id === p.algo);
          setProgressInfo({
            step: p.step,
            total: p.total,
            algo: algoObj ? algoObj.id.toUpperCase() : p.algo
          });
        }
      );

      setSimResults(res.results);
      showToast(t('attackDone'), 'success');
      setStatusMsg(t('attackDoneStatus'));
      setTimeout(() => setStatusMsg(''), 2000);
    } catch (err: any) {
      showToast(`${t('attackFailed')}: ${err.message}`, 'error');
      setStatusMsg('');
    } finally {
      setIsProcessing(false);
      setProgressInfo(null);
    }
  };

  return (
    <div className="min-content">
      {/* App Header */}
      <header className="topbar">
        <div className="brand">
          <div className="brand-logo"><Shield size={20} /></div>
          <span className="brand-tag">DEFENSE · WATERMARK</span>
        </div>
        <div className="chip-group">
          <button className="icon-btn" onClick={handleRunDiagnosticSelfTest} title={t('runSelfTestBtn')} aria-label={t('runSelfTestBtn')}>
            <FlaskConical size={17} />
          </button>
          <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title={t('themeToggle')} aria-label={t('themeToggle')}>
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button
            className="chip-btn"
            onClick={() => {
              const nextLang = lang === 'zh' ? 'en' : 'zh';
              setLang(nextLang);
              showToast(translations[nextLang].langSwitched, 'info');
            }}
          >
            <Globe size={14} />
            <span>{t('langToggle')}</span>
          </button>
        </div>
      </header>

      <section className="hero">
        <h1 className="hero-title">{t('appTitle')}</h1>
        <p className="hero-sub">{t('appSubtitle')}</p>
      </section>

      {/* Tabs Navigation */}
      <nav className="tabs-navigation">
        <button className={`tab-btn ${activeTab === 'embed' ? 'active' : ''}`} onClick={() => setActiveTab('embed')}>
          <Sparkles size={20} />
          <span>{t('tabEmbed')}</span>
        </button>
        <button className={`tab-btn ${activeTab === 'extract' ? 'active' : ''}`} onClick={() => setActiveTab('extract')}>
          <Unlock size={20} />
          <span>{t('tabExtract')}</span>
        </button>
        <button className={`tab-btn ${activeTab === 'simulator' ? 'active' : ''}`} onClick={() => setActiveTab('simulator')}>
          <Activity size={20} />
          <span>{t('tabSimulator')}</span>
        </button>
        <button className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
          <HistoryIcon size={20} />
          <span>{t('tabHistory')}</span>
        </button>
        <button className={`tab-btn ${activeTab === 'help' ? 'active' : ''}`} onClick={() => setActiveTab('help')}>
          <HelpCircle size={20} />
          <span>{t('tabHelp')}</span>
        </button>
      </nav>

      <p className="tab-hint">{t(TAB_HINTS[activeTab])}</p>

      {/* Dynamic Tabs Content */}
      {activeTab === 'embed' && (
        <div className="glass-container">
          <div className="guide-strip">
            <div className="guide-item"><b>01</b><span>{t('guideStep1')}</span></div>
            <div className="guide-item"><b>02</b><span>{t('guideStep2')}</span></div>
            <div className="guide-item"><b>03</b><span>{t('guideStep3')}</span></div>
          </div>

          <div className="mode-bar">
            <div className="segmented">
              <button className={`segmented-btn ${!isBatchMode ? 'active' : ''}`} onClick={() => setIsBatchMode(false)}>
                <ImageIcon size={14} />
                <span>{t('singleMode')}</span>
              </button>
              <button className={`segmented-btn ${isBatchMode ? 'active' : ''}`} onClick={() => setIsBatchMode(true)}>
                <FolderArchive size={14} />
                <span>{t('batchMode')}</span>
              </button>
            </div>
            <button className="chip-btn" onClick={handleCameraCapture}>
              <CameraIcon size={14} />
              <span>{t('cameraShotBtn')}</span>
            </button>
          </div>

          {/* Single Mode Upload vs Batch Mode Upload */}
          {!isBatchMode ? (
            <div className="form-group">
              <StepTitle n="01">{t('uploadSourceTitle')}</StepTitle>
              {!sourceImgUrl ? (
                <div className="upload-zone" onClick={() => fileInputRef.current?.click()}>
                  <ImageIcon size={40} className="upload-icon" />
                  <span className="upload-text">{t('uploadClickText')}</span>
                  <span className="upload-hint">{t('uploadHintText')}</span>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    style={{ display: 'none' }} 
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, 'source')}
                  />
                </div>
              ) : (
                <div>
                  <div className="preview-container">
                    <img src={sourceImgUrl} className="preview-img" alt="Source" />
                    <button className="remove-btn" onClick={() => { setSourceImgUrl(null); setTextureAnalysis(null); }}>×</button>
                  </div>
                  {imageMeta && (
                    <div style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ background: 'var(--border)', padding: '3px 10px', borderRadius: '6px' }}>
                        {t('origSize')}: {imageMeta.origW} × {imageMeta.origH}
                      </span>
                      {imageMeta.origW !== imageMeta.procW && (
                        <span style={{ background: 'rgba(99, 102, 241, 0.2)', color: 'var(--accent-text)', padding: '3px 10px', borderRadius: '6px', fontWeight: '600' }}>
                          {t('optimizedSize')}: {imageMeta.procW} × {imageMeta.procH} ({t('memOverflowGuard')})
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label className="form-label" style={{ margin: 0 }}>{t('batchTitle')}</label>
                {batchFiles.length > 0 && (
                  <button
                    onClick={() => setBatchFiles([])}
                    style={{ background: 'none', border: 'none', color: 'var(--err-text)', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Trash2 size={12} />
                    <span>{t('clearQueue')}</span>
                  </button>
                )}
              </div>

              <div 
                className="upload-zone" 
                onClick={() => batchInputRef.current?.click()}
                style={{ padding: '24px 16px', marginBottom: '12px' }}
              >
                <FolderArchive size={36} className="upload-icon" style={{ color: 'var(--accent-text)' }} />
                <span className="upload-text">{t('batchUploadClick')}</span>
                <span className="upload-hint">{t('batchHint')}</span>
                <input 
                  type="file" 
                  ref={batchInputRef} 
                  style={{ display: 'none' }} 
                  accept="image/*" 
                  multiple 
                  onChange={handleBatchUpload}
                />
              </div>

              {batchFiles.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '240px', overflowY: 'auto' }}>
                  {batchFiles.map((file, idx) => (
                    <div 
                      key={file.id} 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between', 
                        background: 'var(--sunken)', 
                        padding: '8px 12px', 
                        borderRadius: '8px',
                        border: '1px solid var(--border)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <img src={file.origUrl} style={{ width: '36px', height: '36px', objectFit: 'cover', borderRadius: '4px' }} alt="" />
                        <div style={{ fontSize: '0.8rem', color: 'var(--text)', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {file.name}
                        </div>
                      </div>
                      <div>
                        {file.status === 'waiting' && <span style={{ fontSize: '0.7rem', color: 'var(--muted)', background: 'var(--border)', padding: '2px 8px', borderRadius: '4px' }}>{t('batchStatusWaiting')}</span>}
                        {file.status === 'processing' && <span style={{ fontSize: '0.7rem', color: 'var(--accent-text)', background: 'rgba(99, 102, 241, 0.2)', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>{t('batchStatusProcessing')}...</span>}
                        {file.status === 'done' && <span style={{ fontSize: '0.7rem', color: 'var(--ok-text)', background: 'rgba(16, 185, 129, 0.2)', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>✓ {t('batchStatusDone')}</span>}
                        {file.status === 'error' && <span style={{ fontSize: '0.7rem', color: 'var(--err-text)', background: 'rgba(239, 68, 68, 0.2)', padding: '2px 8px', borderRadius: '4px' }}>{t('statusFailed')}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {batchFiles.length > 0 && (
                <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                  <button
                    className="btn-primary"
                    onClick={handleBatchEmbed}
                    disabled={isProcessing}
                    style={{ flex: 1 }}
                  >
                    {isProcessing ? <div className="spinner" /> : <Shield size={18} />}
                    <span>{t('batchProcessBtn')} ({batchFiles.length})</span>
                  </button>
                  {batchFiles.some(f => f.status === 'done') && (
                    <button
                      className="btn-primary"
                      onClick={handleDownloadBatchZip}
                      style={{ flex: 1.2, background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}
                    >
                      <Download size={18} />
                      <span>{t('batchDownloadZip')}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="form-group">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
              <StepTitle n="02">{t('selectAlgoTitle')}</StepTitle>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button 
                  onClick={() => applyPresetMode('general')}
                  style={{
                    background: selectedAlgos.length === 1 && selectedAlgos[0] === 'dct' ? '#6366f1' : 'var(--fill)',
                    color: selectedAlgos.length === 1 && selectedAlgos[0] === 'dct' ? '#ffffff' : 'var(--text)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    padding: '4px 10px',
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  {t('presetGeneral')}
                </button>
                <button 
                  onClick={() => applyPresetMode('complex')}
                  style={{
                    background: selectedAlgos.length === 3 && selectedAlgos.includes('dwt') ? '#8b5cf6' : 'var(--fill)',
                    color: selectedAlgos.length === 3 && selectedAlgos.includes('dwt') ? '#ffffff' : 'var(--text)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    padding: '4px 10px',
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  {t('presetComplex')}
                </button>
                <button 
                  onClick={() => applyPresetMode('ultimate')}
                  style={{
                    background: selectedAlgos.length === 5 ? 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)' : 'var(--fill)',
                    color: selectedAlgos.length === 5 ? '#ffffff' : 'var(--text)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    padding: '4px 10px',
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    boxShadow: selectedAlgos.length === 5 ? '0 0 12px rgba(236, 72, 153, 0.4)' : 'none'
                  }}
                >
                  {t('presetUltimate')}
                </button>
              </div>
            </div>
            <div className="algo-grid">
              {ALGORITHMS.map((algo) => {
                const isSelected = selectedAlgos.includes(algo.id);
                return (
                  <div 
                    key={algo.id}
                    className={`algo-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleToggleAlgo(algo.id)}
                  >
                    <input 
                      type="checkbox" 
                      className="algo-radio"
                      style={{ borderRadius: '4px' }}
                      checked={isSelected}
                      readOnly
                    />
                    <div className="algo-info">
                      <div className="algo-name">
                        {t(algo.nameKey)}
                        <span className={`algo-badge ${algo.badgeType}`}>{t(algo.badgeKey)}</span>
                      </div>
                      <div className="algo-desc">{t(algo.descKey)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="form-group">
            <StepTitle n="03">{t('paramConfigTitle')}</StepTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Payload Type Selector */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setPayloadType('text')}
                  style={{
                    flex: 1,
                    background: payloadType === 'text' ? 'rgba(99, 102, 241, 0.25)' : 'var(--fill)',
                    color: payloadType === 'text' ? 'var(--accent-text)' : 'var(--muted)',
                    border: `1px solid ${payloadType === 'text' ? '#6366f1' : 'var(--border)'}`,
                    borderRadius: '6px',
                    padding: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {t('textPayload')}
                </button>
                <button
                  onClick={() => setPayloadType('logo')}
                  style={{
                    flex: 1,
                    background: payloadType === 'logo' ? 'rgba(236, 72, 153, 0.25)' : 'var(--fill)',
                    color: payloadType === 'logo' ? '#f472b6' : 'var(--muted)',
                    border: `1px solid ${payloadType === 'logo' ? '#ec4899' : 'var(--border)'}`,
                    borderRadius: '6px',
                    padding: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {t('logoPayload')}
                </button>
              </div>

              {payloadType === 'text' ? (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: 0 }}>{t('payloadLabel')}</label>
                    <button 
                      onClick={generateTimestampSignature}
                      style={{
                        background: 'rgba(99, 102, 241, 0.15)',
                        color: 'var(--accent-text)',
                        border: '1px solid rgba(99, 102, 241, 0.3)',
                        borderRadius: '4px',
                        padding: '2px 8px',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Clock size={12} />
                      <span>{t('timestampBtn')}</span>
                    </button>
                  </div>
                  <input 
                    type="text" 
                    className="input-text" 
                    value={watermarkText} 
                    onChange={(e) => setWatermarkText(e.target.value)} 
                    placeholder={t('watermarkPlaceholder')}
                  />
                </div>
              ) : (
                <div>
                  <label className="form-label" style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '4px' }}>{t('uploadLogoLabel')}</label>
                  <div 
                    onClick={() => logoInputRef.current?.click()}
                    style={{
                      border: '1px dashed rgba(236, 72, 153, 0.4)',
                      background: 'rgba(236, 72, 153, 0.05)',
                      borderRadius: '8px',
                      padding: '12px',
                      textAlign: 'center',
                      cursor: 'pointer'
                    }}
                  >
                    {logoImgUrl ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                        <img src={logoImgUrl} style={{ width: '48px', height: '48px', objectFit: 'contain', background: '#ffffff', borderRadius: '4px', padding: '2px' }} alt="Logo" />
                        <span style={{ fontSize: '0.8rem', color: '#f472b6', fontWeight: 700 }}>{t('stampReady')}</span>
                      </div>
                    ) : (
                      <div style={{ color: 'var(--text-2)', fontSize: '0.8rem' }}>
                        <QrCode size={24} style={{ color: '#ec4899', margin: '0 auto 4px auto', display: 'block' }} />
                        <span>{t('uploadLogoClick')}</span>
                      </div>
                    )}
                    <input type="file" ref={logoInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleLogoUpload} />
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="form-label" style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{t('secretKeyLabel')}</label>
                  <input 
                    type="text" 
                    className="input-text" 
                    value={securityKey} 
                    onChange={(e) => setSecurityKey(e.target.value)} 
                    placeholder={t('keyPlaceholder')}
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                    {t('strengthLabel')}: {strength}
                  </label>
                  <div className="slider-container" style={{ height: '50px' }}>
                    <input 
                      type="range" 
                      className="range-slider" 
                      min="5" 
                      max="80" 
                      value={strength} 
                      onChange={(e) => setStrength(Number(e.target.value))} 
                    />
                  </div>
                </div>
              </div>

              {/* Texture Analysis & Recommended Strength Banner */}
              {textureAnalysis && !isBatchMode && (
                <div className="texture-banner">
                  <div className="texture-info">
                    <div className="texture-title">
                      <SlidersHorizontal size={14} style={{ color: '#6366f1' }} />
                      <span>{t('textureTitle')}: {textureAnalysis.score}/100 ({textureAnalysis.complexity === 'low' ? t('smooth') : textureAnalysis.complexity === 'medium' ? t('medium') : t('rich')})</span>
                    </div>
                    <div className="texture-desc">{t(textureAnalysis.adviceKey, { s: textureAnalysis.recommendedStrength })}</div>
                  </div>
                  <button 
                    className="btn-apply-strength"
                    onClick={() => {
                      setStrength(textureAnalysis.recommendedStrength);
                      showToast(`${t('applyStrengthToast')}: ${textureAnalysis.recommendedStrength}`, 'success');
                    }}
                  >
                    {t('applyRecStrength')} ({textureAnalysis.recommendedStrength})
                  </button>
                </div>
              )}
            </div>
          </div>

          {!isBatchMode && sourceImgUrl && (
            <button 
              className="btn-primary" 
              onClick={handleEmbed}
              disabled={isProcessing}
            >
              {isProcessing ? <div className="spinner" /> : <Shield size={18} />}
              <span>{isProcessing ? t('embeddingProcessing') : t('startEmbedBtn')}</span>
            </button>
          )}

          {/* Sub-step Progress Bar Overlay */}
          {isProcessing && progressInfo && (
            <div style={{
              marginTop: '16px',
              background: 'var(--surface-2)',
              border: '1px solid rgba(99, 102, 241, 0.4)',
              borderRadius: '12px',
              padding: '14px 16px',
              animation: 'fadeIn 0.2s ease-out'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-2)', marginBottom: '8px' }}>
                <span>{t('processingLabel', { step: progressInfo.step, total: progressInfo.total })} <strong style={{ color: 'var(--accent-text)' }}>{progressInfo.algo}</strong></span>
                <span style={{ fontWeight: '700', color: '#a855f7' }}>{Math.round((progressInfo.step / progressInfo.total) * 100)}%</span>
              </div>
              <div style={{ height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${(progressInfo.step / progressInfo.total) * 100}%`,
                  background: 'linear-gradient(90deg, #6366f1 0%, #a855f7 100%)',
                  transition: 'width 0.3s ease'
                }} />
              </div>
            </div>
          )}

          {!isBatchMode && watermarkedImgUrl && sourceImgUrl && (
            <div className="result-box" style={{ marginTop: '24px' }}>
              <div className="result-header" style={{ color: 'var(--ok-text)', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle size={18} />
                  <span>{t('embedSuccessTitle')}</span>
                </div>
                <button 
                  onClick={() => setShowCompareSlider(!showCompareSlider)}
                  style={{
                    background: 'var(--fill)',
                    color: 'var(--text)',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '4px 10px',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Eye size={14} />
                  <span>{showCompareSlider ? t('singlePreview') : t('splitCompare')}</span>
                </button>
              </div>

              {/* Interactive Split Comparison Slider */}
              {showCompareSlider ? (
                <div style={{ margin: '12px 0' }}>
                  <ImageCompareSlider originalUrl={sourceImgUrl} watermarkedUrl={watermarkedImgUrl} leftLabel={t('compareLeft')} rightLabel={t('compareRight')} />
                  <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--muted)', marginTop: '6px' }}>
                    {t('compareTip')}
                  </div>
                </div>
              ) : (
                <div className="preview-container" style={{ margin: '8px 0' }}>
                  <img src={watermarkedImgUrl} className="preview-img" alt="Watermarked" />
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button 
                  onClick={handleShareOrSave}
                  className="btn-primary" 
                  style={{ flex: 1, background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', boxShadow: '0 4px 20px rgba(16, 185, 129, 0.3)' }}
                >
                  <Share2 size={18} />
                  <span>{t('saveShareBtn')}</span>
                </button>
                <a 
                  href={watermarkedImgUrl} 
                  download={`watermarked_multi_${Date.now()}.png`}
                  className="btn-primary" 
                  style={{ width: '52px', padding: 0, justifyContent: 'center', background: 'var(--fill)' }}
                  title={t('forceDownloadTitle')}
                >
                  <Download size={18} />
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'extract' && (
        <div className="glass-container">
          <div className="form-group">
            <StepTitle n="01">{t('extractConfigTitle')}</StepTitle>
            <div className="extract-config">
              <div>
                <label className="form-label" style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{t('securityKey')}</label>
                <input 
                  type="text" 
                  className="input-text" 
                  value={securityKey} 
                  onChange={(e) => setSecurityKey(e.target.value)} 
                />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
                  <label className="form-label" style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: 0 }}>{t('selectedAlgoLabel')}</label>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button 
                      onClick={() => applyPresetMode('general')}
                      style={{ background: 'var(--border)', color: 'var(--accent-text)', border: 'none', borderRadius: '4px', padding: '2px 6px', fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                      {t('presetGeneralDecrypt')}
                    </button>
                    <button 
                      onClick={() => applyPresetMode('complex')}
                      style={{ background: 'var(--border)', color: '#c084fc', border: 'none', borderRadius: '4px', padding: '2px 6px', fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                      {t('presetComplexDecrypt')}
                    </button>
                    <button 
                      onClick={() => applyPresetMode('ultimate')}
                      style={{ background: 'rgba(236,72,153,0.2)', color: '#f472b6', border: 'none', borderRadius: '4px', padding: '2px 6px', fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                      {t('presetUltimateDecrypt')}
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {ALGORITHMS.map(a => {
                    const isSelected = selectedAlgos.includes(a.id);
                    return (
                      <button
                        key={a.id}
                        onClick={() => handleToggleAlgo(a.id)}
                        style={{
                          background: isSelected ? '#6366f1' : 'var(--fill)',
                          color: isSelected ? '#ffffff' : 'var(--text)',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '6px 10px',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                          fontWeight: '600'
                        }}
                      >
                        {a.id.toUpperCase()}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="form-group">
            <StepTitle n="02">{t('uploadExtractTitle')}</StepTitle>
            {!watermarkedImgUrl ? (
              <div className="upload-zone" onClick={() => extractInputRef.current?.click()}>
                <ImageIcon size={40} className="upload-icon" />
                <span className="upload-text">{t('uploadExtractClickText')}</span>
                <span className="upload-hint">{t('uploadExtractHintText')}</span>
                <input 
                  type="file" 
                  ref={extractInputRef} 
                  style={{ display: 'none' }} 
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e, 'extract')}
                />
              </div>
            ) : (
              <div className="preview-container">
                <img src={watermarkedImgUrl} className="preview-img" alt="To Extract" />
                <button className="remove-btn" onClick={() => setWatermarkedImgUrl(null)}>×</button>
              </div>
            )}
          </div>

          {watermarkedImgUrl && (
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                className="btn-primary" 
                onClick={handleExtract}
                disabled={isProcessing}
                style={{ flex: 1 }}
              >
                {isProcessing ? <div className="spinner" /> : <Unlock size={18} />}
                <span>{isProcessing ? t('extractProcessing') : t('startExtractBtn')}</span>
              </button>
              <button 
                className="btn-primary" 
                onClick={handleExhaustiveExtract}
                disabled={isProcessing}
                style={{ flex: 1.2, background: 'linear-gradient(135deg, #8b5cf6 0%, #d946ef 100%)', boxShadow: '0 4px 20px rgba(217, 70, 239, 0.3)' }}
              >
                {isProcessing ? <div className="spinner" /> : <Search size={18} />}
                <span>{t('exhaustiveScanBtn')}</span>
              </button>
            </div>
          )}

          {/* Sub-step Progress Bar Overlay */}
          {isProcessing && progressInfo && (
            <div style={{
              marginTop: '16px',
              background: 'var(--surface-2)',
              border: '1px solid rgba(99, 102, 241, 0.4)',
              borderRadius: '12px',
              padding: '14px 16px',
              animation: 'fadeIn 0.2s ease-out'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-2)', marginBottom: '8px' }}>
                <span>{t('detectingProgress', { step: progressInfo.step, total: progressInfo.total })} <strong style={{ color: 'var(--accent-text)' }}>{progressInfo.algo}</strong></span>
                <span style={{ fontWeight: '700', color: '#a855f7' }}>{Math.round((progressInfo.step / progressInfo.total) * 100)}%</span>
              </div>
              <div style={{ height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${(progressInfo.step / progressInfo.total) * 100}%`,
                  background: 'linear-gradient(90deg, #6366f1 0%, #a855f7 100%)',
                  transition: 'width 0.3s ease'
                }} />
              </div>
            </div>
          )}

          {Object.keys(extractionResults).length > 0 && (
            <div className="result-box">
              <div className="result-header" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FileText size={18} />
                  <span>{t('resultsTitle')}</span>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button
                    onClick={handleGenerateCertificate}
                    style={{
                      background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.2) 0%, rgba(202, 138, 4, 0.2) 100%)',
                      color: '#facc15',
                      border: '1px solid rgba(234, 179, 8, 0.4)',
                      borderRadius: '6px',
                      padding: '4px 10px',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <Award size={14} />
                    <span>{t('generateCertBtn')}</span>
                  </button>
                  <button
                    onClick={() => { if (requireAdvanced()) { recordAdvancedUse(); setShowForensicModal(true); } }}
                    style={{
                      background: 'rgba(56, 189, 248, 0.15)',
                      color: 'var(--info-text)',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      borderRadius: '6px',
                      padding: '4px 10px',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <FileText size={13} />
                    <span>{t('forensicReportBtn')}</span>
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {Object.entries(extractionResults).map(([algoId, res]) => {
                  const algo = ALGORITHMS.find(a => a.id === algoId)!;
                  const isSuccess = res !== '';
                  const metrics = calculateExtractionMetrics(res, watermarkText);
                  const isLogo = res.startsWith('[LOGO:32]');

                  return (
                    <div 
                      key={algoId} 
                      style={{ 
                        background: 'var(--sunken)', 
                        padding: '12px', 
                        borderRadius: '8px', 
                        borderLeft: `4px solid ${isSuccess ? '#10b981' : '#ef4444'}` 
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-2)' }}>
                          {t(algo.nameKey)}
                        </div>
                        {isSuccess && (
                          <span style={{ background: `${metrics.badgeColor}22`, color: metrics.badgeColor, border: `1px solid ${metrics.badgeColor}44`, padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: '700' }}>
                            {t(metrics.badgeKey, { s: metrics.similarity, b: metrics.ber })}
                          </span>
                        )}
                      </div>
                      {isLogo ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px' }}>
                          <div style={{ fontSize: '0.85rem', color: '#f472b6', fontWeight: 700 }}>
                            {t('stampRestored')}
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: '1rem', fontWeight: '700', color: isSuccess ? 'var(--ok-text)' : 'var(--err-text)', wordBreak: 'break-all' }}>
                          {res}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Simulator Tab */}
      {activeTab === 'simulator' && (
        <div className="glass-container">
          <div className="form-group" style={{ marginBottom: '10px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '4px' }}>{t('simulatorTitle')}</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
              {t('simulatorDesc')}
            </p>
          </div>

          {!watermarkedImgUrl ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', border: '1px dashed var(--border)', borderRadius: '16px', color: 'var(--faint)' }}>
              <AlertTriangle size={32} style={{ marginBottom: '8px', color: '#eab308' }} />
              <div>{t('noWatermarkedImg')}</div>
            </div>
          ) : (
            <div className="simulator-layout">
              {/* Left Column: Attack Tweaks */}
              <div className="attack-controls">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label className="form-label" style={{ margin: 0 }}>{t('channelConfigTitle')}</label>
                  <button
                    onClick={() => {
                      setSimCrop(true);
                      setSimCropPct(25);
                      setSimJpeg(true);
                      setSimJpegQual(25);
                      setSimGray(true);
                      setSimResize(true);
                      setSimNoise(true);
                      setSimNoiseLevel(12);
                      setSimMask(true);
                      setSimMaskPct(20);
                      showToast(t('appliedExtremeCombo'), 'info');
                    }}
                    style={{
                      background: 'rgba(239, 68, 68, 0.2)',
                      color: 'var(--err-text)',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    {t('extremeComboBtn')}
                  </button>
                </div>

                <div className="attack-item">
                  <div className="attack-header">
                    <label className="checkbox-label">
                      <input 
                        type="checkbox" 
                        checked={simCrop} 
                        onChange={(e) => setSimCrop(e.target.checked)} 
                      />
                      <span>{t('attackCrop')}</span>
                    </label>
                    <span className="attack-val">{simCropPct}%</span>
                  </div>
                  {simCrop && (
                    <div className="slider-container" style={{ height: '36px' }}>
                      <input 
                        type="range" 
                        className="range-slider" 
                        min="5" 
                        max="60" 
                        value={simCropPct} 
                        onChange={(e) => setSimCropPct(Number(e.target.value))} 
                      />
                    </div>
                  )}
                </div>

                <div className="attack-item">
                  <div className="attack-header">
                    <label className="checkbox-label">
                      <input 
                        type="checkbox" 
                        checked={simGray} 
                        onChange={(e) => setSimGray(e.target.checked)} 
                      />
                      <span>{t('attackGray')}</span>
                    </label>
                  </div>
                  {simGray && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '4px' }}>
                      {t('grayTip')}
                    </div>
                  )}
                </div>

                <div className="attack-item">
                  <div className="attack-header">
                    <label className="checkbox-label">
                      <input 
                        type="checkbox" 
                        checked={simResize} 
                        onChange={(e) => setSimResize(e.target.checked)} 
                      />
                      <span>{t('attackResize')}</span>
                    </label>
                  </div>
                  {simResize && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '4px' }}>
                      {t('resizeTip')}
                    </div>
                  )}
                </div>

                <div className="attack-item">
                  <div className="attack-header">
                    <label className="checkbox-label">
                      <input 
                        type="checkbox" 
                        checked={simJpeg} 
                        onChange={(e) => setSimJpeg(e.target.checked)} 
                      />
                      <span>{t('attackJpeg')}</span>
                    </label>
                    <span className="attack-val">{simJpegQual}%</span>
                  </div>
                  {simJpeg && (
                    <div className="slider-container" style={{ height: '36px' }}>
                      <input 
                        type="range" 
                        className="range-slider" 
                        min="10" 
                        max="90" 
                        value={simJpegQual} 
                        onChange={(e) => setSimJpegQual(Number(e.target.value))} 
                      />
                    </div>
                  )}
                </div>

                <div className="attack-item">
                  <div className="attack-header">
                    <label className="checkbox-label">
                      <input 
                        type="checkbox" 
                        checked={simNoise} 
                        onChange={(e) => setSimNoise(e.target.checked)} 
                      />
                      <span>{t('attackNoise')}</span>
                    </label>
                    <span className="attack-val">{simNoiseLevel}</span>
                  </div>
                  {simNoise && (
                    <div className="slider-container" style={{ height: '36px' }}>
                      <input 
                        type="range" 
                        className="range-slider" 
                        min="5" 
                        max="50" 
                        value={simNoiseLevel} 
                        onChange={(e) => setSimNoiseLevel(Number(e.target.value))} 
                      />
                    </div>
                  )}
                </div>

                <div className="attack-item">
                  <div className="attack-header">
                    <label className="checkbox-label">
                      <input 
                        type="checkbox" 
                        checked={simMask} 
                        onChange={(e) => setSimMask(e.target.checked)} 
                      />
                      <span>{t('attackMask')}</span>
                    </label>
                    <span className="attack-val">{simMaskPct}%</span>
                  </div>
                  {simMask && (
                    <div className="slider-container" style={{ height: '36px' }}>
                      <input 
                        type="range" 
                        className="range-slider" 
                        min="10" 
                        max="50" 
                        value={simMaskPct} 
                        onChange={(e) => setSimMaskPct(Number(e.target.value))} 
                      />
                    </div>
                  )}
                </div>

                <button 
                  className="btn-primary" 
                  onClick={handleSimulateAttackAndExtract}
                  disabled={isProcessing}
                  style={{ marginTop: '16px', background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' }}
                >
                  {isProcessing ? <div className="spinner" /> : <RefreshCw size={18} />}
                  <span>{t('runAttackBtn')}</span>
                </button>
              </div>

              {/* Right Column: Attacked Preview & Extraction Results */}
              <div className="attack-preview">
                <label className="form-label">{t('attackResultTitle')}</label>
                {simResultImgUrl ? (
                  <div>
                    <div className="preview-container" style={{ position: 'relative' }}>
                      <span className="preview-tag">{t('attackedRenderTag')}</span>
                      <img src={simResultImgUrl} className="preview-img" alt="Attacked Result" />
                    </div>

                    {Object.keys(simResults).length > 0 && (
                      <div className="result-box" style={{ margin: 0 }}>
                        <div className="result-header">
                          <Unlock size={18} />
                          <span>{t('attackExtractedTitle')}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {Object.entries(simResults).map(([algoId, res]) => {
                            const algo = ALGORITHMS.find(a => a.id === algoId)!;
                            const isSuccess = res !== '';
                            return (
                              <div 
                                key={algoId} 
                                style={{ 
                                  background: 'var(--sunken)', 
                                  padding: '10px', 
                                  borderRadius: '6px', 
                                  borderLeft: `3px solid ${isSuccess ? '#10b981' : '#ef4444'}` 
                                }}
                              >
                                <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--muted)' }}>{t(algo.nameKey)}</div>
                                <div style={{ fontSize: '0.9rem', fontWeight: '700', color: isSuccess ? 'var(--ok-text)' : 'var(--err-text)', wordBreak: 'break-all' }}>
                                  {res}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '180px', border: '1px dashed var(--border)', borderRadius: '16px', color: '#475569', fontSize: '0.85rem' }}>
                    {t('waitingAttack')}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="glass-container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '16px' }}>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--text-strong)' }}>{t('historyHeader')}</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '4px 0 0 0' }}>{t('historyDesc')}</p>
            </div>
            {historyList.length > 0 && (
              <button
                onClick={() => {
                  setHistoryList([]);
                  localStorage.removeItem('hw_history_records_v1');
                  showToast(t('historyCleared'), 'info');
                }}
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  color: 'var(--err-text)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '6px',
                  padding: '4px 10px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Trash2 size={13} />
                <span>{t('clearHistoryBtn')}</span>
              </button>
            )}
          </div>

          {historyList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--faint)' }}>
              <HistoryIcon size={40} style={{ margin: '0 auto 12px auto', opacity: 0.5 }} />
              <div>{t('noHistoryText')}</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {historyList.map(record => (
                <div
                  key={record.id}
                  style={{
                    background: 'var(--sunken)',
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    padding: '12px 16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {record.imgUrl ? (
                      <img src={record.imgUrl} style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px' }} alt="" />
                    ) : (
                      <div style={{ width: '48px', height: '48px', borderRadius: '6px', background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ImageIcon size={20} style={{ color: 'var(--faint)' }} />
                      </div>
                    )}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{
                          background: record.type === 'embed' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                          color: record.type === 'embed' ? 'var(--accent-text)' : 'var(--ok-text)',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '4px'
                        }}>
                          {record.type === 'embed' ? t('historyItemEmbed') : t('historyItemExtract')}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--faint)' }}>{record.timestamp}</span>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text)', fontWeight: 600, wordBreak: 'break-all' }}>
                        {record.payload}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '2px' }}>
                        {t('algorithmsLabel')}: {record.algorithms.join(', ')}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Help FAQ Tab */}
      {activeTab === 'help' && (
        <div className="glass-container help-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sliders size={22} style={{ color: '#6366f1' }} />
              <h3 style={{ fontSize: '1.25rem', fontWeight: '800', margin: 0 }}>{t('faqTitle')}</h3>
            </div>
            <button
              onClick={handleRunDiagnosticSelfTest}
              className="btn-primary"
              style={{ padding: '6px 14px', fontSize: '0.8rem', width: 'auto', background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)' }}
            >
              <FlaskConical size={15} />
              <span>{t('runSelfTestBtn')}</span>
            </button>
          </div>

          <div className="faq-card">
            <div className="faq-q">{t('faqQ1')}</div>
            <div className="faq-a" style={{ whiteSpace: 'pre-line' }}>{t('faqA1')}</div>
          </div>

          <div className="faq-card">
            <div className="faq-q">{t('faqQ2')}</div>
            <div className="faq-a" style={{ whiteSpace: 'pre-line' }}>{t('faqA2')}</div>
          </div>

          <div className="faq-card">
            <div className="faq-q">{t('faqQ3')}</div>
            <div className="faq-a" style={{ whiteSpace: 'pre-line' }}>{t('faqA3')}</div>
          </div>
        </div>
      )}

      {/* Floating Global Status Indicator */}
      {statusMsg && (
        <div className="status-indicator">
          <div className="spinner" style={{ width: '16px', height: '16px', borderLeftColor: '#6366f1' }} />
          <span style={{ fontSize: '0.85rem', fontWeight: '600' }}>{statusMsg}</span>
        </div>
      )}

      {/* Non-blocking Toast Notification Banner */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: toast.type === 'success' ? '#059669' : toast.type === 'error' ? '#dc2626' : '#4f46e5',
          color: '#ffffff',
          padding: '10px 22px',
          borderRadius: '25px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          zIndex: 9999,
          fontSize: '0.85rem',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          animation: 'fadeIn 0.2s ease-out',
          maxWidth: '90vw'
        }}>
          {toast.type === 'success' && <CheckCircle size={16} />}
          {toast.type === 'error' && <AlertTriangle size={16} />}
          {toast.type === 'info' && <Sparkles size={16} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Automated Diagnostic Self-Test Modal */}
      {showPaywall && (
        <PaywallModal
          t={t}
          remaining={remainingAdvancedQuota()}
          onMonthly={() => handlePurchase('monthly')}
          onYearly={() => handlePurchase('yearly')}
          onRestore={handleRestore}
          onClose={() => setShowPaywall(false)}
        />
      )}

      {showDiagnosticModal && (
        <DiagnosticModal
          t={t}
          running={diagnosticRunning}
          progress={diagnosticProgress}
          results={diagnosticResults}
          onRerun={handleRunDiagnosticSelfTest}
          onClose={() => setShowDiagnosticModal(false)}
        />
      )}

      {/* Certificate Card Preview Modal */}
      {showCertModal && certImgUrl && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'var(--sunken)',
          backdropFilter: 'blur(10px)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }}>
          <div className="glass-container" style={{
            maxWidth: '560px',
            maxHeight: '90vh',
            overflowY: 'auto',
            position: 'relative',
            background: 'var(--surface-solid)',
            border: '1px solid rgba(234, 179, 8, 0.4)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#facc15', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Award size={20} />
                <span>{t('certModalTitle')}</span>
              </h3>
              <button 
                onClick={() => setShowCertModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '1.5rem', cursor: 'pointer', padding: '0 8px' }}
              >
                ×
              </button>
            </div>

            <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)', marginBottom: '16px' }}>
              <img src={certImgUrl} style={{ width: '100%', height: 'auto', display: 'block' }} alt="Certificate" />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <a
                href={certImgUrl}
                download={`copyright_certificate_${Date.now()}.png`}
                className="btn-primary"
                style={{ flex: 1, textDecoration: 'none', background: 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)', color: '#000000', fontWeight: 800 }}
              >
                <Download size={18} />
                <span>{t('downloadCertBtn')}</span>
              </a>
              <button
                onClick={async () => {
                  try {
                    await Share.share({
                      title: t('certShareTitle'),
                      text: t('certShareText'),
                      url: certImgUrl
                    });
                  } catch {}
                }}
                className="btn-primary"
                style={{ flex: 1, background: 'var(--fill)' }}
              >
                <Share2 size={18} />
                <span>{t('shareCertBtn')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Neutral Third-Party Forensic Verification Report Modal */}
      {showForensicModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'var(--sunken)',
          backdropFilter: 'blur(10px)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div className="glass-container" style={{
            maxWidth: '720px',
            maxHeight: '85vh',
            overflowY: 'auto',
            position: 'relative',
            background: 'var(--surface-solid)',
            border: '1px solid rgba(99, 102, 241, 0.4)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                {t('forensicTitle')}
              </h3>
              <button 
                onClick={() => setShowForensicModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '1.5rem', cursor: 'pointer', padding: '0 8px' }}
              >
                ×
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '0.85rem', color: 'var(--text-2)' }}>
              <div style={{ background: 'rgba(99, 102, 241, 0.12)', padding: '12px 16px', borderRadius: '8px', borderLeft: '4px solid #6366f1' }}>
                <strong style={{ color: 'var(--accent-text)', fontSize: '0.9rem' }}>{t('forensicDeclTitle')}</strong>
                <p style={{ marginTop: '6px', fontSize: '0.8rem', color: 'var(--text-2)', lineHeight: '1.5', margin: 0 }}>
                  {t('forensicDeclDesc')}
                </p>
              </div>

              <div>
                <h4 style={{ color: 'var(--info-text)', marginBottom: '8px', fontWeight: 700, fontSize: '0.95rem' }}>{t('psHeader')}</h4>
                <ol style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px', margin: 0, lineHeight: '1.5' }}>
                  <li>{t('psStep1')}</li>
                  <li>{t('psStep2')}</li>
                  <li>{t('psStep3')}</li>
                  <li>{t('psStep4')}</li>
                </ol>
              </div>

              <div>
                <h4 style={{ color: '#a855f7', marginBottom: '8px', fontWeight: 700, fontSize: '0.95rem' }}>{t('pythonHeader')}</h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '6px' }}>{t('pythonDesc')}</p>
                <pre style={{
                  background: 'var(--sunken)',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  fontSize: '0.75rem',
                  overflowX: 'auto',
                  color: 'var(--ok-text)',
                  fontFamily: 'monospace',
                  lineHeight: '1.4',
                  border: '1px solid var(--border)'
                }}>
{t('pythonCode')}
                </pre>
              </div>

              <div style={{ textAlign: 'right', marginTop: '8px' }}>
                <button 
                  className="btn-primary" 
                  onClick={() => setShowForensicModal(false)}
                  style={{ padding: '8px 22px', fontSize: '0.85rem' }}
                >
                  {t('closeReportBtn')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
