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
  SlidersHorizontal
} from 'lucide-react';
import { Share } from '@capacitor/share';
import { Toast } from '@capacitor/toast';
import { analyzeImageTexture, calculateExtractionMetrics, TextureAnalysis } from './algorithms/utils';

// Vite inlined worker import
import WatermarkWorker from './workers/watermark.worker?worker&inline';

// Interactive Split-Screen Image Comparison Slider Component
function ImageCompareSlider({ originalUrl, watermarkedUrl }: { originalUrl: string; watermarkedUrl: string }) {
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
      <span className="compare-badge left">原图 (Original)</span>
      <span className="compare-badge right">盲水印图 (Watermarked)</span>

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
    name: '频域 DCT 扩频水印 (主推)',
    badge: '最强鲁棒',
    badgeType: 'robust',
    desc: '将水印嵌入中频离散余弦系数中。在抗JPEG压缩、图片裁切、格式转换和噪点方面具有极其优越的生存能力。',
    defaultStrength: 25,
    minStrength: 10,
    maxStrength: 60,
    unit: '亮度差'
  },
  {
    id: 'chroma',
    name: '色度空间 DCT 隐形水印',
    badge: '极高隐蔽',
    badgeType: 'capacity',
    desc: '在 YCbCr 色彩空间的 Cr（红色度）通道中嵌入水印。由于人眼对色度变化极不敏感，即使增加强度也完全无法察觉。',
    defaultStrength: 35,
    minStrength: 15,
    maxStrength: 80,
    unit: '色度差'
  },
  {
    id: 'dft',
    name: '频域 DFT 全局水印',
    badge: '抗位移',
    badgeType: 'robust',
    desc: '利用傅里叶变换幅度谱的平移不变性。对全局剪切、平移操作有极强的抵抗能力。限制：要求图片大小至少为256x256。',
    defaultStrength: 30,
    minStrength: 10,
    maxStrength: 80,
    unit: '幅度倍数'
  },
  {
    id: 'dwt',
    name: '小波变换 DWT 隐形水印',
    badge: '多分辨率',
    badgeType: 'robust',
    desc: '通过一级离散小波（Haar）分解，在水平和垂直细节子带（LH, HL）中进行调制，在压缩和模糊攻击中表现良好。',
    defaultStrength: 25,
    minStrength: 10,
    maxStrength: 60,
    unit: '系数差'
  },
  {
    id: 'dsss',
    name: '空域直接扩频 DSSS 水印',
    badge: '抗噪声',
    badgeType: 'robust',
    desc: '在空间域使用伪随机噪声序列调制每一位水印并叠加到像素上。在添加随机噪点和轻微涂抹下提取效果好。',
    defaultStrength: 8,
    minStrength: 2,
    maxStrength: 25,
    unit: '噪声幅度'
  },
  {
    id: 'lsb',
    name: '最低有效位 LSB 密写',
    badge: '极高容量',
    badgeType: 'capacity',
    desc: '经典的隐写术，利用伪随机密钥挑选像素并微调其最低有效位。完全无痕，容量极大，但在有损压缩下容易损坏。不建议与频域算法叠加。',
    defaultStrength: 5,
    minStrength: 1,
    maxStrength: 15,
    unit: '冗余副本数'
  }
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'embed' | 'extract' | 'simulator' | 'help'>('embed');
  
  // Multiple algorithms selection
  const [selectedAlgos, setSelectedAlgos] = useState<string[]>(['dct']);
  
  const [watermarkText, setWatermarkText] = useState('Secure Watermark 2026');
  const [securityKey, setSecurityKey] = useState('antigravity_safe');
  const [strength, setStrength] = useState(25);

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

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const extractInputRef = useRef<HTMLInputElement>(null);

  // Sync strength slider when main selected algorithm changes
  useEffect(() => {
    const firstAlgo = selectedAlgos[0] || 'dct';
    const algo = ALGORITHMS.find(a => a.id === firstAlgo);
    if (algo) {
      setStrength(algo.defaultStrength);
    }
  }, [selectedAlgos]);

  const [showForensicModal, setShowForensicModal] = useState(false);

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
  const handleExhaustiveExtract = async () => {
    if (!watermarkedImgUrl) return;
    const allAlgoIds = ALGORITHMS.map(a => a.id);
    setSelectedAlgos(allAlgoIds);
    
    if (!securityKey) {
      showToast('未输入密钥，将尝试默认无密匙盲解密；若加密时设置了密钥，请填入密钥！', 'info');
    }

    setIsProcessing(true);
    setProgressInfo({ step: 0, total: allAlgoIds.length, algo: '启动全算法穷举扫描...' });
    setStatusMsg('正在进行全算法 (6/6) 穷举特征提取与解密...');

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
            algo: algoObj ? algoObj.name.split(' ')[0] : p.algo
          });
        }
      );

      setExtractionResults(res.results);
      showToast('全算法穷举深度探测完成！', 'success');
      setStatusMsg('穷举探测完成！');
      setTimeout(() => setStatusMsg(''), 2000);
    } catch (err: any) {
      showToast(`穷举提取失败: ${err.message}`, 'error');
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
      showToast('已一键切换至【一般加密】模式 (单层 DCT 经典抗有损防护)', 'info');
    } else if (mode === 'complex') {
      setSelectedAlgos(['dct', 'chroma', 'dwt']);
      setStrength(30);
      showToast('已一键切换至【复杂加密】模式 (DCT + 色度Chroma + 小波DWT 3重联合防御)', 'info');
    } else if (mode === 'ultimate') {
      setSelectedAlgos(['dct', 'chroma', 'dwt', 'dft', 'dsss']);
      setStrength(40);
      showToast('已一键切换至【终极加密】模式 (5大频域无损融合军工级防御全家桶)', 'success');
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
          reject(new Error('无法创建 Canvas 2D 上下文'));
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
      img.onerror = () => reject(new Error('图片加载或解码异常，请确认图片格式是否正确'));
      img.src = url;
    });
  };

  // One-click timestamp signature generator
  const generateTimestampSignature = () => {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 16).replace('T', ' ');
    const randomHash = Math.random().toString(36).substring(2, 8).toUpperCase();
    setWatermarkText(`[AUTH] ${dateStr} | Hash:${randomHash}`);
    showToast('防伪时间戳与数字签名已插入！', 'success');
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
          title: '隐藏盲水印加密图片',
          text: '使用多维防伪水印大师导出的无痕信息嵌入图片',
          url: watermarkedImgUrl,
          dialogTitle: '保存到相册或分享'
        });
        showToast('唤起系统分享/保存页面成功', 'success');
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
    showToast('图片下载已触发', 'success');
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
        showToast('图片加载成功，双向特征提取就绪', 'info');
      } else {
        setWatermarkedImgUrl(url);
        setExtractionResults({});
        showToast('检测图片已加载', 'info');
      }
    };
    reader.onerror = () => {
      showToast("读取图片文件异常，请重新选择", "error");
    };
    reader.readAsDataURL(file);
  };

  // Core action: Embed Watermark (Sequentially embeds all selected algorithms with live progress)
  const handleEmbed = async () => {
    if (!sourceImgUrl) return;
    if (selectedAlgos.length === 0) {
      showToast("请至少勾选一种隐藏水印方式", "error");
      return;
    }
    setIsProcessing(true);
    setProgressInfo({ step: 0, total: selectedAlgos.length, algo: '初始化引擎...' });
    setStatusMsg(`正在进行多重隐藏水印叠加 (${selectedAlgos.join(' -> ')})...`);

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
            algo: algoObj ? algoObj.name.split(' ')[0] : p.algo
          });
        }
      );

      const outputImgData = new ImageData(new Uint8ClampedArray(res.pixels), imgData.width, imgData.height);
      setWatermarkedImgUrl(imageDataToUrl(outputImgData));
      showToast('多重隐藏水印叠加融合成功！', 'success');
      setStatusMsg('嵌入完成！');
      setTimeout(() => setStatusMsg(''), 2000);
    } catch (err: any) {
      showToast(`嵌入失败: ${err.message}`, 'error');
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
      showToast("请至少勾选一种检测算法", "error");
      return;
    }
    setIsProcessing(true);
    setProgressInfo({ step: 0, total: selectedAlgos.length, algo: '准备检测...' });
    setStatusMsg('正在启动后台信道逆向特征探测分析...');

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
            algo: algoObj ? algoObj.name.split(' ')[0] : p.algo
          });
        }
      );

      setExtractionResults(res.results);
      showToast('多算法并行探测完成！', 'success');
      setStatusMsg('探测完成！');
      setTimeout(() => setStatusMsg(''), 2000);
    } catch (err: any) {
      showToast(`提取失败: ${err.message}`, 'error');
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
    setProgressInfo({ step: 0, total: selectedAlgos.length, algo: '施加模拟攻击...' });
    setStatusMsg('正在生成信道噪声与物理裁剪模拟图...');

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
        ctx.fillText('局部涂抹/贴纸遮挡', maskX + maskW / 2, maskY + maskH / 2 + 5);
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
      setStatusMsg('模拟受损图已生成，正在交叉提取多重水印...');

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
            algo: algoObj ? algoObj.name.split(' ')[0] : p.algo
          });
        }
      );

      setSimResults(res.results);
      showToast('受损测试与联合提取完成！', 'success');
      setStatusMsg('模拟测试完成！');
      setTimeout(() => setStatusMsg(''), 2000);
    } catch (err: any) {
      showToast(`测试失败: ${err.message}`, 'error');
      setStatusMsg('');
    } finally {
      setIsProcessing(false);
      setProgressInfo(null);
    }
  };

      setSimResults(res.results);
      setStatusMsg('模拟测试与联合提取完成！');
      setTimeout(() => setStatusMsg(''), 2000);
    } catch (err: any) {
      alert(`测试失败: ${err.message}`);
      setStatusMsg('');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-content">
      {/* App Header */}
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '8px' }}>
          <Shield size={38} className="upload-icon" style={{ animation: 'none', color: '#6366f1' }} />
          <h1 className="app-title">隐藏水印大师</h1>
        </div>
        <p className="app-subtitle">多维度图像防伪与隐形盲水印鲁棒检测防御系统</p>
      </header>

      {/* Tabs Navigation */}
      <nav className="tabs-navigation">
        <button 
          className={`tab-btn ${activeTab === 'embed' ? 'active' : ''}`}
          onClick={() => setActiveTab('embed')}
        >
          <Sparkles size={20} />
          <span>多重水印添加</span>
        </button>
        <button 
          className={`tab-btn ${activeTab === 'extract' ? 'active' : ''}`}
          onClick={() => setActiveTab('extract')}
        >
          <Unlock size={20} />
          <span>联合还原提取</span>
        </button>
        <button 
          className={`tab-btn ${activeTab === 'simulator' ? 'active' : ''}`}
          onClick={() => setActiveTab('simulator')}
        >
          <Activity size={20} />
          <span>模拟抗攻击</span>
        </button>
        <button 
          className={`tab-btn ${activeTab === 'help' ? 'active' : ''}`}
          onClick={() => setActiveTab('help')}
        >
          <HelpCircle size={20} />
          <span>算法说明</span>
        </button>
      </nav>

      {/* Dynamic Tabs Content */}
      {activeTab === 'embed' && (
        <div className="glass-container">
          <div className="form-group">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
              <label className="form-label" style={{ margin: 0 }}>1. 选择隐藏水印方式 (可手动勾选或一键预设)</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button 
                  onClick={() => applyPresetMode('general')}
                  style={{
                    background: selectedAlgos.length === 1 && selectedAlgos[0] === 'dct' ? '#6366f1' : 'rgba(255,255,255,0.06)',
                    color: '#ffffff',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '6px',
                    padding: '4px 10px',
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  🔒 一般加密
                </button>
                <button 
                  onClick={() => applyPresetMode('complex')}
                  style={{
                    background: selectedAlgos.length === 3 && selectedAlgos.includes('dwt') ? '#8b5cf6' : 'rgba(255,255,255,0.06)',
                    color: '#ffffff',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '6px',
                    padding: '4px 10px',
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  🛡️ 复杂加密 (3层)
                </button>
                <button 
                  onClick={() => applyPresetMode('ultimate')}
                  style={{
                    background: selectedAlgos.length === 5 ? 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)' : 'rgba(255,255,255,0.06)',
                    color: '#ffffff',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '6px',
                    padding: '4px 10px',
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    boxShadow: selectedAlgos.length === 5 ? '0 0 12px rgba(236, 72, 153, 0.4)' : 'none'
                  }}
                >
                  👑 终极加密 (5层全家桶)
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
                        {algo.name}
                        <span className={`algo-badge ${algo.badgeType}`}>{algo.badge}</span>
                      </div>
                      <div className="algo-desc">{algo.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">2. 水印参数配置</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label className="form-label" style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>水印文字 Payload</label>
                  <button 
                    onClick={generateTimestampSignature}
                    style={{
                      background: 'rgba(99, 102, 241, 0.15)',
                      color: '#a5b4fc',
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
                    <span>插入防伪时间戳签名</span>
                  </button>
                </div>
                <input 
                  type="text" 
                  className="input-text" 
                  value={watermarkText} 
                  onChange={(e) => setWatermarkText(e.target.value)} 
                  placeholder="输入要嵌入的水印内容"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="form-label" style={{ fontSize: '0.75rem', color: '#94a3b8' }}>安全密钥 (Seeded Key)</label>
                  <input 
                    type="text" 
                    className="input-text" 
                    value={securityKey} 
                    onChange={(e) => setSecurityKey(e.target.value)} 
                    placeholder="密匙"
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                    嵌入基准强度: {strength}
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
              {textureAnalysis && (
                <div className="texture-banner">
                  <div className="texture-info">
                    <div className="texture-title">
                      <SlidersHorizontal size={14} style={{ color: '#6366f1' }} />
                      <span>图像频域复杂度诊断: {textureAnalysis.score}/100 ({textureAnalysis.complexity === 'low' ? '平滑' : textureAnalysis.complexity === 'medium' ? '适中' : '丰富'})</span>
                    </div>
                    <div className="texture-desc">{textureAnalysis.advice}</div>
                  </div>
                  <button 
                    className="btn-apply-strength"
                    onClick={() => {
                      setStrength(textureAnalysis.recommendedStrength);
                      showToast(`已应用智能建议强度: ${textureAnalysis.recommendedStrength}`, 'success');
                    }}
                  >
                    应用推荐强度 ({textureAnalysis.recommendedStrength})
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">3. 上传原始图片</label>
            {!sourceImgUrl ? (
              <div className="upload-zone" onClick={() => fileInputRef.current?.click()}>
                <ImageIcon size={40} className="upload-icon" />
                <span className="upload-text">点击或拖拽上传图片</span>
                <span className="upload-hint">自动等比裁剪/压缩至 1024px，确保移动端秒级处理</span>
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
                  <div style={{ marginTop: '8px', fontSize: '0.75rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ background: 'rgba(255,255,255,0.06)', padding: '3px 10px', borderRadius: '6px' }}>
                      原图尺寸: {imageMeta.origW} × {imageMeta.origH}
                    </span>
                    {imageMeta.origW !== imageMeta.procW && (
                      <span style={{ background: 'rgba(99, 102, 241, 0.2)', color: '#a5b4fc', padding: '3px 10px', borderRadius: '6px', fontWeight: '600' }}>
                        已自动优化为: {imageMeta.procW} × {imageMeta.procH} (防止内存溢出)
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {sourceImgUrl && (
            <button 
              className="btn-primary" 
              onClick={handleEmbed}
              disabled={isProcessing}
            >
              {isProcessing ? <div className="spinner" /> : <Shield size={18} />}
              <span>{isProcessing ? '正在依次生成并融合多重隐藏水印...' : '开始生成隐藏水印图片'}</span>
            </button>
          )}

          {/* Sub-step Progress Bar Overlay */}
          {isProcessing && progressInfo && (
            <div style={{
              marginTop: '16px',
              background: 'rgba(15, 23, 42, 0.8)',
              border: '1px solid rgba(99, 102, 241, 0.4)',
              borderRadius: '12px',
              padding: '14px 16px',
              animation: 'fadeIn 0.2s ease-out'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '8px' }}>
                <span>正在处理算法 ({progressInfo.step}/{progressInfo.total}): <strong style={{ color: '#818cf8' }}>{progressInfo.algo}</strong></span>
                <span style={{ fontWeight: '700', color: '#a855f7' }}>{Math.round((progressInfo.step / progressInfo.total) * 100)}%</span>
              </div>
              <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${(progressInfo.step / progressInfo.total) * 100}%`,
                  background: 'linear-gradient(90deg, #6366f1 0%, #a855f7 100%)',
                  transition: 'width 0.3s ease'
                }} />
              </div>
            </div>
          )}

          {watermarkedImgUrl && sourceImgUrl && (
            <div className="result-box" style={{ marginTop: '24px' }}>
              <div className="result-header" style={{ color: '#34d399', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle size={18} />
                  <span>多重水印叠加融合成功！</span>
                </div>
                <button 
                  onClick={() => setShowCompareSlider(!showCompareSlider)}
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    color: '#ffffff',
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
                  <span>{showCompareSlider ? '单图预览' : '双图滑动对比'}</span>
                </button>
              </div>

              {/* Interactive Split Comparison Slider */}
              {showCompareSlider ? (
                <div style={{ margin: '12px 0' }}>
                  <ImageCompareSlider originalUrl={sourceImgUrl} watermarkedUrl={watermarkedImgUrl} />
                  <div style={{ textAlign: 'center', fontSize: '0.75rem', color: '#94a3b8', marginTop: '6px' }}>
                    💡 拖动中间蓝线可左右对比原图与水印图，肉眼完全感知不到任何画质损失
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
                  <span>保存到相册 / 系统分享</span>
                </button>
                <a 
                  href={watermarkedImgUrl} 
                  download={`watermarked_multi_${Date.now()}.png`}
                  className="btn-primary" 
                  style={{ width: '52px', padding: 0, justifyContent: 'center', background: 'rgba(255,255,255,0.1)' }}
                  title="强行作为文件下载"
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
            <label className="form-label">1. 配置检测参数 (选择要并行检测的算法及安全密钥)</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label className="form-label" style={{ fontSize: '0.75rem', color: '#94a3b8' }}>安全密钥</label>
                <input 
                  type="text" 
                  className="input-text" 
                  value={securityKey} 
                  onChange={(e) => setSecurityKey(e.target.value)} 
                />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label className="form-label" style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>待选检测算法</label>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button 
                      onClick={() => applyPresetMode('general')}
                      style={{ background: 'rgba(255,255,255,0.06)', color: '#a5b4fc', border: 'none', borderRadius: '4px', padding: '2px 6px', fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                      一般解密
                    </button>
                    <button 
                      onClick={() => applyPresetMode('complex')}
                      style={{ background: 'rgba(255,255,255,0.06)', color: '#c084fc', border: 'none', borderRadius: '4px', padding: '2px 6px', fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                      复杂解密
                    </button>
                    <button 
                      onClick={() => applyPresetMode('ultimate')}
                      style={{ background: 'rgba(236,72,153,0.2)', color: '#f472b6', border: 'none', borderRadius: '4px', padding: '2px 6px', fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                      终极解密
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
                          background: isSelected ? '#6366f1' : 'rgba(255,255,255,0.05)',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '6px 10px',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                          fontWeight: '600'
                        }}
                      >
                        {a.name.split(' ')[0]}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">2. 上传待检测图片</label>
            {!watermarkedImgUrl ? (
              <div className="upload-zone" onClick={() => extractInputRef.current?.click()}>
                <ImageIcon size={40} className="upload-icon" />
                <span className="upload-text">选择需要提取水印的图片</span>
                <span className="upload-hint">自动等比裁剪/压缩至 1024px 以进行对齐检测</span>
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
                <span>{isProcessing ? '正在解析物理特征...' : '探测所选算法'}</span>
              </button>
              <button 
                className="btn-primary" 
                onClick={handleExhaustiveExtract}
                disabled={isProcessing}
                style={{ flex: 1.2, background: 'linear-gradient(135deg, #8b5cf6 0%, #d946ef 100%)', boxShadow: '0 4px 20px rgba(217, 70, 239, 0.3)' }}
              >
                {isProcessing ? <div className="spinner" /> : <Search size={18} />}
                <span>🔍 一键全算法穷举深度扫描</span>
              </button>
            </div>
          )}

          {/* Sub-step Progress Bar Overlay */}
          {isProcessing && progressInfo && (
            <div style={{
              marginTop: '16px',
              background: 'rgba(15, 23, 42, 0.8)',
              border: '1px solid rgba(99, 102, 241, 0.4)',
              borderRadius: '12px',
              padding: '14px 16px',
              animation: 'fadeIn 0.2s ease-out'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '8px' }}>
                <span>正在探测算法 ({progressInfo.step}/{progressInfo.total}): <strong style={{ color: '#818cf8' }}>{progressInfo.algo}</strong></span>
                <span style={{ fontWeight: '700', color: '#a855f7' }}>{Math.round((progressInfo.step / progressInfo.total) * 100)}%</span>
              </div>
              <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
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
              <div className="result-header" style={{ justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FileText size={18} />
                  <span>各算法联合还原检测与匹配度分析：</span>
                </div>
                <button
                  onClick={() => setShowForensicModal(true)}
                  style={{
                    background: 'rgba(56, 189, 248, 0.15)',
                    color: '#38bdf8',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    borderRadius: '6px',
                    padding: '3px 8px',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <FileText size={13} />
                  <span>⚖️ Photoshop/第三方复现报告</span>
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {Object.entries(extractionResults).map(([algoId, res]) => {
                  const algo = ALGORITHMS.find(a => a.id === algoId)!;
                  const isSuccess = !res.startsWith('提取失败') && !res.startsWith('检测出错');
                  const metrics = calculateExtractionMetrics(res, watermarkText);

                  return (
                    <div 
                      key={algoId} 
                      style={{ 
                        background: 'rgba(0,0,0,0.2)', 
                        padding: '12px', 
                        borderRadius: '8px', 
                        borderLeft: `4px solid ${isSuccess ? '#10b981' : '#ef4444'}` 
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: '700', color: '#cbd5e1' }}>
                          {algo.name}
                        </div>
                        {isSuccess && (
                          <span style={{ background: `${metrics.badgeColor}22`, color: metrics.badgeColor, border: `1px solid ${metrics.badgeColor}44`, padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: '700' }}>
                            {metrics.badge}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '1rem', fontWeight: '700', color: isSuccess ? '#34d399' : '#f87171', wordBreak: 'break-all' }}>
                        {res}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'simulator' && (
        <div className="glass-container">
          <div className="form-group" style={{ marginBottom: '10px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '4px' }}>抗攻击/剪切压缩实测模拟器</h3>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
              无需手动打包和外部图片工具，在 app 内直接模拟水印图片遭受各种网络压缩或裁剪攻击，一键验证多重算法抗性。
            </p>
          </div>

          {!watermarkedImgUrl ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '16px', color: '#64748b' }}>
              <AlertTriangle size={32} style={{ marginBottom: '8px', color: '#eab308' }} />
              <div>请先在“添加水印”页面生成或在“反向探测”页面上传带水印的图片</div>
            </div>
          ) : (
            <div className="simulator-layout">
              {/* Left Column: Attack Tweaks */}
              <div className="attack-controls">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label className="form-label" style={{ margin: 0 }}>1. 配置模拟攻击信道</label>
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
                      showToast('已开启全套极端毁坏性压测组合！', 'info');
                    }}
                    style={{
                      background: 'rgba(239, 68, 68, 0.2)',
                      color: '#f87171',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <AlertTriangle size={14} />
                    <span>开启极限复合压测</span>
                  </button>
                </div>
                
                {/* Attack 1: Crop */}
                <div className="attack-card">
                  <div className="attack-title">
                    <span>剪切攻击 (Crop Image)</span>
                    <div 
                      className={`attack-toggle ${simCrop ? 'active' : ''}`}
                      onClick={() => setSimCrop(!simCrop)}
                    />
                  </div>
                  {simCrop && (
                    <div className="slider-container" style={{ marginTop: '8px' }}>
                      <span style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>边缘裁剪比例:</span>
                      <input 
                        type="range" 
                        className="range-slider" 
                        min="5" 
                        max="60" 
                        value={simCropPct} 
                        onChange={(e) => setSimCropPct(Number(e.target.value))} 
                      />
                      <span className="slider-val">{simCropPct}%</span>
                    </div>
                  )}
                </div>

                {/* Attack 2: Grayscale / Color Loss */}
                <div className="attack-card">
                  <div className="attack-title">
                    <span>灰度去色攻击 (100% Grayscale Conversion)</span>
                    <div 
                      className={`attack-toggle ${simGray ? 'active' : ''}`}
                      onClick={() => setSimGray(!simGray)}
                    />
                  </div>
                  {simGray && (
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '6px' }}>
                      💡 彻底剥离色彩通道（验证亮度频域 DCT/DFT 在全黑白下的提取生存力）
                    </div>
                  )}
                </div>

                {/* Attack 3: Resampling Downsample */}
                <div className="attack-card">
                  <div className="attack-title">
                    <span>分辨率重采样 (50% Downsample & Upscale)</span>
                    <div 
                      className={`attack-toggle ${simResize ? 'active' : ''}`}
                      onClick={() => setSimResize(!simResize)}
                    />
                  </div>
                  {simResize && (
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '6px' }}>
                      💡 模拟社交软件（微信/Telegram）发送图片时的降采样高频过滤
                    </div>
                  )}
                </div>

                {/* Attack 4: JPEG Lossy compression */}
                <div className="attack-card">
                  <div className="attack-title">
                    <span>有损 JPEG 压缩 (Lossy Compression)</span>
                    <div 
                      className={`attack-toggle ${simJpeg ? 'active' : ''}`}
                      onClick={() => setSimJpeg(!simJpeg)}
                    />
                  </div>
                  {simJpeg && (
                    <div className="slider-container" style={{ marginTop: '8px' }}>
                      <span style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>有损压缩质量:</span>
                      <input 
                        type="range" 
                        className="range-slider" 
                        min="10" 
                        max="90" 
                        value={simJpegQual} 
                        onChange={(e) => setSimJpegQual(Number(e.target.value))} 
                      />
                      <span className="slider-val" style={{ color: '#ef4444' }}>{simJpegQual}</span>
                    </div>
                  )}
                </div>

                {/* Attack 5: WebP Lossy Format Conversion */}
                <div className="attack-card">
                  <div className="attack-title">
                    <span>WebP 格式有损转换 (WebP Format Conversion)</span>
                    <div 
                      className={`attack-toggle ${simWebp ? 'active' : ''}`}
                      onClick={() => setSimWebp(!simWebp)}
                    />
                  </div>
                  {simWebp && (
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '6px' }}>
                      💡 转换为现代有损 WebP 格式（质量 40%），验证跨格式编码抗性
                    </div>
                  )}
                </div>

                {/* Attack 6: Gaussian Noise */}
                <div className="attack-card">
                  <div className="attack-title">
                    <span>噪点干扰 (Gaussian Noise)</span>
                    <div 
                      className={`attack-toggle ${simNoise ? 'active' : ''}`}
                      onClick={() => setSimNoise(!simNoise)}
                    />
                  </div>
                  {simNoise && (
                    <div className="slider-container" style={{ marginTop: '8px' }}>
                      <span style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>噪声电平:</span>
                      <input 
                        type="range" 
                        className="range-slider" 
                        min="5" 
                        max="50" 
                        value={simNoiseLevel} 
                        onChange={(e) => setSimNoiseLevel(Number(e.target.value))} 
                      />
                      <span className="slider-val">{simNoiseLevel}</span>
                    </div>
                  )}
                </div>

                {/* Attack 7: Sticker / Center Blockage Attack */}
                <div className="attack-card">
                  <div className="attack-title">
                    <span>贴纸/局部涂抹遮挡 (Sticker Blockage)</span>
                    <div 
                      className={`attack-toggle ${simMask ? 'active' : ''}`}
                      onClick={() => setSimMask(!simMask)}
                    />
                  </div>
                  {simMask && (
                    <div className="slider-container" style={{ marginTop: '8px' }}>
                      <span style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>遮挡区域大小:</span>
                      <input 
                        type="range" 
                        className="range-slider" 
                        min="10" 
                        max="50" 
                        value={simMaskPct} 
                        onChange={(e) => setSimMaskPct(Number(e.target.value))} 
                      />
                      <span className="slider-val">{simMaskPct}%</span>
                    </div>
                  )}
                </div>

                <button 
                  className="btn-primary"
                  onClick={handleSimulateAttackAndExtract}
                  disabled={isProcessing}
                >
                  <RefreshCw size={18} className={isProcessing ? 'upload-icon' : ''} />
                  <span>执行极限攻击并探测提取</span>
                </button>
              </div>

              {/* Right Column: Attacked Result & Extracted Info */}
              <div>
                <label className="form-label">2. 攻击效果与多重提取结果</label>
                
                {simResultImgUrl ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div className="preview-container" style={{ margin: 0 }}>
                      <span style={{ position: 'absolute', top: '8px', left: '8px', background: 'rgba(0,0,0,0.6)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', color: '#ef4444' }}>
                        受攻击渲染效果
                      </span>
                      <img src={simResultImgUrl} className="preview-img" alt="Attacked Result" />
                    </div>

                    {Object.keys(simResults).length > 0 && (
                      <div className="result-box" style={{ margin: 0 }}>
                        <div className="result-header">
                          <Unlock size={18} />
                          <span>攻击后联合提取检测：</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {Object.entries(simResults).map(([algoId, res]) => {
                            const algo = ALGORITHMS.find(a => a.id === algoId)!;
                            const isSuccess = !res.startsWith('提取失败') && !res.startsWith('检测出错');
                            return (
                              <div 
                                key={algoId} 
                                style={{ 
                                  background: 'rgba(0,0,0,0.25)', 
                                  padding: '10px', 
                                  borderRadius: '6px', 
                                  borderLeft: `3px solid ${isSuccess ? '#10b981' : '#ef4444'}` 
                                }}
                              >
                                <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#94a3b8' }}>{algo.name}</div>
                                <div style={{ fontSize: '0.9rem', fontWeight: '700', color: isSuccess ? '#34d399' : '#f87171', wordBreak: 'break-all' }}>
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
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '180px', border: '1px dashed rgba(255,255,255,0.05)', borderRadius: '16px', color: '#475569', fontSize: '0.85rem' }}>
                    等待执行攻击实测...
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'help' && (
        <div className="glass-container help-section">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '12px' }}>
            <Sliders size={22} style={{ color: '#6366f1' }} />
            <h3 style={{ fontSize: '1.25rem', fontWeight: '800' }}>隐藏多重盲水印防御原理解析</h3>
          </div>

          <div className="faq-card">
            <div className="faq-q">🤔 什么是多重隐藏水印？</div>
            <div className="faq-a">
              多重隐藏水印（Layered Blind Watermarking）允许你将多层不同的数字版权水印以串联的形式叠加融合进图片的不同层面。例如，你可以同时在Cr色度通道嵌入<strong>色度空间DCT水印</strong>（防色度损失），并在Y亮度通道嵌入<strong>频域DCT扩频水印</strong>（防有损JPEG压缩），两者互不干扰、完美兼容，提供了极致的主动安全防御屏障。
            </div>
          </div>

          <div className="faq-card">
            <div className="faq-q">🛡️ 为什么图片被剪切、压缩后也能恢复？</div>
            <div className="faq-a">
              1. <strong>频域波形调制</strong>：水印嵌入在频域中频部分，而不是特定的像素点。JPEG有损压缩主要丢弃难以感知的超高频，因此中频的水印依然能被精确滤出。
              <br />
              2. <strong>块级多数表决冗余</strong>：水印位序列被铺满在数千个 $8 \times 8$ 的小波/余弦格栅里。物理裁剪掉50%甚至70%后，未损坏的网格依旧能通过统计多数表决来修正局部损坏。
              <br />
              3. <strong>网格移位自搜寻</strong>：为了解决物理裁剪后的像素网格错位，探测器会自动检索 64 种对齐偏移量并根据同步头部特征恢复像素格对齐，极具抗裁剪抗性。
            </div>
          </div>

          <div className="faq-card">
            <div className="faq-q">⚠️ 多重叠加有什么限制吗？</div>
            <div className="faq-a">
              频域算法（DCT, Chroma, DWT, DFT, DSSS）之间可以通过浮点反变换进行良好的兼容和多层堆叠。但是<strong>最低有效位 (LSB) 密写</strong>属于最末端空域微调，任何频域反变换Clamp操作都会磨灭其最低位信息。因此，<strong>若勾选了LSB，建议不勾选其他算法以保证解密成功率</strong>。
            </div>
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

      {/* Neutral Third-Party Forensic Verification Report Modal */}
      {showForensicModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.85)',
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
            background: '#0f172a',
            border: '1px solid rgba(99, 102, 241, 0.4)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                ⚖️ 第三方专业工具 (Photoshop/GIMP/Python) 独立复现与验证指导报告
              </h3>
              <button 
                onClick={() => setShowForensicModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer', padding: '0 8px' }}
              >
                ×
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '0.85rem', color: '#cbd5e1' }}>
              <div style={{ background: 'rgba(99, 102, 241, 0.12)', padding: '12px 16px', borderRadius: '8px', borderLeft: '4px solid #6366f1' }}>
                <strong style={{ color: '#818cf8', fontSize: '0.9rem' }}>公正性与透明度独立验证声明</strong>
                <p style={{ marginTop: '6px', fontSize: '0.8rem', color: '#cbd5e1', lineHeight: '1.5', margin: 0 }}>
                  本软件嵌入的所有盲水印均遵循公开的标准离散余弦变换 (DCT) 与小波变换 (DWT) 数学公式。中立第三方（如司法鉴定中心、独立学术专家、版权裁判机构）无需依赖本软件，即可直接使用通用图像处理软件（Adobe Photoshop / GIMP）或标准 Python 开源库进行独立显影复现与验证。
                </p>
              </div>

              <div>
                <h4 style={{ color: '#38bdf8', marginBottom: '8px', fontWeight: 700, fontSize: '0.95rem' }}>一、 Adobe Photoshop / GIMP 专业图像工具显影复现步骤</h4>
                <ol style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px', margin: 0, lineHeight: '1.5' }}>
                  <li><strong>Step 1: 载入图片</strong> - 在 Photoshop 中打开包含暗水印的图像文件。</li>
                  <li><strong>Step 2: 色彩空间转换 (针对色度 DCT 盲水印)</strong> - 点击菜单 <code>图像 (Image)</code> ➔ <code>模式 (Mode)</code> ➔ 选择 <code>Lab 颜色</code>。打开“通道 (Channels)”面板，单独选中 <code>a</code> 或 <code>b</code> 色度通道（或 YCbCr 的 Cr 色差通道）。</li>
                  <li><strong>Step 3: 色阶高对比度均化 (Levels Equalization)</strong> - 按快捷键 <code>Ctrl + L</code> 调出色阶窗口，将中间灰输入滑块拉至极限（或使用 <code>图像 ➔ 调整 ➔ 均化</code>）。隐藏的频域余弦格栅微光即可在屏幕上清晰显示！</li>
                  <li><strong>Step 4: 高通滤波 (适用于空域/DSSS/LSB)</strong> - 选择 <code>滤镜 (Filter)</code> ➔ <code>其他 (Other)</code> ➔ <code>高通 (High Pass)</code>，半径设为 1.0~2.0 像素，随后按 <code>Ctrl + Shift + U</code> 去色，水印微纹理即可显露。</li>
                </ol>
              </div>

              <div>
                <h4 style={{ color: '#a855f7', marginBottom: '8px', fontWeight: 700, fontSize: '0.95rem' }}>二、 开源标准 Python / OpenCV 代码独立提取复现</h4>
                <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px' }}>任何司法鉴定人员均可在本地环境独立运行以下标准 Python 脚本提取验证：</p>
                <pre style={{
                  background: 'rgba(0,0,0,0.6)',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  fontSize: '0.75rem',
                  overflowX: 'auto',
                  color: '#34d399',
                  fontFamily: 'monospace',
                  lineHeight: '1.4',
                  border: '1px solid rgba(255,255,255,0.05)'
                }}>
{`import cv2
import numpy as np
from scipy.fftpack import dct

# 1. 读取待检测图片并转为 YCbCr 空间
img = cv2.imread("watermarked_image.png")
ycbcr = cv2.cvtColor(img, cv2.COLOR_BGR2YCrCb)
Y = ycbcr[:, :, 0].astype(np.float32)

# 2. 8x8 块离散余弦变换 (2D Block-DCT) 提取
h, w = Y.shape
watermark_bits = []
for r in range(0, h - 7, 8):
    for c in range(0, w - 7, 8):
        block = Y[r:r+8, c:c+8] - 128.0
        dct_block = dct(dct(block.T, norm='ortho').T, norm='ortho')
        # 比较中频系数 (3,4) 与 (4,3) 之差
        diff = dct_block[3, 4] - dct_block[4, 3]
        watermark_bits.append(1 if diff > 0 else 0)

print("第三方公开数学提取 Bit 序列:", watermark_bits[:64])`}
                </pre>
              </div>

              <div style={{ textAlign: 'right', marginTop: '8px' }}>
                <button 
                  className="btn-primary" 
                  onClick={() => setShowForensicModal(false)}
                  style={{ padding: '8px 22px', fontSize: '0.85rem' }}
                >
                  关闭报告
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
