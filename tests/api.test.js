/* global File, Response */
import assert from 'node:assert/strict';
import test from 'node:test';

import { detectBibNumbers, normalizeDetectionResponse, validateRaceImage } from '../src/lib/api.js';

function file(name, type = 'image/jpeg') {
  return new File(['fake-image'], name, { type });
}

test('production detection validates image files before upload', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('fetch should not be called for invalid files');
  };

  try {
    assert.equal(validateRaceImage(file('notes.txt', 'text/plain')), 'Detection failed: the selected file is not an image.');
    await assert.rejects(() => detectBibNumbers(file('notes.txt', 'text/plain')), /not an image/);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('production detection sends the uploaded file to POST /api/detect', async () => {
  const originalFetch = globalThis.fetch;
  const uploaded = file('runner.jpg');
  let request;

  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ detections: [] }), { status: 200 });
  };

  try {
    await detectBibNumbers(uploaded);
    assert.equal(request.url, '/api/detect');
    assert.equal(request.options.method, 'POST');
    assert.equal(request.options.body.get('image'), uploaded);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('production detection preserves backend bib numbers, confidences, and bounding boxes for rendering', async () => {
  const payload = normalizeDetectionResponse({
    detections: [
      {
        id: 'backend-1',
        bib_number: '9087',
        confidence: 0.873,
        ai_confidence: 0.931,
        bbox: { x: 12, y: 34, width: 21, height: 9 },
      },
    ],
  });

  assert.deepEqual(payload.detections, [
    {
      id: 'backend-1',
      bib_number: '9087',
      confidence: 0.873,
      ai_confidence: 0.931,
      bbox: { x: 12, y: 34, width: 21, height: 9 },
      bibNumber: '9087',
      ocrConfidence: 0.873,
      aiConfidence: 0.931,
      pixelBoundingBox: { x: 12, y: 34, width: 21, height: 9 },
      boundingBox: { x: 12, y: 34, width: 21, height: 9 },
    },
  ]);
});

test('production detection converts backend pixel boxes to frontend overlay percentages when image size is present', () => {
  const payload = normalizeDetectionResponse({
    image: { width: 800, height: 400 },
    detections: [
      {
        id: 'backend-1',
        bibNumber: '1284',
        confidence: 0.91,
        boundingBox: { x: 200, y: 100, width: 160, height: 80 },
      },
    ],
  });

  assert.deepEqual(payload.detections[0].pixelBoundingBox, { x: 200, y: 100, width: 160, height: 80 });
  assert.deepEqual(payload.detections[0].boundingBox, { x: 25, y: 25, width: 20, height: 20 });
});
