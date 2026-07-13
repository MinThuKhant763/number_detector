import test from 'node:test';
import assert from 'node:assert/strict';
import { rankDetections } from '../server/detection/services/aiPostProcessor.js';

function detection(overrides = {}) {
  return {
    id: 'bib-1',
    bibNumber: '1085',
    ocrConfidence: 0.64,
    croppedBibImage: 'crop-bytes',
    ocrCandidates: [
      { text: '1085', confidence: 0.64, engine: 'mock-ocr' },
      { text: '7085', confidence: 0.58, engine: 'mock-ocr' },
    ],
    ...overrides,
  };
}

test('accepts high-confidence AI validated bib detections and preserves OCR candidates', async () => {
  const calls = [];
  const bibVisionModel = {
    async validateBib(request) {
      calls.push(request);
      return {
        containsRaceBib: true,
        bibConfidence: 0.94,
        finalNumber: '7085',
        confidence: 0.91,
        notes: ['Corrected OCR 1/7 ambiguity.'],
      };
    },
  };

  const [result] = await rankDetections([detection()], { bibVisionModel });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].croppedBibImage, 'crop-bytes');
  assert.deepEqual(calls[0].ocrCandidates, detection().ocrCandidates);
  assert.equal(result.validationStatus, 'accepted');
  assert.equal(result.bibNumber, '7085');
  assert.equal(result.acceptedBibNumber, '7085');
  assert.deepEqual(result.rawOcrCandidates, detection().ocrCandidates);
});

test('flags low-confidence AI corrections instead of accepting corrected numbers', async () => {
  const bibVisionModel = {
    async validateBib() {
      return {
        containsRaceBib: true,
        bibConfidence: 0.9,
        finalNumber: '7085',
        confidence: 0.7,
      };
    },
  };

  const [result] = await rankDetections([detection()], {
    bibVisionModel,
    minimumAcceptConfidence: 0.82,
  });

  assert.equal(result.validationStatus, 'flagged');
  assert.equal(result.needsReview, true);
  assert.equal(result.bibNumber, '1085');
  assert.equal(result.acceptedBibNumber, null);
  assert.equal(result.aiCorrectedNumber, '7085');
  assert.match(result.aiValidation.safeguards.join(' '), /below 0\.82/);
});

test('rejects detections when the AI model does not validate a race bib', async () => {
  const bibVisionModel = {
    async validateBib() {
      return {
        containsRaceBib: false,
        bibConfidence: 0.2,
        finalNumber: null,
        confidence: 0.1,
      };
    },
  };

  const [result] = await rankDetections([detection()], { bibVisionModel });

  assert.equal(result.validationStatus, 'rejected');
  assert.equal(result.needsReview, true);
  assert.equal(result.acceptedBibNumber, null);
  assert.equal(result.bibNumber, '1085');
  assert.match(result.aiValidation.safeguards.join(' '), /did not confirm/);
});
