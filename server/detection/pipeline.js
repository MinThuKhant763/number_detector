import { runBibDetector } from './services/bibDetector.js';
import { runOcr } from './services/ocr.js';
import { rankDetections } from './services/aiPostProcessor.js';

export async function detectBibNumbers(image) {
  const regions = await runBibDetector(image);
  const ocrResults = await Promise.all(regions.map((region) => runOcr(image, region)));
  return rankDetections(ocrResults);
}
