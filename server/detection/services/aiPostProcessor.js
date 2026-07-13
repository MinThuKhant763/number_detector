import { validateBibResult } from '../../ai/validateBibResult.ts';

const DEFAULT_VALIDATION_OPTIONS = Object.freeze({
  minimumAcceptConfidence: 0.82,
  minimumBibConfidence: 0.75,
});

export async function rankDetections(ocrResults, options = {}) {
  const baseDetections = ocrResults.map((result, index) => ({
    ...result,
    id: result.id ?? `detection-${index + 1}`,
    rawOcrCandidates: getOcrCandidates(result),
    aiConfidence: estimateAiConfidence(result),
  }));

  if (!options.bibVisionModel) {
    return baseDetections;
  }

  return Promise.all(
    baseDetections.map((detection) => validateDetection(detection, options)),
  );
}

async function validateDetection(detection, options) {
  const validation = await validateBibResult(
    {
      croppedBibImage: getCroppedBibImage(detection, options.image),
      ocrCandidates: detection.rawOcrCandidates,
      minimumAcceptConfidence:
        options.minimumAcceptConfidence ?? DEFAULT_VALIDATION_OPTIONS.minimumAcceptConfidence,
      minimumBibConfidence:
        options.minimumBibConfidence ?? DEFAULT_VALIDATION_OPTIONS.minimumBibConfidence,
    },
    options.bibVisionModel,
  );

  return {
    ...detection,
    rawOcrCandidates: validation.rawOcrCandidates,
    aiValidation: validation,
    validationStatus: validation.status,
    needsReview: validation.needsReview,
    aiCorrectedNumber: validation.aiCorrected.finalNumber,
    aiConfidence: validation.aiCorrected.confidence,
    bibConfidence: validation.aiCorrected.bibConfidence,
    bibNumber: validation.acceptedNumber ?? detection.bibNumber,
    acceptedBibNumber: validation.acceptedNumber,
  };
}

function getOcrCandidates(result) {
  if (Array.isArray(result.ocrCandidates)) {
    return result.ocrCandidates.map(normalizeCandidate).filter(Boolean);
  }

  if (result.bibNumber) {
    return [
      {
        text: result.bibNumber,
        confidence: result.ocrConfidence ?? 0,
        engine: result.ocrEngine,
      },
    ];
  }

  return [];
}

function normalizeCandidate(candidate) {
  if (!candidate || candidate.text === undefined || candidate.text === null) {
    return null;
  }

  return {
    text: String(candidate.text),
    confidence: candidate.confidence ?? 0,
    ...(candidate.engine ? { engine: candidate.engine } : {}),
  };
}

function getCroppedBibImage(detection, image) {
  return detection.croppedBibImage ?? detection.crop ?? image?.croppedBibImage ?? image?.buffer ?? image;
}

function estimateAiConfidence(result) {
  const hasLikelyBib = /^\d{2,6}$/.test(result.bibNumber);
  const adjustment = hasLikelyBib ? 0.08 : -0.18;
  return Math.max(0, Math.min(1, (result.ocrConfidence ?? 0) + adjustment));
}
