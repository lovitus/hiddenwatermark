import { createPRNG, rgbToYcbcr, ycbcrToRgb, stringToBits, bitsToString, applyHammingEncoding, decodeHammingEncoding } from './utils';

const BLOCK_SIZE = 16; // 16x16 pixels per spread-spectrum bit block

// Generate a pseudo-random pattern of size 16x16 containing +1 and -1 values
function generatePNPattern(rand: () => number): Float32Array {
  const pattern = new Float32Array(BLOCK_SIZE * BLOCK_SIZE);
  for (let i = 0; i < pattern.length; i++) {
    pattern[i] = rand() >= 0.5 ? 1 : -1;
  }
  return pattern;
}

export function embedSpreadSpectrum(
  imageData: ImageData,
  text: string,
  key: string,
  strength: number // 2 to 20 (modulates alpha amplitude)
): ImageData {
  const width = imageData.width;
  const height = imageData.height;
  const srcData = imageData.data;
  const dstData = new Uint8ClampedArray(srcData);

  // Convert to YCbCr
  const yChan = new Float32Array(width * height);
  const cbChan = new Float32Array(width * height);
  const crChan = new Float32Array(width * height);

  for (let i = 0; i < width * height; i++) {
    const [y, cb, cr] = rgbToYcbcr(srcData[i * 4], srcData[i * 4 + 1], srcData[i * 4 + 2]);
    yChan[i] = y;
    cbChan[i] = cb;
    crChan[i] = cr;
  }

  // Convert text to bits
  const rawBits = stringToBits(text);
  const eccBits = applyHammingEncoding(rawBits);
  const numBits = eccBits.length;

  const blocksX = Math.floor(width / BLOCK_SIZE);
  const blocksY = Math.floor(height / BLOCK_SIZE);
  const totalBlocks = blocksX * blocksY;

  if (totalBlocks < numBits) {
    throw new Error('Image is too small for Spread Spectrum watermarking with this text length.');
  }

  // Generate PN sequences for each bit index using the seeded PRNG
  const rand = createPRNG(key);
  const pnPatterns: Float32Array[] = [];
  for (let i = 0; i < numBits; i++) {
    pnPatterns.push(generatePNPattern(rand));
  }

  // Create a block index shuffling
  const shuffleRand = createPRNG(key + "_shuffle");
  const blockIndices = new Int32Array(totalBlocks);
  for (let i = 0; i < totalBlocks; i++) blockIndices[i] = i;
  for (let i = totalBlocks - 1; i > 0; i--) {
    const j = Math.floor(shuffleRand() * (i + 1));
    const tmp = blockIndices[i];
    blockIndices[i] = blockIndices[j];
    blockIndices[j] = tmp;
  }

  const alpha = Math.max(1, strength);

  // Embed
  for (let i = 0; i < totalBlocks; i++) {
    const bitIdx = i % numBits;
    const bit = eccBits[bitIdx];
    const modulation = bit === 1 ? 1 : -1;

    const blockIdx = blockIndices[i];
    const bx = blockIdx % blocksX;
    const by = Math.floor(blockIdx / blocksX);

    const startX = bx * BLOCK_SIZE;
    const startY = by * BLOCK_SIZE;
    const pn = pnPatterns[bitIdx];

    for (let y = 0; y < BLOCK_SIZE; y++) {
      for (let x = 0; x < BLOCK_SIZE; x++) {
        const pixelIdx = (startY + y) * width + (startX + x);
        const pnVal = pn[y * BLOCK_SIZE + x];
        
        // Add modulated PN pattern to luminance channel
        yChan[pixelIdx] += alpha * pnVal * modulation;
        // Clamp Y to valid range [0, 255]
        if (yChan[pixelIdx] < 0) yChan[pixelIdx] = 0;
        if (yChan[pixelIdx] > 255) yChan[pixelIdx] = 255;
      }
    }
  }

  // Convert back to RGB
  for (let i = 0; i < width * height; i++) {
    const [r, g, b] = ycbcrToRgb(yChan[i], cbChan[i], crChan[i]);
    dstData[i * 4] = r;
    dstData[i * 4 + 1] = g;
    dstData[i * 4 + 2] = b;
  }

  return new ImageData(dstData, width, height);
}

export function extractSpreadSpectrum(
  imageData: ImageData,
  key: string,
  strength: number
): string {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;

  // Convert to Y
  const yChan = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    yChan[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }

  const estimatedPayloadBits = 1008;

  // Generate the PN sequences
  const rand = createPRNG(key);
  const pnPatterns: Float32Array[] = [];
  for (let i = 0; i < estimatedPayloadBits; i++) {
    pnPatterns.push(generatePNPattern(rand));
  }

  const bestResult = {
    text: "提取失败：未探测到扩频水印或密钥错误",
    score: -1
  };

  // We search over grid alignment (dx, dy) up to BLOCK_SIZE
  for (let dy = 0; dy < BLOCK_SIZE; dy += 2) { // step by 2 to make it faster
    for (let dx = 0; dx < BLOCK_SIZE; dx += 2) {
      const blocksX = Math.floor((width - dx) / BLOCK_SIZE);
      const blocksY = Math.floor((height - dy) / BLOCK_SIZE);
      const totalBlocks = blocksX * blocksY;

      if (totalBlocks < 64) continue;

      const shuffleRand = createPRNG(key + "_shuffle");
      const blockIndices = new Int32Array(totalBlocks);
      for (let i = 0; i < totalBlocks; i++) blockIndices[i] = i;
      for (let i = totalBlocks - 1; i > 0; i--) {
        const j = Math.floor(shuffleRand() * (i + 1));
        const tmp = blockIndices[i];
        blockIndices[i] = blockIndices[j];
        blockIndices[j] = tmp;
      }

      // Compute correlations for each block
      const blockCorrelations = new Float32Array(totalBlocks);
      for (let i = 0; i < totalBlocks; i++) {
        const bitIdx = i % estimatedPayloadBits;
        const blockIdx = blockIndices[i];
        const bx = blockIdx % blocksX;
        const by = Math.floor(blockIdx / blocksX);

        const startX = dx + bx * BLOCK_SIZE;
        const startY = dy + by * BLOCK_SIZE;
        const pn = pnPatterns[bitIdx];

        let dotProduct = 0;
        for (let y = 0; y < BLOCK_SIZE; y++) {
          for (let x = 0; x < BLOCK_SIZE; x++) {
            const pixelIdx = (startY + y) * width + (startX + x);
            dotProduct += yChan[pixelIdx] * pn[y * BLOCK_SIZE + x];
          }
        }
        blockCorrelations[i] = dotProduct;
      }

      // Average correlation across redundant blocks to decide bit (0 or 1)
      const consolidatedBits = new Array(estimatedPayloadBits);
      for (let b = 0; b < estimatedPayloadBits; b++) {
        let sum = 0;
        let count = 0;
        for (let i = b; i < totalBlocks; i += estimatedPayloadBits) {
          sum += blockCorrelations[i];
          count++;
        }
        consolidatedBits[b] = sum >= 0 ? 1 : 0;
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
