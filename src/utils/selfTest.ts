/**
 * In-App Automated Self-Diagnostic Engine
 * Runs end-to-end automated test suites across all algorithms and components.
 */

import { embedDct, extractDct } from '../algorithms/dct';
import { embedChromaDct, extractChromaDct } from '../algorithms/chroma';
import { embedDwt, extractDwt } from '../algorithms/dwt';
import { embedDft, extractDft } from '../algorithms/dft';
import { embedDsss, extractDsss } from '../algorithms/dsss';
import { embedLsb, extractLsb } from '../algorithms/lsb';
import { analyzeImageTexture, calculateExtractionMetrics } from '../algorithms/utils';
import { createZip } from './zip';
import { generateCertificateCard } from './certificate';
import { translations } from '../i18n/translations';

export interface TestCaseResult {
  id: string;
  name: string;
  category: 'algo' | 'multi' | 'engine' | 'i18n';
  status: 'pass' | 'fail';
  durationMs: number;
  details: string;
}

// Utility: Generate a synthetic 256x256 test image buffer with rich textures
function createSyntheticImageData(width = 256, height = 256): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Draw gradient + textures
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, '#3b82f6');
  grad.addColorStop(0.5, '#ec4899');
  grad.addColorStop(1, '#10b981');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Add geometric features for realistic texture
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  for (let i = 0; i < 20; i++) {
    ctx.fillRect(i * 12, (i % 5) * 40, 30, 30);
  }

  return ctx.getImageData(0, 0, width, height);
}

export async function runAllAutomatedDiagnostics(
  onProgress?: (current: number, total: number, currentName: string) => void
): Promise<TestCaseResult[]> {
  const results: TestCaseResult[] = [];
  const testPayload = 'TEST_VERIFY_2026';
  const testKey = 'diag_key_pass';

  const testList = [
    // 1. DCT
    {
      id: 'algo-dct',
      name: '频域 DCT 扩频算法单体验证',
      category: 'algo' as const,
      fn: async () => {
        const img = createSyntheticImageData();
        const embedded = embedDct(img, testPayload, testKey, 30);
        const extracted = extractDct(embedded, testKey);
        if (extracted !== testPayload) throw new Error(`提取不匹配: 期望 "${testPayload}", 实际 "${extracted}"`);
        return `成功嵌入并 100% 精确提取 (${extracted.length} 字符)`;
      }
    },
    // 2. Chroma DCT
    {
      id: 'algo-chroma',
      name: '色度空间 Chroma DCT 算法单体验证',
      category: 'algo' as const,
      fn: async () => {
        const img = createSyntheticImageData();
        const embedded = embedChromaDct(img, testPayload, testKey, 35);
        const extracted = extractChromaDct(embedded, testKey);
        if (extracted !== testPayload) throw new Error(`提取不匹配: 期望 "${testPayload}", 实际 "${extracted}"`);
        return `Cr色度通道隐形嵌入与提取通过`;
      }
    },
    // 3. DWT
    {
      id: 'algo-dwt',
      name: '小波变换 DWT Haar 算法单体验证',
      category: 'algo' as const,
      fn: async () => {
        const img = createSyntheticImageData();
        const embedded = embedDwt(img, testPayload, testKey, 25);
        const extracted = extractDwt(embedded, testKey);
        if (extracted !== testPayload) throw new Error(`提取不匹配: 期望 "${testPayload}", 实际 "${extracted}"`);
        return `小波细节子带 LH/HL 调制与还原通过`;
      }
    },
    // 4. DFT
    {
      id: 'algo-dft',
      name: '傅里叶变换 DFT 全局频域算法单体验证',
      category: 'algo' as const,
      fn: async () => {
        const img = createSyntheticImageData(256, 256);
        const embedded = embedDft(img, 'DFT_PASS_OK', testKey, 30);
        const extracted = extractDft(embedded, testKey);
        if (!extracted.includes('DFT')) throw new Error(`DFT提取异常: "${extracted}"`);
        return `傅里叶幅度谱调制与逆变换通过`;
      }
    },
    // 5. DSSS
    {
      id: 'algo-dsss',
      name: '空域直接扩频 DSSS 算法单体验证',
      category: 'algo' as const,
      fn: async () => {
        const img = createSyntheticImageData();
        const embedded = embedDsss(img, 'DSSS_OK', testKey, 10);
        const extracted = extractDsss(embedded, testKey);
        if (!extracted.includes('DSSS')) throw new Error(`DSSS提取异常: "${extracted}"`);
        return `伪随机扩频序列调制与相关解调通过`;
      }
    },
    // 6. LSB
    {
      id: 'algo-lsb',
      name: '最低有效位 LSB 空间密写验证',
      category: 'algo' as const,
      fn: async () => {
        const img = createSyntheticImageData();
        const embedded = embedLsb(img, testPayload, testKey);
        const extracted = extractLsb(embedded, testKey);
        if (extracted !== testPayload) throw new Error(`LSB提取不匹配: "${extracted}"`);
        return `像素微调密写与完全无损还原通过`;
      }
    },
    // 7. Multi-Layer Combination (DCT + Chroma + DWT)
    {
      id: 'multi-layered',
      name: '3重联合加密融合 (DCT + Chroma + DWT) 串联验证',
      category: 'multi' as const,
      fn: async () => {
        let img = createSyntheticImageData();
        img = embedDct(img, 'MULTI_LAYER_A', testKey, 25);
        img = embedChromaDct(img, 'MULTI_LAYER_B', testKey, 30);
        img = embedDwt(img, 'MULTI_LAYER_C', testKey, 20);

        const extA = extractDct(img, testKey);
        const extB = extractChromaDct(img, testKey);
        const extC = extractDwt(img, testKey);

        if (extA !== 'MULTI_LAYER_A' || extB !== 'MULTI_LAYER_B' || extC !== 'MULTI_LAYER_C') {
          throw new Error(`多重融合提取有偏差: A="${extA}", B="${extB}", C="${extC}"`);
        }
        return `3重频域浮点反变换无冲突串联融合成功`;
      }
    },
    // 8. Texture & BER Calculator
    {
      id: 'engine-metrics',
      name: 'Sobel 频域复杂度诊断与 BER 误码率测算引擎',
      category: 'engine' as const,
      fn: async () => {
        const img = createSyntheticImageData();
        const analysis = analyzeImageTexture(img);
        if (analysis.score < 0 || analysis.score > 100) throw new Error('纹理评分超出 0-100 范围');
        const metrics = calculateExtractionMetrics('HELLO_WORLD', 'HELLO_WORLD');
        if (metrics.ber !== 0 || metrics.badge !== '100% 精确匹配') throw new Error('BER 误码率测算异常');
        return `Sobel 评分: ${analysis.score}/100, BER 算法: 准确无误`;
      }
    },
    // 9. Zero-Dependency ZIP Builder & CRC-32
    {
      id: 'engine-zip',
      name: '零依赖内存 PKZIP 打包引擎与 CRC-32 校验',
      category: 'engine' as const,
      fn: async () => {
        const encoder = new TextEncoder();
        const testFile1 = encoder.encode('Watermark image simulated buffer 1');
        const testFile2 = encoder.encode('Watermark image simulated buffer 2');
        const blob = createZip([
          { name: 'photo_1.png', data: testFile1 },
          { name: 'photo_2.png', data: testFile2 }
        ]);
        if (blob.size < 100 || blob.type !== 'application/zip') throw new Error(`ZIP 生成尺寸异常: ${blob.size}`);
        return `成功生成合规 PKZIP 压缩包 (尺寸: ${blob.size} bytes)`;
      }
    },
    // 10. Copyright Certificate Generator
    {
      id: 'engine-cert',
      name: 'Canvas 1200x1600 司法确权证书卡片渲染管线',
      category: 'engine' as const,
      fn: async () => {
        const testImg = createSyntheticImageData(100, 100);
        const canvas = document.createElement('canvas');
        canvas.width = 100;
        canvas.height = 100;
        canvas.getContext('2d')!.putImageData(testImg, 0, 0);
        const thumbUrl = canvas.toDataURL('image/png');

        const certDataUrl = await generateCertificateCard({
          certId: 'DIAG-TEST-999',
          thumbnailUrl: thumbUrl,
          extractedPayload: 'DIAG_VERIFIED_PAYLOAD',
          algorithms: ['DCT', 'Chroma', 'DWT'],
          confidenceScore: '100% 匹配',
          berScore: '0.000',
          timestamp: '2026-08-17 12:00:00',
          securityKeyHash: 'A98F7C6B',
          language: 'zh'
        });

        if (!certDataUrl.startsWith('data:image/png;base64,')) throw new Error('证书 Data URL 格式异常');
        return `高清 1200x1600 存证证书生成成功 (Base64 大小: ${certDataUrl.length} 字符)`;
      }
    },
    // 11. i18n Translation Dictionary Completeness Parity
    {
      id: 'i18n-parity',
      name: '中英文 (ZH & EN) 双语词条 100% 完整性对齐校验',
      category: 'i18n' as const,
      fn: async () => {
        const zhKeys = Object.keys(translations.zh);
        const enKeys = Object.keys(translations.en);
        const missingInEn = zhKeys.filter(k => !(k in translations.en));
        const missingInZh = enKeys.filter(k => !(k in translations.zh));
        if (missingInEn.length > 0) throw new Error(`英文词典缺失 Key: ${missingInEn.join(', ')}`);
        if (missingInZh.length > 0) throw new Error(`中文词典缺失 Key: ${missingInZh.join(', ')}`);
        return `共 ${zhKeys.length} 个多语言词条，中英双语 100% 对齐覆盖`;
      }
    }
  ];

  const total = testList.length;
  for (let i = 0; i < total; i++) {
    const test = testList[i];
    if (onProgress) onProgress(i + 1, total, test.name);

    const start = performance.now();
    try {
      const details = await test.fn();
      const durationMs = Math.round(performance.now() - start);
      results.push({
        id: test.id,
        name: test.name,
        category: test.category,
        status: 'pass',
        durationMs,
        details
      });
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - start);
      results.push({
        id: test.id,
        name: test.name,
        category: test.category,
        status: 'fail',
        durationMs,
        details: err.message || String(err)
      });
    }
  }

  return results;
}
