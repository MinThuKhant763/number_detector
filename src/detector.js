const DETECTION_TEMPLATES = [
  { number: '1042', ocrConfidence: 0.94, aiConfidence: 0.91, box: { x: 14, y: 31, width: 18, height: 13 } },
  { number: '238', ocrConfidence: 0.87, aiConfidence: 0.83, box: { x: 49, y: 38, width: 15, height: 11 } },
  { number: '7716', ocrConfidence: 0.78, aiConfidence: 0.86, box: { x: 69, y: 28, width: 17, height: 12 } }
];

export function validateRaceImage(file) {
  if (!file) return 'Select an image before running detection.';
  if (!file.type?.startsWith('image/')) return 'Detection failed: the selected file is not an image.';
  return '';
}

export async function detectBibs(file) {
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
    id: `bib-${index + 1}`,
    correctedNumber: detection.number
  }));
}

export function formatConfidence(value) {
  return `${Math.round(value * 100)}%`;
}
