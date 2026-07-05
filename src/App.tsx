import React, { useState, useRef, useEffect } from 'react';
import { 
  Shield, 
  Image as ImageIcon, 
  Unlock, 
  Settings, 
  HelpCircle, 
  Download, 
  RefreshCw, 
  AlertTriangle, 
  Eye, 
  FileText, 
  Sparkles,
  CheckCircle,
  Activity,
  Sliders,
  Maximize2
} from 'lucide-react';

// Algorithms metadata
const ALGORITHMS = [
  {
    id: 'dct',
    name: '频域 DCT 扩频水印 (推荐)',
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
    desc: '经典的隐写术，利用伪随机密钥挑选像素并微调其最低有效位。完全无痕，容量极大，但对有损 JPEG 压缩较为敏感。',
    defaultStrength: 5,
    minStrength: 1,
    maxStrength: 15,
    unit: '冗余副本数'
  }
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'embed' | 'extract' | 'simulator' | 'help'>('embed');
  const [selectedAlgo, setSelectedAlgo] = useState('dct');
  const [watermarkText, setWatermarkText] = useState('Secure Watermark 2026');
  const [securityKey, setSecurityKey] = useState('antigravity_safe');
  const [strength, setStrength] = useState(25);

  // Images state
  const [sourceImgUrl, setSourceImgUrl] = useState<string | null>(null);
  const [watermarkedImgUrl, setWatermarkedImgUrl] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState<string | null>(null);

  // Robustness Simulator state
  const [simCrop, setSimCrop] = useState(false);
  const [simCropPct, setSimCropPct] = useState(20);
  const [simJpeg, setSimJpeg] = useState(false);
  const [simJpegQual, setSimJpegQual] = useState(40);
  const [simNoise, setSimNoise] = useState(false);
  const [simNoiseLevel, setSimNoiseLevel] = useState(15);
  const [simResultImgUrl, setSimResultImgUrl] = useState<string | null>(null);
  const [simExtractedText, setSimExtractedText] = useState<string | null>(null);

  // Processing indicators
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const extractInputRef = useRef<HTMLInputElement>(null);

  // Sync strength slider default when algorithm changes
  useEffect(() => {
    const algo = ALGORITHMS.find(a => a.id === selectedAlgo);
    if (algo) {
      setStrength(algo.defaultStrength);
    }
  }, [selectedAlgo]);

  // Utility: Run background task in Web Worker to prevent UI blocking
  const runWorkerTask = (data: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./workers/watermark.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => {
        if (e.data.success) {
          resolve(e.data);
        } else {
          reject(new Error(e.data.error));
        }
        worker.terminate();
      };
      worker.onerror = (err) => {
        reject(err);
        worker.terminate();
      };
      worker.postMessage(data);
    });
  };

  // Utility: Extract ImageData from Image URL
  const getImageDataFromUrl = (url: string): Promise<ImageData> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('无法创建 Canvas 2D 上下文'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
      };
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = url;
    });
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
      } else {
        setWatermarkedImgUrl(url);
        setExtractedText(null);
      }
    };
    reader.readAsDataURL(file);
  };

  // Core action: Embed Watermark
  const handleEmbed = async () => {
    if (!sourceImgUrl) return;
    setIsProcessing(true);
    setStatusMsg('正在将图片转换为频域信道并嵌入隐藏水印...');

    try {
      const imgData = await getImageDataFromUrl(sourceImgUrl);
      const res = await runWorkerTask({
        type: 'embed',
        pixels: imgData.data.buffer,
        width: imgData.width,
        height: imgData.height,
        text: watermarkText,
        key: securityKey,
        algorithm: selectedAlgo,
        strength
      });

      const outputImgData = new ImageData(new Uint8ClampedArray(res.pixels), imgData.width, imgData.height);
      setWatermarkedImgUrl(imageDataToUrl(outputImgData));
      setStatusMsg('隐藏水印嵌入完成！');
      setTimeout(() => setStatusMsg(''), 2000);
    } catch (err: any) {
      alert(`嵌入失败: ${err.message}`);
      setStatusMsg('');
    } finally {
      setIsProcessing(false);
    }
  };

  // Core action: Extract Watermark
  const handleExtract = async () => {
    if (!watermarkedImgUrl) return;
    setIsProcessing(true);
    setStatusMsg('正在执行频域搜索与同步校验提取水印...');

    try {
      const imgData = await getImageDataFromUrl(watermarkedImgUrl);
      const res = await runWorkerTask({
        type: 'extract',
        pixels: imgData.data.buffer,
        width: imgData.width,
        height: imgData.height,
        key: securityKey,
        algorithm: selectedAlgo,
        strength
      });

      setExtractedText(res.text);
      setStatusMsg('探测与反向分析完成！');
      setTimeout(() => setStatusMsg(''), 2000);
    } catch (err: any) {
      alert(`提取失败: ${err.message}`);
      setStatusMsg('');
    } finally {
      setIsProcessing(false);
    }
  };

  // Simulator action: Apply attacks and test extraction
  const handleSimulateAttackAndExtract = async () => {
    if (!watermarkedImgUrl) return;
    setIsProcessing(true);
    setStatusMsg('正在生成模拟信道攻击图像...');

    try {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = watermarkedImgUrl!;
      });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      // 1. Calculate size after Crop Attack
      let startX = 0, startY = 0;
      let targetWidth = img.naturalWidth;
      let targetHeight = img.naturalHeight;

      if (simCrop) {
        // Crop outer boundary (e.g. crop from center)
        const cropScale = 1 - simCropPct / 100;
        targetWidth = Math.floor(img.naturalWidth * cropScale);
        targetHeight = Math.floor(img.naturalHeight * cropScale);
        startX = Math.floor((img.naturalWidth - targetWidth) / 2);
        startY = Math.floor((img.naturalHeight - targetHeight) / 2);
      }

      canvas.width = targetWidth;
      canvas.height = targetHeight;

      // Draw possibly cropped image
      ctx.drawImage(
        img,
        startX, startY, targetWidth, targetHeight,
        0, 0, targetWidth, targetHeight
      );

      let attackImgData = ctx.getImageData(0, 0, targetWidth, targetHeight);

      // 2. Add Noise Attack (Gaussian/Random noise)
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

      // 3. JPEG Compression Attack (Convert format to lossy JPEG)
      let finalImgUrl = '';
      if (simJpeg) {
        finalImgUrl = canvas.toDataURL('image/jpeg', simJpegQual / 100);
      } else {
        finalImgUrl = canvas.toDataURL('image/png');
      }

      setSimResultImgUrl(finalImgUrl);
      setStatusMsg('攻击模拟图已生成，正在尝试提取隐藏水印...');

      // 4. Extract from Attacked Image
      const attackedData = await getImageDataFromUrl(finalImgUrl);
      const res = await runWorkerTask({
        type: 'extract',
        pixels: attackedData.data.buffer,
        width: attackedData.width,
        height: attackedData.height,
        key: securityKey,
        algorithm: selectedAlgo,
        strength
      });

      setSimExtractedText(res.text);
      setStatusMsg('模拟测试与提取完成！');
      setTimeout(() => setStatusMsg(''), 2000);
    } catch (err: any) {
      alert(`测试失败: ${err.message}`);
      setStatusMsg('');
    } finally {
      setIsProcessing(false);
    }
  };

  const selectedAlgoObj = ALGORITHMS.find(a => a.id === selectedAlgo)!;

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
          <span>添加水印</span>
        </button>
        <button 
          className={`tab-btn ${activeTab === 'extract' ? 'active' : ''}`}
          onClick={() => setActiveTab('extract')}
        >
          <Unlock size={20} />
          <span>反向探测</span>
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
            <label className="form-label">1. 选择隐藏水印方式</label>
            <div className="algo-grid">
              {ALGORITHMS.map((algo) => (
                <div 
                  key={algo.id}
                  className={`algo-card ${selectedAlgo === algo.id ? 'selected' : ''}`}
                  onClick={() => setSelectedAlgo(algo.id)}
                >
                  <input 
                    type="radio" 
                    name="algo" 
                    className="algo-radio"
                    checked={selectedAlgo === algo.id}
                    onChange={() => setSelectedAlgo(algo.id)} 
                  />
                  <div className="algo-info">
                    <div className="algo-name">
                      {algo.name}
                      <span className={`algo-badge ${algo.badgeType}`}>{algo.badge}</span>
                    </div>
                    <div className="algo-desc">{algo.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">2. 水印参数配置</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label className="form-label" style={{ fontSize: '0.75rem', color: '#94a3b8' }}>水印文字</label>
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
                    嵌入强度 ({selectedAlgoObj.unit}): {strength}
                  </label>
                  <div className="slider-container" style={{ height: '50px' }}>
                    <input 
                      type="range" 
                      className="range-slider" 
                      min={selectedAlgoObj.minStrength} 
                      max={selectedAlgoObj.maxStrength} 
                      value={strength} 
                      onChange={(e) => setStrength(Number(e.target.value))} 
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">3. 上传原始图片</label>
            {!sourceImgUrl ? (
              <div className="upload-zone" onClick={() => fileInputRef.current?.click()}>
                <ImageIcon size={40} className="upload-icon" />
                <span className="upload-text">点击或拖拽上传图片</span>
                <span className="upload-hint">支持 PNG, JPG, WebP 格式</span>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  style={{ display: 'none' }} 
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e, 'source')}
                />
              </div>
            ) : (
              <div className="preview-container">
                <img src={sourceImgUrl} className="preview-img" alt="Source" />
                <button className="remove-btn" onClick={() => setSourceImgUrl(null)}>×</button>
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
              <span>{isProcessing ? '正在生成隐形水印...' : '开始生成隐藏水印图片'}</span>
            </button>
          )}

          {watermarkedImgUrl && (
            <div className="result-box" style={{ marginTop: '24px' }}>
              <div className="result-header" style={{ color: '#34d399' }}>
                <CheckCircle size={18} />
                <span>水印生成成功！已与背景底层像素融合</span>
              </div>
              <div className="preview-container" style={{ margin: '8px 0' }}>
                <img src={watermarkedImgUrl} className="preview-img" alt="Watermarked" />
              </div>
              <a 
                href={watermarkedImgUrl} 
                download={`watermarked_${selectedAlgo}_${Date.now()}.png`}
                className="btn-primary" 
                style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', boxShadow: '0 4px 20px rgba(16, 185, 129, 0.3)' }}
              >
                <Download size={18} />
                <span>下载/保存水印图片</span>
              </a>
            </div>
          )}
        </div>
      )}

      {activeTab === 'extract' && (
        <div className="glass-container">
          <div className="form-group">
            <label className="form-label">1. 配置检测参数 (必须与嵌入时完全一致)</label>
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
                <label className="form-label" style={{ fontSize: '0.75rem', color: '#94a3b8' }}>水印算法</label>
                <select 
                  className="input-text" 
                  value={selectedAlgo} 
                  onChange={(e) => setSelectedAlgo(e.target.value)}
                  style={{ background: 'rgba(15, 23, 42, 0.85)', cursor: 'pointer' }}
                >
                  {ALGORITHMS.map(a => (
                    <option key={a.id} value={a.id}>{a.name.split(' ')[0]}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">2. 上传待检测图片</label>
            {!watermarkedImgUrl ? (
              <div className="upload-zone" onClick={() => extractInputRef.current?.click()}>
                <ImageIcon size={40} className="upload-icon" />
                <span className="upload-text">选择需要提取水印的图片</span>
                <span className="upload-hint">支持已被裁剪、压缩或微信转发下载的图片</span>
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
            <button 
              className="btn-primary" 
              onClick={handleExtract}
              disabled={isProcessing}
            >
              {isProcessing ? <div className="spinner" /> : <Unlock size={18} />}
              <span>{isProcessing ? '正在反向析出数字特征...' : '执行反向探测提取'}</span>
            </button>
          )}

          {extractedText !== null && (
            <div className="result-box">
              <div className="result-header">
                <FileText size={18} />
                <span>逆向还原提取结果：</span>
              </div>
              <div className={`result-text ${extractedText.startsWith('提取失败') ? 'failure' : 'success'}`}>
                {extractedText}
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
              无需手动打包和外部图片工具，在 app 内直接模拟水印图片遭受各种网络压缩或裁剪攻击，一键验证抗性。
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
                <label className="form-label">1. 配置模拟攻击信道</label>
                
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

                {/* Attack 2: JPEG Lossy compression */}
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

                {/* Attack 3: Gaussian Noise */}
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

                <button 
                  className="btn-primary"
                  onClick={handleSimulateAttackAndExtract}
                  disabled={isProcessing}
                >
                  <RefreshCw size={18} className={isProcessing ? 'upload-icon' : ''} />
                  <span>执行攻击并探测提取</span>
                </button>
              </div>

              {/* Right Column: Attacked Result & Extracted Info */}
              <div>
                <label className="form-label">2. 攻击效果与提取结果</label>
                
                {simResultImgUrl ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div className="preview-container" style={{ margin: 0 }}>
                      <span style={{ position: 'absolute', top: '8px', left: '8px', background: 'rgba(0,0,0,0.6)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', color: '#ef4444' }}>
                        受攻击渲染效果
                      </span>
                      <img src={simResultImgUrl} className="preview-img" alt="Attacked Result" />
                    </div>

                    {simExtractedText !== null && (
                      <div className="result-box" style={{ margin: 0 }}>
                        <div className="result-header">
                          <Unlock size={18} />
                          <span>攻击后提取测试结果：</span>
                        </div>
                        <div className={`result-text ${simExtractedText.startsWith('提取失败') ? 'failure' : 'success'}`}>
                          {simExtractedText}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                          当前提取算法: <strong style={{ color: '#ffffff' }}>{selectedAlgoObj.name.split(' ')[0]}</strong>，使用安全密钥进行特征重组。
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
            <h3 style={{ fontSize: '1.25rem', fontWeight: '800' }}>隐藏盲水印算法防御原理解析</h3>
          </div>

          <div className="faq-card">
            <div className="faq-q">🤔 什么是隐形水印？</div>
            <div className="faq-a">
              隐形水印（Blind Watermark）不同于传统的视觉可见水印，它通过高级数学变换（如离散余弦变换 DCT、离散傅里叶变换 DFT）将标识信息编码并融合进图片的底层像素中。肉眼看起来与原图完全无异，但可以通过特定的反向算法提取出来。
            </div>
          </div>

          <div className="faq-card">
            <div className="faq-q">🛡️ 为什么图片遭受“剪切”和“压缩”后水印依然存在？</div>
            <div className="faq-a">
              本工具采用了多种前沿抗攻击的数学编码方案：
              <br />
              1. <strong>离散频域嵌入 (DCT/DWT)</strong>：水印并不存在于某几个具体像素点，而是分布式存在于图像中频波形系数中，而压缩通常只损失超高频波形细节，因此压缩后水印依然能完整重组。
              <br />
              2. <strong>冗余多数表决机制</strong>：水印字符被转为二进制位流，并在整张图中平铺重复嵌入数百次。当图片被裁切掉一部分时，只要剩余的部分包含几组完整的冗余序列，就可以通过“多数表决”算法纠正缺失的位，实现100%还原。
              <br />
              3. <strong>网格滑窗自动搜寻</strong>：对于裁切带来的像素块错位，反向探测器会自动遍历所有的对齐偏移，寻找同步校验头，从而准确对齐解码。
            </div>
          </div>

          <div className="faq-card">
            <div className="faq-q">🔑 安全密钥 (Key) 起到什么作用？</div>
            <div className="faq-a">
              安全密钥充当了水印像素挑选与频率调制的高级哈希种子。没有密钥的人即使知道算法也无法解出水印，因为它呈现出加密杂凑波形状态，保证了版权持有者的防伪独占性。
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
    </div>
  );
}
