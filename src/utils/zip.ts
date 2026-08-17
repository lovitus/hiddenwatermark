/**
 * Pure TypeScript Zero-Dependency ZIP File Builder
 * Implements standard PKZIP format with CRC-32 calculation.
 */

// CRC-32 table calculation
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

export function createZip(entries: ZipEntry[]): Blob {
  const fileParts: Uint8Array[] = [];
  const centralDirHeaders: Uint8Array[] = [];
  let offset = 0;

  const textEncoder = new TextEncoder();

  for (const entry of entries) {
    const nameBytes = textEncoder.encode(entry.name);
    const dataBytes = entry.data;
    const fileCrc = crc32(dataBytes);
    const fileLen = dataBytes.length;

    // 1. Local File Header (30 bytes + name length)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);

    lv.setUint32(0, 0x04034b50, true); // Local file header signature
    lv.setUint16(4, 20, true);         // Version needed to extract (2.0)
    lv.setUint16(6, 0, true);          // General purpose bit flag
    lv.setUint16(8, 0, true);          // Compression method (0 = store / uncompressed)
    lv.setUint16(10, 0, true);         // File mod time
    lv.setUint16(12, 0, true);         // File mod date
    lv.setUint32(14, fileCrc, true);   // CRC-32
    lv.setUint32(18, fileLen, true);   // Compressed size
    lv.setUint32(22, fileLen, true);   // Uncompressed size
    lv.setUint16(26, nameBytes.length, true); // File name length
    lv.setUint16(28, 0, true);         // Extra field length
    localHeader.set(nameBytes, 30);

    fileParts.push(localHeader);
    fileParts.push(dataBytes);

    // 2. Central Directory Header (46 bytes + name length)
    const cdHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cdHeader.buffer);

    cv.setUint32(0, 0x02014b50, true); // Central directory signature
    cv.setUint16(4, 20, true);         // Version made by
    cv.setUint16(6, 20, true);         // Version needed
    cv.setUint16(8, 0, true);          // Flags
    cv.setUint16(10, 0, true);         // Compression method (0 = uncompressed)
    cv.setUint16(12, 0, true);         // Mod time
    cv.setUint16(14, 0, true);         // Mod date
    cv.setUint32(16, fileCrc, true);   // CRC-32
    cv.setUint32(20, fileLen, true);   // Compressed size
    cv.setUint32(24, fileLen, true);   // Uncompressed size
    cv.setUint16(28, nameBytes.length, true); // Name length
    cv.setUint16(30, 0, true);         // Extra field len
    cv.setUint16(32, 0, true);         // Comment len
    cv.setUint16(34, 0, true);         // Disk number start
    cv.setUint16(36, 0, true);         // Internal attributes
    cv.setUint32(38, 0, true);         // External attributes
    cv.setUint32(42, offset, true);    // Relative offset of local header
    cdHeader.set(nameBytes, 46);

    centralDirHeaders.push(cdHeader);
    offset += localHeader.length + dataBytes.length;
  }

  // Calculate Central Directory size
  let centralDirSize = 0;
  for (const c of centralDirHeaders) {
    centralDirSize += c.length;
  }

  // 3. End of Central Directory Record (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // EOCD signature
  ev.setUint16(4, 0, true);          // Disk number
  ev.setUint16(6, 0, true);          // Start disk
  ev.setUint16(8, entries.length, true);  // Records on disk
  ev.setUint16(10, entries.length, true); // Total records
  ev.setUint32(12, centralDirSize, true); // Central directory size
  ev.setUint32(16, offset, true);         // Offset of central directory
  ev.setUint16(20, 0, true);              // Comment length

  return new Blob([...fileParts, ...centralDirHeaders, eocd], { type: 'application/zip' });
}
