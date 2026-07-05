import { createPRNG, stringToBits, bitsToString, applyHammingEncoding, decodeHammingEncoding } from './utils';

export function embedLSB(
  imageData: ImageData,
  text: string,
  key: string,
  strength: number // redundant copies factor (1 to 10)
): ImageData {
  const data = new Uint8ClampedArray(imageData.data);
  const width = imageData.width;
  const height = imageData.height;
  const totalPixels = width * height;

  // Convert text to bits
  const rawBits = stringToBits(text);
  // Add Hamming ECC
  const eccBits = applyHammingEncoding(rawBits);

  const numBits = eccBits.length;
  // Strength controls redundancy (how many times we repeat the bitstream)
  const redundancy = Math.max(1, Math.min(20, Math.floor(strength)));
  const totalBitsToEmbed = numBits * redundancy;

  if (totalBitsToEmbed > totalPixels * 3) {
    throw new Error('Image is too small to embed this watermark text with current strength.');
  }

  // Create seeded PRNG to randomize pixel selection
  const rand = createPRNG(key);

  // Generate unique pseudo-random pixel indices and color channels
  // For standard LSB, we can shuffle indices to scatter the watermark
  const indices = new Int32Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) indices[i] = i;
  
  // Shuffle first totalBitsToEmbed elements
  for (let i = 0; i < Math.min(totalPixels - 1, totalBitsToEmbed); i++) {
    const swapWith = i + Math.floor(rand() * (totalPixels - i));
    const tmp = indices[i];
    indices[i] = indices[swapWith];
    indices[swapWith] = tmp;
  }

  let bitIdx = 0;
  for (let r = 0; r < redundancy; r++) {
    for (let b = 0; b < numBits; b++) {
      const bit = eccBits[b];
      const pixelIdx = indices[bitIdx];
      
      // Choose channel randomly (0: R, 1: G, 2: B)
      const channel = Math.floor(rand() * 3);
      const dataIdx = pixelIdx * 4 + channel;

      // Embed bit in LSB
      data[dataIdx] = (data[dataIdx] & 0xFE) | bit;
      bitIdx++;
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
  const width = imageData.width;
  const height = imageData.height;
  const totalPixels = width * height;

  // We don't know the exact length of the message beforehand.
  // We can extract a large buffer and then use our bitsToString sync-finder to extract the text.
  // Standard LSB max extraction buffer: say 40000 bits (about 5KB or ~500 chars after Hamming code + redundancy)
  const redundancy = Math.max(1, Math.min(20, Math.floor(strength)));
  
  // We will extract up to a reasonable cap of bits
  const rawBits = stringToBits("A"); // just to get a template length, but we need to scan more.
  const estimatedPayloadBits = Math.min(48000, Math.floor((totalPixels * 3) / redundancy));
  
  const rand = createPRNG(key);
  const indices = new Int32Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) indices[i] = i;
  
  // Shuffle using same seed
  const totalIndicesToExtract = estimatedPayloadBits * redundancy;
  for (let i = 0; i < Math.min(totalPixels - 1, totalIndicesToExtract); i++) {
    const swapWith = i + Math.floor(rand() * (totalPixels - i));
    const tmp = indices[i];
    indices[i] = indices[swapWith];
    indices[swapWith] = tmp;
  }

  // Extract bits
  const extractedBits = new Array(totalIndicesToExtract);
  let bitIdx = 0;
  for (let r = 0; r < redundancy; r++) {
    for (let b = 0; b < estimatedPayloadBits; b++) {
      const pixelIdx = indices[bitIdx];
      const channel = Math.floor(rand() * 3);
      const dataIdx = pixelIdx * 4 + channel;
      extractedBits[bitIdx] = data[dataIdx] & 1;
      bitIdx++;
    }
  }

  // Perform majority voting across redundant sets
  const finalizedEccBits = new Array(estimatedPayloadBits);
  for (let b = 0; b < estimatedPayloadBits; b++) {
    let sum = 0;
    for (let r = 0; r < redundancy; r++) {
      sum += extractedBits[r * estimatedPayloadBits + b];
    }
    finalizedEccBits[b] = sum >= (redundancy / 2) ? 1 : 0;
  }

  // Decode Hamming ECC
  const decodedRawBits = decodeHammingEncoding(finalizedEccBits);

  // Convert to String
  const decodeResult = bitsToString(decodedRawBits);
  return decodeResult.success ? decodeResult.text : "提取失败：未探测到LSB水印或密钥错误";
}
