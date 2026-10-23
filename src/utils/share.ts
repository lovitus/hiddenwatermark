import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png' };

// Shares an image file through the system share sheet on native platforms; downloads it on the web.
// The file extension follows the image's real MIME type so the share sheet can render a preview.
export async function shareImage(dataUrl: string, baseName: string, title: string, text: string): Promise<void> {
  const mime = /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? 'image/png';
  const fileName = `${baseName}.${EXTENSIONS[mime] ?? 'png'}`;
  if (!Capacitor.isNativePlatform()) {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = fileName;
    link.click();
    return;
  }
  const { uri } = await Filesystem.writeFile({ path: fileName, data: dataUrl.split(',')[1], directory: Directory.Cache, recursive: true });
  await Share.share({ title, text, files: [uri], dialogTitle: title });
}
