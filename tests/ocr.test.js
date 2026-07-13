import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import {
  __resetOcrDependenciesForTests,
  __setOcrDependenciesForTests,
  bestNumericCandidate,
  runOcr,
  toCropCoordinates,
} from '../server/detection/services/ocr.js';

function sharpMock(expected) {
  const calls = [];
  const factory = () => ({
    metadata: async () => ({ width: 400, height: 200 }),
    extract: (box) => {
      calls.push(['extract', box]);
      return factory();
    },
    grayscale: () => {
      calls.push(['grayscale']);
      return factory();
    },
    median: (size) => {
      calls.push(['median', size]);
      return factory();
    },
    threshold: () => {
      calls.push(['threshold']);
      return factory();
    },
    resize: (options) => {
      calls.push(['resize', options]);
      return factory();
    },
    png: () => {
      calls.push(['png']);
      return factory();
    },
    toBuffer: async () => expected,
  });
  factory.calls = calls;
  return factory;
}

test.afterEach(() => {
  __resetOcrDependenciesForTests();
});

test('converts percentage bounding boxes into image crop coordinates', () => {
  assert.deepEqual(toCropCoordinates({ x: 25, y: 10, width: 50, height: 40 }, 800, 600), {
    left: 200,
    top: 60,
    width: 400,
    height: 240,
  });
});

test('extracts the best numeric OCR candidate and propagates confidence', async () => {
  const preprocessed = Buffer.from('prepared crop');
  const sharp = sharpMock(preprocessed);
  const tesseract = {
    recognize: async (buffer, language, options) => {
      assert.equal(buffer, preprocessed);
      assert.equal(language, 'eng');
      assert.equal(options.tessedit_char_whitelist, '0123456789');
      return {
        data: {
          words: [
            { text: 'bib', confidence: 99 },
            { text: '12 34', confidence: 87 },
            { text: '567', confidence: 63 },
          ],
        },
      };
    },
  };
  __setOcrDependenciesForTests({ sharp, tesseract });

  const result = await runOcr(
    { buffer: Buffer.from('image') },
    { id: 'candidate-1', boundingBox: { x: 25, y: 10, width: 50, height: 40 } },
  );

  assert.equal(result.bibNumber, '1234');
  assert.equal(result.ocrConfidence, 0.87);
  assert.equal(result.ocrText, '12 34');
  assert.deepEqual(result.ocrBoundingBox, { left: 100, top: 20, width: 200, height: 80 });
  assert.deepEqual(sharp.calls, [
    ['extract', { left: 100, top: 20, width: 200, height: 80 }],
    ['grayscale'],
    ['median', 3],
    ['threshold'],
    ['resize', { width: 400, height: 160, kernel: 'cubic' }],
    ['png'],
  ]);
});

test('returns an empty low-confidence result when OCR finds no digits', async () => {
  __setOcrDependenciesForTests({
    sharp: sharpMock(Buffer.from('prepared crop')),
    tesseract: { recognize: async () => ({ data: { words: [{ text: 'ABC', confidence: 91 }] } }) },
  });

  const result = await runOcr(
    { buffer: Buffer.from('image') },
    { id: 'candidate-2', boundingBox: { x: 0, y: 0, width: 10, height: 10 } },
  );

  assert.equal(result.bibNumber, '');
  assert.equal(result.ocrConfidence, 0);
  assert.equal(result.ocrText, '');
});

test('normalizes fallback OCR text and confidence scales', () => {
  assert.deepEqual(bestNumericCandidate({ data: { text: 'No. 42', confidence: 0.73 } }), {
    text: 'No. 42',
    ocrConfidence: 0.73,
    bibNumber: '42',
  });
});
