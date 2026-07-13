export function rankDetections(ocrResults) {
  return ocrResults.map((result, index) => ({
    ...result,
    id: result.id ?? `detection-${index + 1}`,
    aiConfidence: estimateAiConfidence(result),
  }));
}

function estimateAiConfidence(result) {
  const hasLikelyBib = /^\d{2,6}$/.test(result.bibNumber);
  const adjustment = hasLikelyBib ? 0.08 : -0.18;
  return Math.max(0, Math.min(1, result.ocrConfidence + adjustment));
}
