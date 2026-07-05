import { createPRNG, rgbToYcbcr, ycbcrToRgb, stringToBits, bitsToString, applyHammingEncoding, decodeHammingEncoding } from './utils';

// We reuse the precomputed cosine tables and block-DCT concept, but apply it to the Cr (Chrominance Red) or Cb (Chrominance Blue) channel.
// Because human visual system (HVS) is less sensitive to chrominance, we can increase the embedding strength here for high robustness.
const COS_TABLE = new Float32Array(8 * 8);
for (let x = 0; x < 8; x++) {
  for (let u = 0; u < 8; u++) {
    COS_TABLE[x * 8 + u] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
  }
}

function dct8x8(block: Float32Array, out: Float32Array) {
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      let sum = 0;
      for (let x = 0; x < 8; x++) {
        for (let y = 0; y < 8; y++) {
          sum += block[x * 8 + y] * COS_TABLE[x * 8 + u] * COS_TABLE[y * 8 + v];
        }
      }
      const cu = u === 0 ? 1 / Math.sqrt(2) : 1;
      const cv = v === 0 ? 1 / Math.sqrt(2) : 1;
      out[u * 8 + v] = 0.25 * cu * cv * sum;
    }
  }
}

function idct8x8(dctBlock: Float32Array, out: Float32Array) {
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 8; y++) {
      let sum = 0;
      for (let u = 0; u < 8; u++) {
        for (let v = 0; v < 8; v++) {
          const cu = u === 0 ? 1 / Math.sqrt(2) : 1;
          const cv = v === 0 ? 1 / Math.sqrt(2) : 1;
          sum += cu * cv * dctBlock[u * 8 + v] * COS_TABLE[x * 8 + u] * COS_TABLE[y * 8 + v];
        }
      }
      out[x * 8 + y] = 0.25 * sum;
    }
  }
}

export function embedChroma(
  imageData: ImageData,
  text: string,
  key: string,
  strength: number // 15 to 80 (delta for chrominance modulation)
): ImageData {
  const width = imageData.width;
  const height = imageData.height;
  const srcData = imageData.data;
  const dstData = new Uint8ClampedArray(srcData);

  const yChan = new Float32Array(width * height);
  const cbChan = new Float32Array(width * height);
  const crChan = new Float32Array(width * height);

  for (let i = 0; i < width * height; i++) {
    const [y, cb, cr] = rgbToYcbcr(srcData[i * 4], srcData[i * 4 + 1], srcData[i * 4 + 2]);
    yChan[i] = y;
    cbChan[i] = cb;
    crChan[i] = cr;
  }

  const rawBits = stringToBits(text);
  const eccBits = applyHammingEncoding(rawBits);
  const numBits = eccBits.length;

  const blocksX = Math.floor(width / 8);
  const blocksY = Math.floor(height / 8);
  const totalBlocks = blocksX * blocksY;

  if (totalBlocks < numBits) {
    throw new Error('Image is too small to embed the watermark text with Chroma-DCT.');
  }

  const rand = createPRNG(key);
  const blockIndices = new Int32Array(totalBlocks);
  for (let i = 0; i < totalBlocks; i++) blockIndices[i] = i;
  for (let i = totalBlocks - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = blockIndices[i];
    blockIndices[i] = blockIndices[j];
    blockIndices[j] = tmp;
  }

  const blockInput = new Float32Array(64);
  const blockDct = new Float32Array(64);
  const blockOutput = new Float32Array(64);

  // We modulate mid-frequency coefficients of Cr channel (red chrominance)
  const u1 = 3, v1 = 4;
  const u2 = 4, v2 = 3;
  // Increase delta slightly since chrominance is less visible
  const delta = Math.max(8, strength * 1.5);

  for (let i = 0; i < totalBlocks; i++) {
    const bit = eccBits[i % numBits];
    const blockIdx = blockIndices[i];
    const bx = blockIdx % blocksX;
    const by = Math.floor(blockIdx / blocksX);

    const startX = bx * 8;
    const startY = by * 8;

    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        blockInput[y * 8 + x] = crChan[(startY + y) * width + (startX + x)];
      }
    }

    dct8x8(blockInput, blockDct);

    const a = blockDct[u1 * 8 + v1];
    const b = blockDct[u2 * 8 + v2];
    const avg = (a + b) / 2;

    if (bit === 1) {
      blockDct[u1 * 8 + v1] = avg + delta / 2;
      blockDct[u2 * 8 + v2] = avg - delta / 2;
    } else {
      blockDct[u1 * 8 + v1] = avg - delta / 2;
      blockDct[u2 * 8 + v2] = avg + delta / 2;
    }

    idct8x8(blockDct, blockOutput);

    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        crChan[(startY + y) * width + (startX + x)] = blockOutput[y * 8 + x];
      }
    }
  }

  for (let i = 0; i < width * height; i++) {
    const [r, g, b] = ycbcrToRgb(yChan[i], cbChan[i], crChan[i]);
    dstData[i * 4] = r;
    dstData[i * 4 + 1] = g;
    dstData[i * 4 + 2] = b;
  }

  return new ImageData(dstData, width, height);
}

export function extractChroma(
  imageData: ImageData,
  key: string,
  strength: number
): string {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;

  // Extract Cr channel
  const crChan = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    // Cr channel formula: 0.5 * r - 0.4187 * g - 0.0813 * b + 128
    crChan[i] = 0.5 * r - 0.4187 * g - 0.0813 * b + 128;
  }

  const bestResult = {
    text: "提取失败：未探测到色度水印或密钥错误",
    score: -1
  };

  const estimatedPayloadBits = 1008;
  const u1 = 3, v1 = 4;
  const u2 = 4, v2 = 3;

  for (let dy = 0; dy < 8; dy++) {
    for (let dx = 0; dx < 8; dx++) {
      const blocksX = Math.floor((width - dx) / 8);
      const blocksY = Math.floor((height - dy) / 8);
      const totalBlocks = blocksX * blocksY;

      if (totalBlocks < 128) continue;

      const rand = createPRNG(key);
      const blockIndices = new Int32Array(totalBlocks);
      for (let i = 0; i < totalBlocks; i++) blockIndices[i] = i;
      for (let i = totalBlocks - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const tmp = blockIndices[i];
        blockIndices[i] = blockIndices[j];
        blockIndices[j] = tmp;
      }

      const rawExtracted = new Int8Array(totalBlocks);
      const blockInput = new Float32Array(64);
      const blockDct = new Float32Array(64);

      for (let i = 0; i < totalBlocks; i++) {
        const blockIdx = blockIndices[i];
        const bx = blockIdx % blocksX;
        const by = Math.floor(blockIdx / blocksX);

        const startX = dx + bx * 8;
        const startY = dy + by * 8;

        for (let y = 0; y < 8; y++) {
          for (let x = 0; x < 8; x++) {
            blockInput[y * 8 + x] = crChan[(startY + y) * width + (startX + x)];
          }
        }

        dct8x8(blockInput, blockDct);
        const a = blockDct[u1 * 8 + v1];
        const b = blockDct[u2 * 8 + v2];
        rawExtracted[i] = a >= b ? 1 : 0;
      }

      const consolidatedBits = new Array(estimatedPayloadBits);
      for (let b = 0; b < estimatedPayloadBits; b++) {
        let sum = 0;
        let count = 0;
        for (let i = b; i < totalBlocks; i += estimatedPayloadBits) {
          sum += rawExtracted[i];
          count++;
        }
        consolidatedBits[b] = sum >= (count / 2) ? 1 : 0;
      }

      const decodedRawBits = decodeHammingEncoding(consolidatedBits);

      const header = [0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1];
      let matches = 0;
      for (let i = 0; i < header.length; i++) {
        if (decodedRawBits[i] === header[i]) matches++;
      }

      if (matches > bestResult.score && matches >= header.length - 3) {
        const decodeResult = bitsToString(decodedRawBits);
        if (decodeResult.success) {
          bestResult.score = matches;
          bestResult.text = decodeResult.text;
          if (matches === header.length) {
            return decodeResult.text;
          }
        }
      }
    }
  }

  return bestResult.text;
}
