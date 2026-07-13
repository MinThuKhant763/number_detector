const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL ?? '';

export function validateRaceImage(file) {
  if (!file) return 'Select an image before running detection.';
  if (!file.type?.startsWith('image/')) return 'Detection failed: the selected file is not an image.';
  return '';
}

function normalizeBoundingBox(detection) {
  return detection.boundingBox ?? detection.bbox ?? detection.box ?? { x: 0, y: 0, width: 0, height: 0 };
}

export function normalizeDetection(detection, index = 0) {
  const bibNumber = detection.bibNumber ?? detection.bib_number ?? detection.number ?? '';

  return {
    ...detection,
    id: detection.id ?? `bib-${index + 1}`,
    bibNumber: String(bibNumber),
    ocrConfidence: detection.ocrConfidence ?? detection.ocr_confidence ?? detection.confidence ?? 0,
    aiConfidence: detection.aiConfidence ?? detection.ai_confidence ?? null,
    boundingBox: normalizeBoundingBox(detection),
  };
}

export function normalizeDetectionResponse(payload) {
  return {
    ...payload,
    detections: (payload.detections ?? []).map(normalizeDetection),
  };
}

export async function detectBibNumbers(imageFile) {
  const validationError = validateRaceImage(imageFile);
  if (validationError) throw new Error(validationError);

  const body = new FormData();
  body.append('image', imageFile);

  const response = await fetch(`${API_BASE_URL}/api/detect`, {
    method: 'POST',
    body,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Detection API returned ${response.status}`);
  }

  return normalizeDetectionResponse(await response.json());
}
