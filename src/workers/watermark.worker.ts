import { embedLSB, extractLSB } from '../algorithms/lsb';
import { embedDCT, extractDCT } from '../algorithms/dct';
import { embedDWT, extractDWT } from '../algorithms/dwt';
import { embedDFT, extractDFT } from '../algorithms/dft';
import { embedSpreadSpectrum, extractSpreadSpectrum } from '../algorithms/spreadSpectrum';
import { embedChroma, extractChroma } from '../algorithms/chroma';

self.onmessage = (e: MessageEvent) => {
  const { type, pixels, width, height, text, key, algorithms, strength } = e.data;

  try {
    const imgData = new ImageData(new Uint8ClampedArray(pixels), width, height);

    if (type === 'embed') {
      let outputImg = imgData;
      
      // Execute each selected watermark algorithm sequentially
      for (const algo of algorithms) {
        switch (algo) {
          case 'lsb':
            outputImg = embedLSB(outputImg, text, key, strength);
            break;
          case 'dct':
            outputImg = embedDCT(outputImg, text, key, strength);
            break;
          case 'dwt':
            outputImg = embedDWT(outputImg, text, key, strength);
            break;
          case 'dft':
            outputImg = embedDFT(outputImg, text, key, strength);
            break;
          case 'dsss':
            outputImg = embedSpreadSpectrum(outputImg, text, key, strength);
            break;
          case 'chroma':
            outputImg = embedChroma(outputImg, text, key, strength);
            break;
          default:
            throw new Error('未知算法: ' + algo);
        }
      }
      
      self.postMessage({
        success: true,
        type: 'embed',
        pixels: outputImg.data.buffer
      }, [outputImg.data.buffer] as any);

    } else if (type === 'extract') {
      const results: Record<string, string> = {};

      // Extract from each selected algorithm in parallel/sequence
      for (const algo of algorithms) {
        let resultText = '';
        try {
          switch (algo) {
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
              throw new Error('未知算法: ' + algo);
          }
        } catch (err: any) {
          resultText = `检测出错: ${err.message}`;
        }
        results[algo] = resultText;
      }

      self.postMessage({
        success: true,
        type: 'extract',
        results
      });
    }
  } catch (error: any) {
    self.postMessage({
      success: false,
      error: error.message || '后台计算任务执行失败'
    });
  }
};
