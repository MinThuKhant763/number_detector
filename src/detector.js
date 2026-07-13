import { validateRaceImage } from './lib/api.js';

const DETECTION_TEMPLATES = [
  { bibNumber: '1042', ocrConfidence: 0.94, aiConfidence: 0.91, boundingBox: { x: 14, y: 31, width: 18, height: 13 } },
  { bibNumber: '238', ocrConfidence: 0.87, aiConfidence: 0.83, boundingBox: { x: 49, y: 38, width: 15, height: 11 } },
  { bibNumber: '7716', ocrConfidence: 0.78, aiConfidence: 0.86, boundingBox: { x: 69, y: 28, width: 17, height: 12 } }
];

export { validateRaceImage };

// Local mock detector for tests, stories, and demo-only flows. Production upload paths
// should call detectBibNumbers from src/lib/api.js so images are sent to POST /api/detect.
export async function detectMockBibs(file) {
  const validationError = validateRaceImage(file);
  if (validationError) throw new Error(validationError);

  await new Promise((resolve) => setTimeout(resolve, 700));

  if (/fail|error/i.test(file.name)) {
    throw new Error('Detection failed. Please try another image or rerun the detector.');
  }

  if (/empty|none/i.test(file.name)) {
    return [];
  }

  return DETECTION_TEMPLATES.map((detection, index) => ({
    ...detection,
    id: `mock-bib-${index + 1}`,
    correctedNumber: detection.bibNumber
  }));
}

export const detectBibs = detectMockBibs;

export function formatConfidence(value) {
  if (value == null) return 'N/A';
  return `${Math.round(value * 100)}%`;
}
