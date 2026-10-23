import { Capacitor } from '@capacitor/core';
import { Camera } from '@capacitor/camera';

export type OutputFormat = 'jpeg' | 'png';
export interface OutputSettings {
  format: OutputFormat;
  quality: number; // JPEG quality, 60-100
  maxSide: number; // longest edge of the watermarked output, in pixels
}

// Extraction always reads at up to this size, so it never downsamples an output produced by embedding
export const MAX_EXTRACT_SIZE = 4096;

export const DEFAULT_OUTPUT_SETTINGS: OutputSettings = { format: 'jpeg', quality: 90, maxSide: MAX_EXTRACT_SIZE };

const STORAGE_KEY = 'hw-output-settings';

export function loadOutputSettings(): OutputSettings {
  try {
    return { ...DEFAULT_OUTPUT_SETTINGS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
  } catch {
    return DEFAULT_OUTPUT_SETTINGS;
  }
}

export function saveOutputSettings(settings: OutputSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// Encodes pixels for saving or sharing using the configured format and quality
export function encodeImageData(imageData: ImageData, settings: OutputSettings): string {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  canvas.getContext('2d')!.putImageData(imageData, 0, 0);
  return settings.format === 'jpeg'
    ? canvas.toDataURL('image/jpeg', settings.quality / 100)
    : canvas.toDataURL('image/png');
}

// Native photo library multi-select; returns null on the web so the caller can use a file input.
// Returns an empty array when the user cancels.
export async function pickNativeImages(multiple: boolean): Promise<string[] | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { photos } = await Camera.pickImages({ quality: 100, limit: multiple ? 30 : 1 });
    return await Promise.all(photos.map(async p => blobToDataUrl(await (await fetch(p.webPath)).blob())));
  } catch (err: any) {
    if (/cancel/i.test(err?.message ?? '')) return [];
    throw err;
  }
}

