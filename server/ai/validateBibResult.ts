export type BibValidationStatus = 'accepted' | 'flagged' | 'rejected';

export interface OcrCandidate {
  text: string;
  confidence: number;
  engine?: string;
}

export interface AiBibValidationRequest {
  croppedBibImage: Uint8Array | string;
  ocrCandidates: OcrCandidate[];
  minimumAcceptConfidence?: number;
  minimumBibConfidence?: number;
}

export interface AiBibModelResult {
  containsRaceBib: boolean;
  bibConfidence: number;
  finalNumber: string | null;
  confidence: number;
  notes?: string[];
}

export interface BibValidationResult {
  rawOcrCandidates: OcrCandidate[];
  aiCorrected: AiBibModelResult;
  status: BibValidationStatus;
  acceptedNumber: string | null;
  needsReview: boolean;
  safeguards: string[];
}

export interface BibVisionModel {
  validateBib(request: AiBibValidationRequest): Promise<AiBibModelResult>;
}

const DEFAULT_MINIMUM_ACCEPT_CONFIDENCE = 0.82;
const DEFAULT_MINIMUM_BIB_CONFIDENCE = 0.75;

/**
 * Runs OCR candidates and a cropped bib image through an AI vision layer, while
 * preserving raw OCR and preventing low-confidence corrections from being
 * silently accepted.
 */
export async function validateBibResult(
  request: AiBibValidationRequest,
  model: BibVisionModel,
): Promise<BibValidationResult> {
  const minimumAcceptConfidence =
    request.minimumAcceptConfidence ?? DEFAULT_MINIMUM_ACCEPT_CONFIDENCE;
  const minimumBibConfidence =
    request.minimumBibConfidence ?? DEFAULT_MINIMUM_BIB_CONFIDENCE;

  const aiCorrected = await model.validateBib(request);
  const safeguards = buildSafeguards(aiCorrected, minimumAcceptConfidence, minimumBibConfidence);
  const hasPlausibleNumber = aiCorrected.finalNumber !== null && /^\d+$/.test(aiCorrected.finalNumber);

  let status: BibValidationStatus = 'accepted';
  let acceptedNumber: string | null = aiCorrected.finalNumber;

  if (!aiCorrected.containsRaceBib || aiCorrected.bibConfidence < minimumBibConfidence) {
    status = 'rejected';
    acceptedNumber = null;
  } else if (!hasPlausibleNumber || aiCorrected.confidence < minimumAcceptConfidence) {
    status = 'flagged';
    acceptedNumber = null;
  }

  return {
    rawOcrCandidates: request.ocrCandidates,
    aiCorrected,
    status,
    acceptedNumber,
    needsReview: status !== 'accepted',
    safeguards,
  };
}

function buildSafeguards(
  result: AiBibModelResult,
  minimumAcceptConfidence: number,
  minimumBibConfidence: number,
): string[] {
  const safeguards: string[] = [];

  if (!result.containsRaceBib) {
    safeguards.push('AI model did not confirm that the crop contains a race bib.');
  }

  if (result.bibConfidence < minimumBibConfidence) {
    safeguards.push(
      `Race-bib confidence ${result.bibConfidence.toFixed(2)} is below ${minimumBibConfidence.toFixed(2)}.`,
    );
  }

  if (result.finalNumber === null || !/^\d+$/.test(result.finalNumber)) {
    safeguards.push('AI model did not return a plausible digits-only bib number.');
  }

  if (result.confidence < minimumAcceptConfidence) {
    safeguards.push(
      `AI correction confidence ${result.confidence.toFixed(2)} is below ${minimumAcceptConfidence.toFixed(2)}.`,
    );
  }

  return safeguards;
}

/**
 * Formats a provider-neutral prompt for vision-capable AI models. Adapters can
 * pair this prompt with the cropped image and OCR candidates before calling a
 * vendor SDK.
 */
export function buildBibValidationPrompt(ocrCandidates: OcrCandidate[]): string {
  const candidates = ocrCandidates
    .map((candidate, index) => `${index + 1}. "${candidate.text}" (${candidate.confidence})`)
    .join('\n');

  return [
    'Inspect the cropped race image and validate the bib number.',
    'Confirm whether the crop contains a race bib.',
    'Use OCR candidates as hints, not ground truth.',
    'Correct ambiguous digits such as 1/7, 0/8, and 5/6 only when visually supported.',
    'Return JSON with containsRaceBib, bibConfidence, finalNumber, confidence, and notes.',
    'OCR candidates:',
    candidates || 'No OCR candidates were produced.',
  ].join('\n');
}
