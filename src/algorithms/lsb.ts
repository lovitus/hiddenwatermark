import { createPRNG, stringToBits, bitsToString, applyHammingEncoding, decodeHammingEncoding } from './utils';

const HEADER_CODE_BITS = 56; // sync (16) + length (16) raw bits, Hamming-coded to 7 bits per nibble

// Shuffled (pixel, channel) slots derived from the key only, so extraction can rebuild the same layout
function shuffledSlots(width: number, height: number, key: string): Int32Array {
  const slots = new Int32Array(width * height * 3);
  for (let i = 0; i < slots.length; i++) slots[i] = i;
  const rand = createPRNG(key);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = slots[i];
    slots[i] = slots[j];
    slots[j] = tmp;
  }
  return slots;
}

export function embedLSB(
  imageData: ImageData,
  text: string,
  key: string,
  strength: number // redundant copies factor (1 to 10)
): ImageData {
  const data = new Uint8ClampedArray(imageData.data);
  const width = imageData.width;
  const height = imageData.height;

  // Convert text to bits and add Hamming ECC
  const eccBits = applyHammingEncoding(stringToBits(text));
  const redundancy = Math.max(1, Math.min(20, Math.floor(strength)));

  if (eccBits.length * redundancy > width * height * 3) {
    throw new Error('Image is too small to embed this watermark text with current strength.');
  }

  // Each ECC bit is repeated `redundancy` times in adjacent shuffled slots
  const slots = shuffledSlots(width, height, key);
  for (let b = 0; b < eccBits.length; b++) {
    for (let r = 0; r < redundancy; r++) {
      const slot = slots[b * redundancy + r];
      const dataIdx = Math.floor(slot / 3) * 4 + (slot % 3);
      data[dataIdx] = (data[dataIdx] & 0xFE) | eccBits[b];
    }
  }

  return new ImageData(data, width, height);
}

export function extractLSB(
  imageData: ImageData,
  key: string,
  strength: number
): string {
  const data = imageData.data;
  const redundancy = Math.max(1, Math.min(20, Math.floor(strength)));
  const slots = shuffledSlots(imageData.width, imageData.height, key);
  const failure = "提取失败：未探测到LSB水印或密钥错误";

  // Majority vote across the redundant copies of ECC bit `b`
  const readCodeBits = (count: number): number[] => {
    const bits: number[] = [];
    for (let b = 0; b < count; b++) {
      let sum = 0;
      for (let r = 0; r < redundancy; r++) {
        const slot = slots[b * redundancy + r];
        sum += data[Math.floor(slot / 3) * 4 + (slot % 3)] & 1;
      }
      bits.push(sum >= redundancy / 2 ? 1 : 0);
    }
    return bits;
  };

  // The header carries the payload length, which determines how many ECC bits follow
  const header = decodeHammingEncoding(readCodeBits(HEADER_CODE_BITS));
  const payloadLen = header.slice(16, 32).reduce((acc, bit) => (acc << 1) | bit, 0);
  const codeBits = 7 * ((40 + 8 * payloadLen) / 4);
  if (codeBits * redundancy > slots.length) return failure;

  const decodeResult = bitsToString(decodeHammingEncoding(readCodeBits(codeBits)));
  return decodeResult.success ? decodeResult.text : failure;
}
