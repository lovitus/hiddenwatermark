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
  Sliders
} from 'lucide-react';

// Vite inlined worker import
import WatermarkWorker from './workers/watermark.worker?worker&inline';

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
  
  // Extraction results mapping: { [algoId]: extractedText }
  const [extractionResults, setExtractionResults] = useState<Record<string, string>>({});

  // Robustness Simulator state
  const [simCrop, setSimCrop] = useState(false);
  const [simCropPct, setSimCropPct] = useState(20);
  const [simJpeg, setSimJpeg] = useState(false);
  const [simJpegQual, setSimJpegQual] = useState(40);
  const [simNoise, setSimNoise] = useState(false);
  const [simNoiseLevel, setSimNoiseLevel] = useState(15);
  const [simResultImgUrl, setSimResultImgUrl] = useState<string | null>(null);
  const [simResults, setSimResults] = useState<Record<string, string>>({});

  // Processing indicators
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

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

  // Utility: Run background task in Web Worker to prevent UI blocking
  const runWorkerTask = (data: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      try {
        // Instantiate using Vite's inlined worker bundler
        const worker = new WatermarkWorker();
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
      } catch (err) {
        reject(err);
      }
    });
  };

  // Utility: Extract ImageData from Image URL with automatic size limiting (max 1024px)
  const getImageDataFromUrl = (url: string): Promise<ImageData> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const MAX_SIZE = 1024;
        let width = img.naturalWidth;
        let height = img.naturalHeight;

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

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('无法创建 Canvas 2D 上下文'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(ctx.getImageData(0, 0, width, height));
      };
      img.onerror = () => reject(new Error('图片加载或解码异常，请确认图片格式是否正确'));
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
        setExtractionResults({});
      }
    };
    reader.onerror = () => {
      alert("读取图片文件异常，请重新选择");
    };
    reader.readAsDataURL(file);
  };

  // Core action: Embed Watermark (Sequentially embeds all selected algorithms)
  const handleEmbed = async () => {
    if (!sourceImgUrl) return;
    if (selectedAlgos.length === 0) {
      alert("请至少勾选一种隐藏水印方式");
      return;
    }
    setIsProcessing(true);
    setStatusMsg(`正在按顺序进行多重水印叠加 (${selectedAlgos.join(' -> ')})...`);

    try {
      const imgData = await getImageDataFromUrl(sourceImgUrl);
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

      const outputImgData = new ImageData(new Uint8ClampedArray(res.pixels), imgData.width, imgData.height);
      setWatermarkedImgUrl(imageDataToUrl(outputImgData));
      setStatusMsg('多重隐藏水印嵌入完成！');
      setTimeout(() => setStatusMsg(''), 2000);
    } catch (err: any) {
      alert(`嵌入失败: ${err.message}`);
      setStatusMsg('');
    } finally {
      setIsProcessing(false);
    }
  };

  // Core action: Extract Watermark from all selected algorithms
  const handleExtract = async () => {
    if (!watermarkedImgUrl) return;
    if (selectedAlgos.length === 0) {
      alert("请至少勾选一种检测算法");
      return;
    }
    setIsProcessing(true);
    setStatusMsg('正在启动后台信道逆向特征探测分析...');

    try {
      const imgData = await getImageDataFromUrl(watermarkedImgUrl);
      const res = await runWorkerTask({
        type: 'extract',
        pixels: imgData.data.buffer,
        width: imgData.width,
        height: imgData.height,
        key: securityKey,
        algorithms: selectedAlgos,
        strength
      });

      setExtractionResults(res.results);
      setStatusMsg('多算法并行探测完成！');
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

      // 2. Add Noise Attack
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

      // 3. JPEG Compression Attack
      let finalImgUrl = '';
      if (simJpeg) {
        finalImgUrl = canvas.toDataURL('image/jpeg', simJpegQual / 100);
      } else {
        finalImgUrl = canvas.toDataURL('image/png');
      }

      setSimResultImgUrl(finalImgUrl);
      setStatusMsg('模拟信道受损图已生成，正在交叉提取多重水印...');

      // 4. Extract from Attacked Image
      const attackedData = await getImageDataFromUrl(finalImgUrl);
      const res = await runWorkerTask({
        type: 'extract',
        pixels: attackedData.data.buffer,
        width: attackedData.width,
        height: attackedData.height,
        key: securityKey,
        algorithms: selectedAlgos,
        strength
      });

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
            <label className="form-label">1. 选择隐藏水印方式 (可多选叠加，LSB不建议与其他频域叠用)</label>
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
              <span>{isProcessing ? '正在依次生成并融合多重隐藏水印...' : '开始生成隐藏水印图片'}</span>
            </button>
          )}

          {watermarkedImgUrl && (
            <div className="result-box" style={{ marginTop: '24px' }}>
              <div className="result-header" style={{ color: '#34d399' }}>
                <CheckCircle size={18} />
                <span>多重水印叠加融合成功！</span>
              </div>
              <div className="preview-container" style={{ margin: '8px 0' }}>
                <img src={watermarkedImgUrl} className="preview-img" alt="Watermarked" />
              </div>
              <a 
                href={watermarkedImgUrl} 
                download={`watermarked_multi_${Date.now()}.png`}
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
                <label className="form-label" style={{ fontSize: '0.75rem', color: '#94a3b8' }}>待选检测算法</label>
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
            <button 
              className="btn-primary" 
              onClick={handleExtract}
              disabled={isProcessing}
            >
              {isProcessing ? <div className="spinner" /> : <Unlock size={18} />}
              <span>{isProcessing ? '正在并行解析多重物理特征...' : '执行联合反向探测提取'}</span>
            </button>
          )}

          {Object.keys(extractionResults).length > 0 && (
            <div className="result-box">
              <div className="result-header">
                <FileText size={18} />
                <span>各算法联合还原检测结果：</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {Object.entries(extractionResults).map(([algoId, res]) => {
                  const algo = ALGORITHMS.find(a => a.id === algoId)!;
                  const isSuccess = !res.startsWith('提取失败') && !res.startsWith('检测出错');
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
                      <div style={{ fontSize: '0.8rem', fontWeight: '700', color: '#cbd5e1', marginBottom: '4px' }}>
                        {algo.name}
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
    </div>
  );
}
