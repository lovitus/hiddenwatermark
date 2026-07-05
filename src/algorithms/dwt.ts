import { createPRNG, rgbToYcbcr, ycbcrToRgb, stringToBits, bitsToString, applyHammingEncoding, decodeHammingEncoding } from './utils';

// 2D Haar DWT for 8x8 block
function dwtHaar8x8(block: Float32Array, ll: Float32Array, lh: Float32Array, hl: Float32Array, hh: Float32Array) {
  // Row-wise Haar
  const rowTemp = new Float32Array(64);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 4; c++) {
      const a = block[r * 8 + 2 * c];
      const b = block[r * 8 + 2 * c + 1];
      rowTemp[r * 8 + c] = (a + b) / Math.sqrt(2); // Low frequency
      rowTemp[r * 8 + c + 4] = (a - b) / Math.sqrt(2); // High frequency
    }
  }

  // Column-wise Haar
  for (let c = 0; c < 8; c++) {
    const colTemp = new Float32Array(8);
    for (let r = 0; r < 4; r++) {
      const a = rowTemp[(2 * r) * 8 + c];
      const b = rowTemp[(2 * r + 1) * 8 + c];
      colTemp[r] = (a + b) / Math.sqrt(2); // Low
      colTemp[r + 4] = (a - b) / Math.sqrt(2); // High
    }
    for (let r = 0; r < 8; r++) {
      rowTemp[r * 8 + c] = colTemp[r];
    }
  }

  // Separate into 4x4 sub-bands
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      ll[r * 4 + c] = rowTemp[r * 8 + c];
      lh[r * 4 + c] = rowTemp[r * 8 + c + 4];
      hl[r * 4 + c] = rowTemp[(r + 4) * 8 + c];
      hh[r * 4 + c] = rowTemp[(r + 4) * 8 + c + 4];
    }
  }
}

// 2D Haar IDWT for 8x8 block
function idwtHaar8x8(ll: Float32Array, lh: Float32Array, hl: Float32Array, hh: Float32Array, block: Float32Array) {
  const rowTemp = new Float32Array(64);

  // Combine from 4x4 sub-bands
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      rowTemp[r * 8 + c] = ll[r * 4 + c];
      rowTemp[r * 8 + c + 4] = lh[r * 4 + c];
      rowTemp[(r + 4) * 8 + c] = hl[r * 4 + c];
      rowTemp[(r + 4) * 8 + c + 4] = hh[r * 4 + c];
    }
  }

  // Column-wise Inverse Haar
  for (let c = 0; c < 8; c++) {
    const colTemp = new Float32Array(8);
    for (let r = 0; r < 4; r++) {
      const l = rowTemp[r * 8 + c];
      const h = rowTemp[(r + 4) * 8 + c];
      colTemp[2 * r] = (l + h) / Math.sqrt(2);
      colTemp[2 * r + 1] = (l - h) / Math.sqrt(2);
    }
    for (let r = 0; r < 8; r++) {
      rowTemp[r * 8 + c] = colTemp[r];
    }
  }

  // Row-wise Inverse Haar
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 4; c++) {
      const l = rowTemp[r * 8 + c];
      const h = rowTemp[r * 8 + c + 4];
      block[r * 8 + 2 * c] = (l + h) / Math.sqrt(2);
      block[r * 8 + 2 * c + 1] = (l - h) / Math.sqrt(2);
    }
  }
}

export function embedDWT(
  imageData: ImageData,
  text: string,
  key: string,
  strength: number // 10 to 60 (modulates DWT difference delta)
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
    throw new Error('Image is too small to embed the watermark text with block-DWT.');
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
  const ll = new Float32Array(16);
  const lh = new Float32Array(16);
  const hl = new Float32Array(16);
  const hh = new Float32Array(16);
  const blockOutput = new Float32Array(64);

  // We embed bits in the relation between LH(1, 1) and HL(1, 1) of the Haar DWT sub-bands
  const targetIdx = 5; // index (1, 1) in 4x4 matrix: 1 * 4 + 1 = 5
  const delta = Math.max(5, strength);

  for (let i = 0; i < totalBlocks; i++) {
    const bit = eccBits[i % numBits];
    const blockIdx = blockIndices[i];
    const bx = blockIdx % blocksX;
    const by = Math.floor(blockIdx / blocksX);

    const startX = bx * 8;
    const startY = by * 8;

    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        blockInput[y * 8 + x] = yChan[(startY + y) * width + (startX + x)];
      }
    }

    dwtHaar8x8(blockInput, ll, lh, hl, hh);

    // Modulate DWT coefficients
    const a = lh[targetIdx];
    const b = hl[targetIdx];
    const avg = (a + b) / 2;

    if (bit === 1) {
      lh[targetIdx] = avg + delta / 2;
      hl[targetIdx] = avg - delta / 2;
    } else {
      lh[targetIdx] = avg - delta / 2;
      hl[targetIdx] = avg + delta / 2;
    }

    idwtHaar8x8(ll, lh, hl, hh, blockOutput);

    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        yChan[(startY + y) * width + (startX + x)] = blockOutput[y * 8 + x];
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

export function extractDWT(
  imageData: ImageData,
  key: string,
  strength: number
): string {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;

  const yChan = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    yChan[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }

  const bestResult = {
    text: "提取失败：未探测到DWT水印或密钥错误",
    score: -1
  };

  const estimatedPayloadBits = 1008;
  const targetIdx = 5; // LH(1,1) & HL(1,1)

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
      const ll = new Float32Array(16);
      const lh = new Float32Array(16);
      const hl = new Float32Array(16);
      const hh = new Float32Array(16);

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

        dwtHaar8x8(blockInput, ll, lh, hl, hh);
        const a = lh[targetIdx];
        const b = hl[targetIdx];
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
