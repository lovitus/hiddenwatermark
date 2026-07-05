import { createPRNG, rgbToYcbcr, ycbcrToRgb, stringToBits, bitsToString, applyHammingEncoding, decodeHammingEncoding, fft2D } from './utils';

const FFT_SIZE = 256; // 256x256 is fast and reliable for mobile devices

export function embedDFT(
  imageData: ImageData,
  text: string,
  key: string,
  strength: number // 10 to 80 (magnitude delta multiplier)
): ImageData {
  const width = imageData.width;
  const height = imageData.height;
  const srcData = imageData.data;
  const dstData = new Uint8ClampedArray(srcData);

  // We need to work on a square power-of-two sub-image.
  // We'll extract the center FFT_SIZE x FFT_SIZE block.
  const startX = Math.floor((width - FFT_SIZE) / 2);
  const startY = Math.floor((height - FFT_SIZE) / 2);

  if (width < FFT_SIZE || height < FFT_SIZE) {
    throw new Error(`图片尺寸过小，宽度和高度必须至少为 ${FFT_SIZE} 像素。`);
  }

  // Convert center block to YCbCr, extract Y
  const yRe = new Float32Array(FFT_SIZE * FFT_SIZE);
  const yIm = new Float32Array(FFT_SIZE * FFT_SIZE);
  const cbChan = new Float32Array(FFT_SIZE * FFT_SIZE);
  const crChan = new Float32Array(FFT_SIZE * FFT_SIZE);

  for (let y = 0; y < FFT_SIZE; y++) {
    for (let x = 0; x < FFT_SIZE; x++) {
      const srcIdx = ((startY + y) * width + (startX + x)) * 4;
      const [yc, cb, cr] = rgbToYcbcr(srcData[srcIdx], srcData[srcIdx + 1], srcData[srcIdx + 2]);
      yRe[y * FFT_SIZE + x] = yc;
      yIm[y * FFT_SIZE + x] = 0; // Real input
      cbChan[y * FFT_SIZE + x] = cb;
      crChan[y * FFT_SIZE + x] = cr;
    }
  }

  // Perform 2D FFT
  fft2D(yRe, yIm, FFT_SIZE, false);

  // Get bits with Hamming ECC
  const rawBits = stringToBits(text);
  const eccBits = applyHammingEncoding(rawBits);
  const numBits = eccBits.length;

  // Generate pseudorandom mid-frequency coordinate pairs
  // Mid frequency rings: radius between 20 and 100
  const rand = createPRNG(key);
  const pairs: Array<{ u1: number, v1: number, u2: number, v2: number }> = [];

  // Generate candidate coordinates
  const coords: Array<{ u: number, v: number }> = [];
  for (let u = 10; u < FFT_SIZE / 2; u++) {
    for (let v = 10; v < FFT_SIZE; v++) {
      const r = Math.sqrt(u * u + (v > FFT_SIZE / 2 ? FFT_SIZE - v : v) ** 2);
      if (r > 20 && r < 100) {
        coords.push({ u, v });
      }
    }
  }

  // Shuffle coords
  for (let i = coords.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = coords[i];
    coords[i] = coords[j];
    coords[j] = tmp;
  }

  // Create pairs
  for (let i = 0; i < numBits; i++) {
    if (2 * i + 1 >= coords.length) {
      throw new Error("Text is too long for the selected DFT frequency band.");
    }
    const c1 = coords[2 * i];
    const c2 = coords[2 * i + 1];
    pairs.push({ u1: c1.u, v1: c1.v, u2: c2.u, v2: c2.v });
  }

  const delta = Math.max(5, strength * 2);

  // Embed bits in magnitude spectrum
  for (let i = 0; i < numBits; i++) {
    const bit = eccBits[i];
    const { u1, v1, u2, v2 } = pairs[i];

    // Symmetrical conjugate coordinates to maintain real-valued IFFT
    const cu1 = FFT_SIZE - u1;
    const cv1 = (FFT_SIZE - v1) % FFT_SIZE;
    const cu2 = FFT_SIZE - u2;
    const cv2 = (FFT_SIZE - v2) % FFT_SIZE;

    // Coordinate 1 magnitude
    const idx1 = u1 * FFT_SIZE + v1;
    const cIdx1 = cu1 * FFT_SIZE + cv1;
    const mag1 = Math.sqrt(yRe[idx1] ** 2 + yIm[idx1] ** 2) || 0.001;

    // Coordinate 2 magnitude
    const idx2 = u2 * FFT_SIZE + v2;
    const cIdx2 = cu2 * FFT_SIZE + cv2;
    const mag2 = Math.sqrt(yRe[idx2] ** 2 + yIm[idx2] ** 2) || 0.001;

    const avg = (mag1 + mag2) / 2;
    let newMag1 = mag1;
    let newMag2 = mag2;

    if (bit === 1) {
      newMag1 = avg + delta;
      newMag2 = Math.max(0.1, avg - delta);
    } else {
      newMag1 = Math.max(0.1, avg - delta);
      newMag2 = avg + delta;
    }

    // Apply scale to preserve phase
    yRe[idx1] *= newMag1 / mag1;
    yIm[idx1] *= newMag1 / mag1;
    yRe[cIdx1] *= newMag1 / mag1;
    yIm[cIdx1] *= newMag1 / mag1;

    yRe[idx2] *= newMag2 / mag2;
    yIm[idx2] *= newMag2 / mag2;
    yRe[cIdx2] *= newMag2 / mag2;
    yIm[cIdx2] *= newMag2 / mag2;
  }

  // Perform 2D IFFT
  fft2D(yRe, yIm, FFT_SIZE, true);

  // Write back center block to destination RGB data
  for (let y = 0; y < FFT_SIZE; y++) {
    for (let x = 0; x < FFT_SIZE; x++) {
      const srcIdx = ((startY + y) * width + (startX + x)) * 4;
      const yVal = Math.max(0, Math.min(255, yRe[y * FFT_SIZE + x]));
      const cb = cbChan[y * FFT_SIZE + x];
      const cr = crChan[y * FFT_SIZE + x];

      const [r, g, b] = ycbcrToRgb(yVal, cb, cr);
      dstData[srcIdx] = r;
      dstData[srcIdx + 1] = g;
      dstData[srcIdx + 2] = b;
    }
  }

  return new ImageData(dstData, width, height);
}

export function extractDFT(
  imageData: ImageData,
  key: string,
  strength: number
): string {
  const width = imageData.width;
  const height = imageData.height;
  const srcData = imageData.data;

  if (width < FFT_SIZE || height < FFT_SIZE) {
    return "提取失败：图片尺寸小于频域分析窗口";
  }

  // Center FFT block coordinates
  const startX = Math.floor((width - FFT_SIZE) / 2);
  const startY = Math.floor((height - FFT_SIZE) / 2);

  // Convert center block to Y (Luminance)
  const yRe = new Float32Array(FFT_SIZE * FFT_SIZE);
  const yIm = new Float32Array(FFT_SIZE * FFT_SIZE);

  for (let y = 0; y < FFT_SIZE; y++) {
    for (let x = 0; x < FFT_SIZE; x++) {
      const idx = ((startY + y) * width + (startX + x)) * 4;
      yRe[y * FFT_SIZE + x] = 0.299 * srcData[idx] + 0.587 * srcData[idx + 1] + 0.114 * srcData[idx + 2];
      yIm[y * FFT_SIZE + x] = 0;
    }
  }

  // Perform 2D FFT
  fft2D(yRe, yIm, FFT_SIZE, false);

  const estimatedPayloadBits = 1008;

  // Generate the coordinate pairs using same seed key
  const rand = createPRNG(key);
  const coords: Array<{ u: number, v: number }> = [];
  for (let u = 10; u < FFT_SIZE / 2; u++) {
    for (let v = 10; v < FFT_SIZE; v++) {
      const r = Math.sqrt(u * u + (v > FFT_SIZE / 2 ? FFT_SIZE - v : v) ** 2);
      if (r > 20 && r < 100) {
        coords.push({ u, v });
      }
    }
  }

  // Shuffle coords
  for (let i = coords.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = coords[i];
    coords[i] = coords[j];
    coords[j] = tmp;
  }

  const pairs: Array<{ u1: number, v1: number, u2: number, v2: number }> = [];
  for (let i = 0; i < estimatedPayloadBits; i++) {
    if (2 * i + 1 >= coords.length) break;
    const c1 = coords[2 * i];
    const c2 = coords[2 * i + 1];
    pairs.push({ u1: c1.u, v1: c1.v, u2: c2.u, v2: c2.v });
  }

  // Extract bits
  const extractedBits: number[] = [];
  for (let i = 0; i < pairs.length; i++) {
    const { u1, v1, u2, v2 } = pairs[i];
    const mag1 = Math.sqrt(yRe[u1 * FFT_SIZE + v1] ** 2 + yIm[u1 * FFT_SIZE + v1] ** 2);
    const mag2 = Math.sqrt(yRe[u2 * FFT_SIZE + v2] ** 2 + yIm[u2 * FFT_SIZE + v2] ** 2);
    extractedBits.push(mag1 >= mag2 ? 1 : 0);
  }

  // Decode Hamming ECC
  const decodedRawBits = decodeHammingEncoding(extractedBits);

  const decodeResult = bitsToString(decodedRawBits);
  return decodeResult.success ? decodeResult.text : "提取失败：未探测到DFT水印或密钥错误";
}
