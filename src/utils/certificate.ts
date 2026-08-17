/**
 * Digital Copyright Forensic Certificate Card Generator
 * Renders a high-resolution certificate card on Canvas.
 */

export interface CertificateData {
  certId: string;
  thumbnailUrl: string;
  extractedPayload: string;
  algorithms: string[];
  confidenceScore: string;
  berScore: string;
  timestamp: string;
  securityKeyHash: string;
  language?: 'zh' | 'en';
}

export async function generateCertificateCard(data: CertificateData): Promise<string> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  // High-res 1200 x 1600 certificate dimensions
  const width = 1200;
  const height = 1600;
  canvas.width = width;
  canvas.height = height;

  const isEn = data.language === 'en';

  // 1. Dark Tech/Glassmorphic Gradient Background
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#090d16');
  bgGrad.addColorStop(0.5, '#0f172a');
  bgGrad.addColorStop(1, '#080c14');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // 2. Premium Outer Gold/Indigo Border with Corner Accents
  ctx.strokeStyle = 'rgba(99, 102, 241, 0.4)';
  ctx.lineWidth = 4;
  ctx.strokeRect(30, 30, width - 60, height - 60);

  ctx.strokeStyle = 'rgba(234, 179, 8, 0.6)';
  ctx.lineWidth = 2;
  ctx.strokeRect(40, 40, width - 80, height - 80);

  // Decorative Corner Crosses
  const drawCorner = (x: number, y: number) => {
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 15, y);
    ctx.lineTo(x + 15, y);
    ctx.moveTo(x, y - 15);
    ctx.lineTo(x, y + 15);
    ctx.stroke();
  };
  drawCorner(40, 40);
  drawCorner(width - 40, 40);
  drawCorner(40, height - 40);
  drawCorner(width - 40, height - 40);

  // 3. Certificate Header
  ctx.textAlign = 'center';
  ctx.fillStyle = '#818cf8';
  ctx.font = 'bold 20px "Segoe UI", sans-serif';
  ctx.letterSpacing = '4px';
  ctx.fillText(isEn ? 'OFFICIAL FORENSIC IDENTIFICATION CERTIFICATE' : '数字版权与防伪隐形盲水印司法存证报告', width / 2, 100);

  ctx.fillStyle = '#f8fafc';
  ctx.font = '900 42px "Segoe UI", sans-serif';
  ctx.letterSpacing = '2px';
  ctx.fillText(isEn ? 'DIGITAL COPYRIGHT CERTIFICATE' : '数字版权确权证书', width / 2, 160);

  // Cert ID & Timestamp Badge
  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 18px monospace';
  ctx.fillText(`CERTIFICATE ID: ${data.certId}   |   DATE: ${data.timestamp}`, width / 2, 205);

  // Divider Line
  const divGrad = ctx.createLinearGradient(100, 230, width - 100, 230);
  divGrad.addColorStop(0, 'rgba(99, 102, 241, 0)');
  divGrad.addColorStop(0.5, 'rgba(99, 102, 241, 0.8)');
  divGrad.addColorStop(1, 'rgba(99, 102, 241, 0)');
  ctx.strokeStyle = divGrad;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(100, 230);
  ctx.lineTo(width - 100, 230);
  ctx.stroke();

  // 4. Image Thumbnail with Shadow & Frame
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = data.thumbnailUrl;
    });

    const thumbW = 560;
    const thumbH = 400;
    const thumbX = (width - thumbW) / 2;
    const thumbY = 270;

    // Draw Thumbnail Box Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(thumbX, thumbY, thumbW, thumbH);

    // Calculate aspect fit
    const imgAspect = img.naturalWidth / img.naturalHeight;
    let drawW = thumbW;
    let drawH = thumbW / imgAspect;
    if (drawH > thumbH) {
      drawH = thumbH;
      drawW = thumbH * imgAspect;
    }
    const drawX = thumbX + (thumbW - drawW) / 2;
    const drawY = thumbY + (thumbH - drawH) / 2;

    ctx.drawImage(img, drawX, drawY, drawW, drawH);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    ctx.strokeRect(thumbX, thumbY, thumbW, thumbH);
  } catch (e) {
    // Fallback if image load fails
  }

  // 5. Extracted Watermark Details Card
  const cardY = 720;
  const cardW = width - 180;
  const cardX = 90;
  const cardH = 460;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
  ctx.fillRect(cardX, cardY, cardW, cardH);
  ctx.strokeStyle = 'rgba(99, 102, 241, 0.3)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(cardX, cardY, cardW, cardH);

  ctx.textAlign = 'left';

  // Section 1: Extracted Payload
  ctx.fillStyle = '#a5b4fc';
  ctx.font = 'bold 20px "Segoe UI", sans-serif';
  ctx.fillText(isEn ? '1. EXTRACTED PAYLOAD CONTENT' : '一、 隐形盲水印提取还原内容 (Verified Payload):', cardX + 30, cardY + 50);

  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 28px monospace';
  ctx.fillText(data.extractedPayload || 'N/A', cardX + 30, cardY + 95);

  // Section 2: Confidence & BER Metrics
  ctx.fillStyle = '#a5b4fc';
  ctx.font = 'bold 20px "Segoe UI", sans-serif';
  ctx.fillText(isEn ? '2. FORENSIC CONFIDENCE & BIT ERROR RATE (BER)' : '二、 匹配置信度与特征误码率 (Forensic Accuracy):', cardX + 30, cardY + 160);

  ctx.fillStyle = '#eab308';
  ctx.font = 'bold 24px "Segoe UI", sans-serif';
  ctx.fillText(`${data.confidenceScore}  (BER: ${data.berScore})`, cardX + 30, cardY + 200);

  // Section 3: Algorithms & Channel
  ctx.fillStyle = '#a5b4fc';
  ctx.font = 'bold 20px "Segoe UI", sans-serif';
  ctx.fillText(isEn ? '3. EMBEDDING DOMAIN & ALGORITHMS' : '三、 物理嵌入通道与算法组合 (Algorithm Domain):', cardX + 30, cardY + 265);

  ctx.fillStyle = '#f1f5f9';
  ctx.font = '600 20px "Segoe UI", sans-serif';
  ctx.fillText(data.algorithms.join('  +  '), cardX + 30, cardY + 305);

  // Section 4: Crypto Hash
  ctx.fillStyle = '#a5b4fc';
  ctx.font = 'bold 20px "Segoe UI", sans-serif';
  ctx.fillText(isEn ? '4. SECURITY HASH & SEEDED KEY PROOF' : '四、 防伪签名哈希与密匙指纹 (Security Proof):', cardX + 30, cardY + 370);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 18px monospace';
  ctx.fillText(`SHA-256 SEED HASH: ${data.securityKeyHash}`, cardX + 30, cardY + 410);

  // 6. Holographic Stamp Seal (Right Bottom)
  const sealX = width - 230;
  const sealY = height - 260;
  const sealRadius = 90;

  ctx.save();
  ctx.beginPath();
  ctx.arc(sealX, sealY, sealRadius, 0, Math.PI * 2);
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(sealX, sealY, sealRadius - 10, 0, Math.PI * 2);
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ef4444';
  ctx.font = 'bold 16px "Segoe UI", sans-serif';
  ctx.fillText(isEn ? 'VERIFIED' : '数字存证', sealX, sealY - 30);
  ctx.font = '900 24px "Segoe UI", sans-serif';
  ctx.fillText(isEn ? 'AUTHENTIC' : '确权通过', sealX, sealY + 8);
  ctx.font = 'bold 13px monospace';
  ctx.fillText('FORENSIC LAB', sealX, sealY + 40);
  ctx.restore();

  // 7. Footer Legal Notes
  ctx.textAlign = 'left';
  ctx.fillStyle = '#64748b';
  ctx.font = '15px "Segoe UI", sans-serif';
  const footerText1 = isEn 
    ? 'This certificate is generated via standard discrete cosine transform (DCT) / wavelet transform (DWT) forensic analysis.' 
    : '声明：本存证报告通过公开离散余弦变换 (DCT) 与小波变换 (DWT) 频域特征多数表决提取生成，具备第三方可复现性。';
  const footerText2 = isEn
    ? 'All mathematical formulas are compliant with open-source verification protocols.'
    : '提取结果由隐形盲水印大师引擎独立演算输出，可作为数字资产权属举证与维权参考依据。';
  ctx.fillText(footerText1, 90, height - 170);
  ctx.fillText(footerText2, 90, height - 140);

  return canvas.toDataURL('image/png');
}
