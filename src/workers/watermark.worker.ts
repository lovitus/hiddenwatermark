import { embedLSB, extractLSB } from '../algorithms/lsb';
import { embedDCT, extractDCT } from '../algorithms/dct';
import { embedDWT, extractDWT } from '../algorithms/dwt';
import { embedDFT, extractDFT } from '../algorithms/dft';
import { embedSpreadSpectrum, extractSpreadSpectrum } from '../algorithms/spreadSpectrum';
import { embedChroma, extractChroma } from '../algorithms/chroma';

self.onmessage = (e: MessageEvent) => {
  const { type, pixels, width, height, text, key, algorithm, strength } = e.data;

  try {
    const imgData = new ImageData(new Uint8ClampedArray(pixels), width, height);

    if (type === 'embed') {
      let outputImg: ImageData;
      switch (algorithm) {
        case 'lsb':
          outputImg = embedLSB(imgData, text, key, strength);
          break;
        case 'dct':
          outputImg = embedDCT(imgData, text, key, strength);
          break;
        case 'dwt':
          outputImg = embedDWT(imgData, text, key, strength);
          break;
        case 'dft':
          outputImg = embedDFT(imgData, text, key, strength);
          break;
        case 'dsss':
          outputImg = embedSpreadSpectrum(imgData, text, key, strength);
          break;
        case 'chroma':
          outputImg = embedChroma(imgData, text, key, strength);
          break;
        default:
          throw new Error('未知算法: ' + algorithm);
      }
      
      // Transfer the buffer back to save memory copy overhead
      self.postMessage({
        success: true,
        type: 'embed',
        pixels: outputImg.data.buffer
      }, [outputImg.data.buffer] as any);

    } else if (type === 'extract') {
      let resultText = '';
      switch (algorithm) {
        case 'lsb':
          resultText = extractLSB(imgData, key, strength);
          break;
        case 'dct':
          resultText = extractDCT(imgData, key, strength);
          break;
        case 'dwt':
          resultText = extractDWT(imgData, key, strength);
          break;
        case 'dft':
          resultText = extractDFT(imgData, key, strength);
          break;
        case 'dsss':
          resultText = extractSpreadSpectrum(imgData, key, strength);
          break;
        case 'chroma':
          resultText = extractChroma(imgData, key, strength);
          break;
        default:
          throw new Error('未知算法: ' + algorithm);
      }

      self.postMessage({
        success: true,
        type: 'extract',
        text: resultText
      });
    }
  } catch (error: any) {
    self.postMessage({
      success: false,
      error: error.message || '后台计算任务执行失败'
    });
  }
};
