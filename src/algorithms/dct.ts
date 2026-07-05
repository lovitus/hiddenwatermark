import { createPRNG, rgbToYcbcr, ycbcrToRgb, stringToBits, bitsToString, applyHammingEncoding, decodeHammingEncoding } from './utils';

// Precomputed 8x8 DCT cosine coefficients table
const COS_TABLE = new Float32Array(8 * 8);
for (let x = 0; x < 8; x++) {
  for (let u = 0; u < 8; u++) {
    COS_TABLE[x * 8 + u] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
  }
}

// 2D DCT of an 8x8 block
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

// 2D IDCT of an 8x8 block
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

export function embedDCT(
  imageData: ImageData,
  text: string,
  key: string,
  strength: number // 10 to 60 (modulates DCT difference delta)
): ImageData {
  const width = imageData.width;
  const height = imageData.height;
  const srcData = imageData.data;
  const dstData = new Uint8ClampedArray(srcData);

  // Convert RGB to YCbCr channels
  const yChan = new Float32Array(width * height);
  const cbChan = new Float32Array(width * height);
  const crChan = new Float32Array(width * height);

  for (let i = 0; i < width * height; i++) {
    const r = srcData[i * 4];
    const g = srcData[i * 4 + 1];
    const b = srcData[i * 4 + 2];
    const [y, cb, cr] = rgbToYcbcr(r, g, b);
    yChan[i] = y;
    cbChan[i] = cb;
    crChan[i] = cr;
  }

  // Convert text to bit array and apply Hamming ECC
  const rawBits = stringToBits(text);
  const eccBits = applyHammingEncoding(rawBits);
  const numBits = eccBits.length;

  // Calculate number of blocks
  const blocksX = Math.floor(width / 8);
  const blocksY = Math.floor(height / 8);
  const totalBlocks = blocksX * blocksY;

  if (totalBlocks < numBits) {
    throw new Error('Image is too small to embed the watermark text with block-DCT.');
  }

  // Shuffle block indices based on key to randomize embedding order
  const rand = createPRNG(key);
  const blockIndices = new Int32Array(totalBlocks);
  for (let i = 0; i < totalBlocks; i++) blockIndices[i] = i;
  for (let i = totalBlocks - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = blockIndices[i];
    blockIndices[i] = blockIndices[j];
    blockIndices[j] = tmp;
  }

  // Embed bits repeatedly across all shuffled blocks (Tiled Redundancy)
  const blockInput = new Float32Array(64);
  const blockDct = new Float32Array(64);
  const blockOutput = new Float32Array(64);

  // Mid-frequency coefficients to modify
  // We use (3, 4) and (4, 3) which are symmetrical and highly robust
  const u1 = 3, v1 = 4;
  const u2 = 4, v2 = 3;
  const delta = Math.max(5, strength);

  for (let i = 0; i < totalBlocks; i++) {
    const bit = eccBits[i % numBits];
    const blockIdx = blockIndices[i];
    const bx = blockIdx % blocksX;
    const by = Math.floor(blockIdx / blocksX);

    // Extract 8x8 block from Y channel
    const startX = bx * 8;
    const startY = by * 8;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        blockInput[y * 8 + x] = yChan[(startY + y) * width + (startX + x)];
      }
    }

    // Perform DCT
    dct8x8(blockInput, blockDct);

    // Modulate coefficients
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

    // Perform IDCT
    idct8x8(blockDct, blockOutput);

    // Put back into Y channel
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        yChan[(startY + y) * width + (startX + x)] = blockOutput[y * 8 + x];
      }
    }
  }

  // Re-assemble back to RGB image data
  for (let i = 0; i < width * height; i++) {
    const [r, g, b] = ycbcrToRgb(yChan[i], cbChan[i], crChan[i]);
    dstData[i * 4] = r;
    dstData[i * 4 + 1] = g;
    dstData[i * 4 + 2] = b;
  }

  return new ImageData(dstData, width, height);
}

export function extractDCT(
  imageData: ImageData,
  key: string,
  strength: number // used to estimate length or parameter if needed
): string {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;

  // Convert RGB to Y channel
  const yChan = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    yChan[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }

  // We don't know the exact image shift (cropping shift).
  // We will perform a search over 8x8=64 grid alignments (dx, dy) to find the best match for the sync header.
  const bestResult = {
    text: "提取失败：未探测到DCT水印或密钥错误",
    score: -1
  };

  // We set a reasonable cap for estimated payload length
  // e.g. up to 1000 bits. Standard watermark length is smaller.
  // We can scan up to 2000 bits.
  const estimatedPayloadBits = 1008; // divisible by 7 (Hamming) and 8

  // Mid-frequency coefficients
  const u1 = 3, v1 = 4;
  const u2 = 4, v2 = 3;

  for (let dy = 0; dy < 8; dy++) {
    for (let dx = 0; dx < 8; dx++) {
      const blocksX = Math.floor((width - dx) / 8);
      const blocksY = Math.floor((height - dy) / 8);
      const totalBlocks = blocksX * blocksY;

      if (totalBlocks < 128) continue; // too few blocks for robust extraction

      // Regenerate randomized block index sequence based on key
      const rand = createPRNG(key);
      const blockIndices = new Int32Array(totalBlocks);
      for (let i = 0; i < totalBlocks; i++) blockIndices[i] = i;
      for (let i = totalBlocks - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const tmp = blockIndices[i];
        blockIndices[i] = blockIndices[j];
        blockIndices[j] = tmp;
      }

      // Collect raw extracted bits from all blocks
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
            blockInput[y * 8 + x] = yChan[(startY + y) * width + (startX + x)];
          }
        }

        dct8x8(blockInput, blockDct);
        const a = blockDct[u1 * 8 + v1];
        const b = blockDct[u2 * 8 + v2];
        rawExtracted[i] = a >= b ? 1 : 0;
      }

      // Perform majority voting to consolidate bits
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

      // Decode Hamming ECC
      const decodedRawBits = decodeHammingEncoding(consolidatedBits);

      // Verify header match score
      // Sync header: 0x5A, 0xA5 (16 bits): [0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1]
      const header = [0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1];
      let matches = 0;
      for (let i = 0; i < header.length; i++) {
        if (decodedRawBits[i] === header[i]) matches++;
      }

      // If we find a highly matching sync header, this is the correct alignment!
      if (matches > bestResult.score && matches >= header.length - 3) {
        const decodeResult = bitsToString(decodedRawBits);
        if (decodeResult.success) {
          bestResult.score = matches;
          bestResult.text = decodeResult.text;
          // If perfect match, return immediately
          if (matches === header.length) {
            return decodeResult.text;
          }
        }
      }
    }
  }

  return bestResult.text;
}
