import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

// Shares an image file through the system share sheet on native platforms; downloads it on the web
export async function shareImage(dataUrl: string, fileName: string, title: string, text: string): Promise<void> {
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
