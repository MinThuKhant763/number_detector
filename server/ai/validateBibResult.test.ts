import assert from 'node:assert/strict';
import { buildBibValidationPrompt, validateBibResult, type BibVisionModel } from './validateBibResult.ts';

async function run(): Promise<void> {
  const acceptedModel: BibVisionModel = {
    async validateBib() {
      return {
        containsRaceBib: true,
        bibConfidence: 0.94,
        finalNumber: '7085',
        confidence: 0.91,
        notes: ['Corrected OCR 1/7 ambiguity.'],
      };
    },
  };

  const accepted = await validateBibResult(
    { croppedBibImage: 'base64-image', ocrCandidates: [{ text: '1085', confidence: 0.64 }] },
    acceptedModel,
  );

  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.acceptedNumber, '7085');
  assert.deepEqual(accepted.rawOcrCandidates, [{ text: '1085', confidence: 0.64 }]);

  const lowConfidenceModel: BibVisionModel = {
    async validateBib() {
      return {
        containsRaceBib: true,
        bibConfidence: 0.89,
        finalNumber: '586',
        confidence: 0.51,
      };
    },
  };

  const flagged = await validateBibResult(
    { croppedBibImage: 'base64-image', ocrCandidates: [{ text: '596', confidence: 0.71 }] },
    lowConfidenceModel,
  );

  assert.equal(flagged.status, 'flagged');
  assert.equal(flagged.acceptedNumber, null);
  assert.equal(flagged.needsReview, true);
  assert.match(flagged.safeguards.join(' '), /below/);

  const prompt = buildBibValidationPrompt([{ text: '808', confidence: 0.7 }]);
  assert.match(prompt, /1\/7, 0\/8, and 5\/6/);
  assert.match(prompt, /OCR candidates/);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
