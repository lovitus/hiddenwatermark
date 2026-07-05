// Seeded PRNG (Mulberry32)
export function createPRNG(seedString: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedString.length; i++) {
    h = Math.imul(h ^ seedString.charCodeAt(i), 16777619) >>> 0;
  }
  return function() {
    let z = (h += 0x6D2B79F5) | 0;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

// Color Space Conversions: RGB <-> YCbCr
export function rgbToYcbcr(r: number, g: number, b: number): [number, number, number] {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = -0.1687 * r - 0.3313 * g + 0.5 * b + 128;
  const cr = 0.5 * r - 0.4187 * g - 0.0813 * b + 128;
  return [y, cb, cr];
}

export function ycbcrToRgb(y: number, cb: number, cr: number): [number, number, number] {
  const r = y + 1.402 * (cr - 128);
  const g = y - 0.34414 * (cb - 128) - 0.71414 * (cr - 128);
  const b = y + 1.772 * (cb - 128);
  return [
    Math.max(0, Math.min(255, Math.round(r))),
    Math.max(0, Math.min(255, Math.round(g))),
    Math.max(0, Math.min(255, Math.round(b)))
  ];
}

// Convert String to Bit Array (with 16-bit length prefix and 8-bit checksum)
export function stringToBits(text: string): number[] {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  const bits: number[] = [];

  // 1. Sync header: 0x5A, 0xA5 (16 bits)
  const header = [0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1];
  bits.push(...header);

  // 2. Length: 16 bits (supports up to 65535 bytes, though usually watermark text is small)
  const len = bytes.length;
  for (let i = 15; i >= 0; i--) {
    bits.push((len >> i) & 1);
  }

  // 3. Payload
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    for (let j = 7; j >= 0; j--) {
      bits.push((byte >> j) & 1);
    }
  }

  // 4. Simple Checksum (8 bits)
  let checksum = 0;
  for (let i = 0; i < bytes.length; i++) {
    checksum = (checksum + bytes[i]) & 0xFF;
  }
  for (let j = 7; j >= 0; j--) {
    bits.push((checksum >> j) & 1);
  }

  return bits;
}

// Convert Bit Array back to String
export interface DecodeResult {
  text: string;
  success: boolean;
  bitErrorRate: number;
}

export function bitsToString(bits: number[]): DecodeResult {
  const header = [0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1];
  
  // Find sync header by sliding window if bit misalignment occurs
  let headerIndex = -1;
  for (let i = 0; i <= bits.length - 40; i++) {
    let matches = 0;
    for (let j = 0; j < header.length; j++) {
      if (bits[i + j] === header[j]) matches++;
    }
    // Allow up to 2 bit errors in the header synchronization
    if (matches >= header.length - 2) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    return { text: "", success: false, bitErrorRate: 1.0 };
  }

  let idx = headerIndex + header.length;

  // Read Length (16 bits)
  if (idx + 16 > bits.length) {
    return { text: "", success: false, bitErrorRate: 1.0 };
  }
  let len = 0;
  for (let i = 0; i < 16; i++) {
    len = (len << 1) | bits[idx + i];
  }
  idx += 16;

  // Safety cap to avoid memory overflows
  if (len <= 0 || len > 2048 || idx + len * 8 + 8 > bits.length) {
    return { text: "", success: false, bitErrorRate: 1.0 };
  }

  // Read Bytes
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    let byteVal = 0;
    for (let j = 0; j < 8; j++) {
      byteVal = (byteVal << 1) | bits[idx + i * 8 + j];
    }
    bytes[i] = byteVal;
  }
  idx += len * 8;

  // Read Checksum (8 bits)
  let checksum = 0;
  for (let j = 0; j < 8; j++) {
    checksum = (checksum << 1) | bits[idx + j];
  }

  // Calculate local checksum
  let localChecksum = 0;
  for (let i = 0; i < bytes.length; i++) {
    localChecksum = (localChecksum + bytes[i]) & 0xFF;
  }

  // Decode text
  const decoder = new TextDecoder();
  let text = "";
  try {
    text = decoder.decode(bytes);
  } catch (e) {
    return { text: "", success: false, bitErrorRate: 0.5 };
  }

  const success = (checksum === localChecksum) && text.length > 0;
  
  // Calculate a mock bit error rate based on checksum mismatch or header match
  const bitErrorRate = success ? 0.0 : 0.15;

  return { text, success, bitErrorRate };
}

// 1D Radix-2 FFT
export function fft1D(re: Float32Array, im: Float32Array, invert: boolean = false) {
  const n = re.length;
  if (n <= 1) return;

  // Bit reversal
  for (let i = 0, j = 0; i < n; i++) {
    if (i < j) {
      let temp = re[i]; re[i] = re[j]; re[j] = temp;
      temp = im[i]; im[i] = im[j]; im[j] = temp;
    }
    let bit = n >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
  }

  // Cooley-Tukey Decimation-In-Time
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (2 * Math.PI / len) * (invert ? 1 : -1);
    const wlen_re = Math.cos(angle);
    const wlen_im = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let w_re = 1;
      let w_im = 0;
      for (let j = 0; j < len / 2; j++) {
        const u_re = re[i + j];
        const u_im = im[i + j];
        const v_idx = i + j + len / 2;
        const v_re = re[v_idx] * w_re - im[v_idx] * w_im;
        const v_im = re[v_idx] * w_im + im[v_idx] * w_re;

        re[i + j] = u_re + v_re;
        im[i + j] = u_im + v_im;
        re[v_idx] = u_re - v_re;
        im[v_idx] = u_im - v_im;

        const next_w_re = w_re * wlen_re - w_im * wlen_im;
        const next_w_im = w_re * wlen_im + w_im * wlen_re;
        w_re = next_w_re;
        w_im = next_w_im;
      }
    }
  }

  if (invert) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

// 2D FFT for square powers of 2
export function fft2D(re: Float32Array, im: Float32Array, size: number, invert: boolean = false) {
  // Row-wise FFT
  for (let r = 0; r < size; r++) {
    const rowRe = new Float32Array(size);
    const rowIm = new Float32Array(size);
    for (let c = 0; c < size; c++) {
      rowRe[c] = re[r * size + c];
      rowIm[c] = im[r * size + c];
    }
    fft1D(rowRe, rowIm, invert);
    for (let c = 0; c < size; c++) {
      re[r * size + c] = rowRe[c];
      im[r * size + c] = rowIm[c];
    }
  }

  // Column-wise FFT
  for (let c = 0; c < size; c++) {
    const colRe = new Float32Array(size);
    const colIm = new Float32Array(size);
    for (let r = 0; r < size; r++) {
      colRe[r] = re[r * size + c];
      colIm[r] = im[r * size + c];
    }
    fft1D(colRe, colIm, invert);
    for (let r = 0; r < size; r++) {
      re[r * size + c] = colRe[r];
      im[r * size + c] = colIm[r];
    }
  }
}

// Hamming (7, 4) Error Correction Code (adds robustness)
export function encodeHamming74(nibble: number): number {
  const d1 = (nibble >> 3) & 1;
  const d2 = (nibble >> 2) & 1;
  const d3 = (nibble >> 1) & 1;
  const d4 = nibble & 1;

  const p1 = d1 ^ d2 ^ d4;
  const p2 = d1 ^ d3 ^ d4;
  const p3 = d2 ^ d3 ^ d4;

  return (p1 << 6) | (p2 << 5) | (d1 << 4) | (p3 << 3) | (d2 << 2) | (d3 << 1) | d4;
}

export function decodeHamming74(code: number): number {
  const p1 = (code >> 6) & 1;
  const p2 = (code >> 5) & 1;
  const d1 = (code >> 4) & 1;
  const p3 = (code >> 3) & 1;
  const d2 = (code >> 2) & 1;
  const d3 = (code >> 1) & 1;
  const d4 = code & 1;

  const s1 = p1 ^ d1 ^ d2 ^ d4;
  const s2 = p2 ^ d1 ^ d3 ^ d4;
  const s3 = p3 ^ d2 ^ d3 ^ d4;

  const syndrome = (s1 << 2) | (s2 << 1) | s3;

  let corrected = code;
  if (syndrome !== 0) {
    // Map syndrome to bit index to flip (1-indexed based on standard Hamming matrix)
    // Indexes in codeword [p1, p2, d1, p3, d2, d3, d4]
    // positions:          [ 1,  2,  3,  4,  5,  6,  7 ]
    // Syndromes for each: s1 s2 s3
    // bit 1 (p1):  1 0 0 = 4 (s1=1, s2=0, s3=0)
    // bit 2 (p2):  0 1 0 = 2 (s1=0, s2=1, s3=0)
    // bit 3 (d1):  1 1 0 = 6 (s1=1, s2=1, s3=0)
    // bit 4 (p3):  0 0 1 = 1 (s1=0, s2=0, s3=1)
    // bit 5 (d2):  1 0 1 = 5 (s1=1, s2=0, s3=1)
    // bit 6 (d3):  0 1 1 = 3 (s1=0, s2=1, s3=1)
    // bit 7 (d4):  1 1 1 = 7 (s1=1, s2=1, s3=1)
    let flipBitPos = -1;
    if (syndrome === 4) flipBitPos = 6; // p1
    else if (syndrome === 2) flipBitPos = 5; // p2
    else if (syndrome === 6) flipBitPos = 4; // d1
    else if (syndrome === 1) flipBitPos = 3; // p3
    else if (syndrome === 5) flipBitPos = 2; // d2
    else if (syndrome === 3) flipBitPos = 1; // d3
    else if (syndrome === 7) flipBitPos = 0; // d4

    if (flipBitPos !== -1) {
      corrected ^= (1 << flipBitPos);
    }
  }

  // Extract data bits [d1, d2, d3, d4]
  const rd1 = (corrected >> 4) & 1;
  const rd2 = (corrected >> 2) & 1;
  const rd3 = (corrected >> 1) & 1;
  const rd4 = corrected & 1;

  return (rd1 << 3) | (rd2 << 2) | (rd3 << 1) | rd4;
}

// Apply Hamming encoding to bit array
export function applyHammingEncoding(bits: number[]): number[] {
  const result: number[] = [];
  for (let i = 0; i < bits.length; i += 4) {
    let nibble = 0;
    for (let j = 0; j < 4; j++) {
      nibble = (nibble << 1) | (bits[i + j] || 0);
    }
    const codeword = encodeHamming74(nibble);
    for (let j = 6; j >= 0; j--) {
      result.push((codeword >> j) & 1);
    }
  }
  return result;
}

// Decode Hamming bit array
export function decodeHammingEncoding(bits: number[]): number[] {
  const result: number[] = [];
  for (let i = 0; i < bits.length; i += 7) {
    let code = 0;
    for (let j = 0; j < 7; j++) {
      code = (code << 1) | (bits[i + j] || 0);
    }
    const nibble = decodeHamming74(code);
    for (let j = 3; j >= 0; j--) {
      result.push((nibble >> j) & 1);
    }
  }
  return result;
}
