/**
 * In-App Automated Self-Diagnostic Engine
 * Runs end-to-end automated test suites across all algorithms and components.
 */

import { embedDCT, extractDCT } from '../algorithms/dct';
import { embedChroma, extractChroma } from '../algorithms/chroma';
import { embedDWT, extractDWT } from '../algorithms/dwt';
import { embedDFT, extractDFT } from '../algorithms/dft';
import { embedSpreadSpectrum, extractSpreadSpectrum } from '../algorithms/spreadSpectrum';
import { embedLSB, extractLSB } from '../algorithms/lsb';
import { analyzeImageTexture, calculateExtractionMetrics } from '../algorithms/utils';
import { createZip } from './zip';
import { generateCertificateCard } from './certificate';
import { translations } from '../i18n/translations';

type TFunction = (key: keyof typeof translations['zh'], vars?: Record<string, string | number>) => string;

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
  t: TFunction,
  onProgress?: (current: number, total: number, currentName: string) => void
): Promise<TestCaseResult[]> {
  const results: TestCaseResult[] = [];
  const testPayload = 'TEST_VERIFY_2026';
  const testKey = 'diag_key_pass';

  const testList = [
    // 1. DCT
    {
      id: 'algo-dct',
      name: t('stName_dct'),
      category: 'algo' as const,
      fn: async () => {
        const img = createSyntheticImageData();
        const embedded = embedDCT(img, testPayload, testKey, 30);
        const extracted = extractDCT(embedded, testKey, 30);
        if (extracted !== testPayload) throw new Error(t('stErrMismatch', { expected: testPayload, actual: extracted }));
        return t('stOk_dct', { n: extracted.length });
      }
    },
    // 2. Chroma DCT
    {
      id: 'algo-chroma',
      name: t('stName_chroma'),
      category: 'algo' as const,
      fn: async () => {
        const img = createSyntheticImageData();
        const embedded = embedChroma(img, testPayload, testKey, 35);
        const extracted = extractChroma(embedded, testKey, 35);
        if (extracted !== testPayload) throw new Error(t('stErrMismatch', { expected: testPayload, actual: extracted }));
        return t('stOk_chroma');
      }
    },
    // 3. DWT
    {
      id: 'algo-dwt',
      name: t('stName_dwt'),
      category: 'algo' as const,
      fn: async () => {
        const img = createSyntheticImageData();
        const embedded = embedDWT(img, testPayload, testKey, 25);
        const extracted = extractDWT(embedded, testKey, 25);
        if (extracted !== testPayload) throw new Error(t('stErrMismatch', { expected: testPayload, actual: extracted }));
        return t('stOk_dwt');
      }
    },
    // 4. DFT
    {
      id: 'algo-dft',
      name: t('stName_dft'),
      category: 'algo' as const,
      fn: async () => {
        const img = createSyntheticImageData(256, 256);
        const embedded = embedDFT(img, 'DFT_PASS_OK', testKey, 30);
        const extracted = extractDFT(embedded, testKey, 30);
        if (!extracted.includes('DFT')) throw new Error(t('stErrDft', { actual: extracted }));
        return t('stOk_dft');
      }
    },
    // 5. DSSS
    {
      id: 'algo-dsss',
      name: t('stName_dsss'),
      category: 'algo' as const,
      fn: async () => {
        const img = createSyntheticImageData();
        const embedded = embedSpreadSpectrum(img, 'DSSS_OK', testKey, 25);
        const extracted = extractSpreadSpectrum(embedded, testKey, 25);
        if (!extracted.includes('DSSS')) throw new Error(t('stErrDsss', { actual: extracted }));
        return t('stOk_dsss');
      }
    },
    // 6. LSB
    {
      id: 'algo-lsb',
      name: t('stName_lsb'),
      category: 'algo' as const,
      fn: async () => {
        const img = createSyntheticImageData();
        const embedded = embedLSB(img, testPayload, testKey, 3);
        const extracted = extractLSB(embedded, testKey, 3);
        if (extracted !== testPayload) throw new Error(t('stErrLsb', { actual: extracted }));
        return t('stOk_lsb');
      }
    },
    // 7. Multi-Layer Combination (DCT + Chroma + DWT)
    {
      id: 'multi-layered',
      name: t('stName_multi'),
      category: 'multi' as const,
      fn: async () => {
        let img = createSyntheticImageData();
        img = embedDCT(img, 'MULTI_LAYER_A', testKey, 25);
        img = embedChroma(img, 'MULTI_LAYER_B', testKey, 30);
        img = embedDWT(img, 'MULTI_LAYER_C', testKey, 20);

        const extA = extractDCT(img, testKey, 25);
        const extB = extractChroma(img, testKey, 30);
        const extC = extractDWT(img, testKey, 20);

        if (extA !== 'MULTI_LAYER_A' || extB !== 'MULTI_LAYER_B' || extC !== 'MULTI_LAYER_C') {
          throw new Error(t('stErrMulti', { a: extA, b: extB, c: extC }));
        }
        return t('stOk_multi');
      }
    },
    // 8. Texture & BER Calculator
    {
      id: 'engine-metrics',
      name: t('stName_metrics'),
      category: 'engine' as const,
      fn: async () => {
        const img = createSyntheticImageData();
        const analysis = analyzeImageTexture(img);
        if (analysis.score < 0 || analysis.score > 100) throw new Error(t('stErrScore'));
        const metrics = calculateExtractionMetrics('HELLO_WORLD', 'HELLO_WORLD');
        if (metrics.ber !== 0 || metrics.similarity !== 100) throw new Error(t('stErrBer'));
        return t('stOk_metrics', { score: analysis.score });
      }
    },
    // 9. Zero-Dependency ZIP Builder & CRC-32
    {
      id: 'engine-zip',
      name: t('stName_zip'),
      category: 'engine' as const,
      fn: async () => {
        const encoder = new TextEncoder();
        const testFile1 = encoder.encode('Watermark image simulated buffer 1');
        const testFile2 = encoder.encode('Watermark image simulated buffer 2');
        const blob = createZip([
          { name: 'photo_1.png', data: testFile1 },
          { name: 'photo_2.png', data: testFile2 }
        ]);
        if (blob.size < 100 || blob.type !== 'application/zip') throw new Error(t('stErrZip', { size: blob.size }));
        return t('stOk_zip', { size: blob.size });
      }
    },
    // 10. Copyright Certificate Generator
    {
      id: 'engine-cert',
      name: t('stName_cert'),
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
          confidenceScore: '100%',
          berScore: '0.000',
          timestamp: '2026-08-17 12:00:00',
          securityKeyHash: 'A98F7C6B',
          language: 'zh'
        });

        if (!certDataUrl.startsWith('data:image/png;base64,')) throw new Error(t('stErrCert'));
        return t('stOk_cert', { len: certDataUrl.length });
      }
    },
    // 11. i18n Translation Dictionary Completeness Parity
    {
      id: 'i18n-parity',
      name: t('stName_i18n'),
      category: 'i18n' as const,
      fn: async () => {
        const zhKeys = Object.keys(translations.zh);
        const enKeys = Object.keys(translations.en);
        const missingInEn = zhKeys.filter(k => !(k in translations.en));
        const missingInZh = enKeys.filter(k => !(k in translations.zh));
        if (missingInEn.length > 0) throw new Error(t('stErrMissingEn', { keys: missingInEn.join(', ') }));
        if (missingInZh.length > 0) throw new Error(t('stErrMissingZh', { keys: missingInZh.join(', ') }));
        return t('stOk_i18n', { n: zhKeys.length });
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
