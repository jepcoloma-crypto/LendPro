import fs from 'fs';

const MAGIC_BYTES: Record<string, number[]> = {
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'image/png': [0x89, 0x50, 0x4E, 0x47],
  'image/gif': [0x47, 0x49, 0x46],
  'image/webp': [0x52, 0x49, 0x46, 0x46],
  'application/pdf': [0x25, 0x50, 0x44, 0x46],
  'text/csv': [],
};
const CSV_MAGIC: number[][] = [
  [], // Empty file is valid CSV
  [0x2C], [0x22], [0x41, 0x2C], [0x41, 0x22], // Starts with comma, quote, or letter+comma/quote
];

export const magicMimeTypes = Object.keys(MAGIC_BYTES);

export const validateMagicBytes = (buffer: Buffer, mimeType: string): boolean => {
  if (mimeType === 'text/csv') return true; // CSV has no reliable magic bytes
  const sig = MAGIC_BYTES[mimeType];
  if (!sig || sig.length === 0) return false;
  return sig.every((b, i) => buffer[i] === b);
};

export const validateUploadedFile = (filePath: string, mimeType: string): boolean => {
  const sig = MAGIC_BYTES[mimeType];
  if (!sig || sig.length === 0) return false;
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(sig.length);
    fs.readSync(fd, buffer, 0, sig.length, 0);
    fs.closeSync(fd);
    return sig.every((b, i) => buffer[i] === b);
  } catch {
    return false;
  }
};
