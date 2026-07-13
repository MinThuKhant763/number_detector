import test from 'node:test';
import assert from 'node:assert/strict';
import { detectBibs, formatConfidence, validateRaceImage } from '../src/detector.js';

function file(name, type = 'image/jpeg') {
  return { name, type };
}

test('validates missing and non-image uploads', () => {
  assert.equal(validateRaceImage(), 'Select an image before running detection.');
  assert.equal(validateRaceImage(file('notes.txt', 'text/plain')), 'Detection failed: the selected file is not an image.');
});

test('returns demo detections for race images with editable defaults', async () => {
  const detections = await detectBibs(file('race.jpg'));
  assert.equal(detections.length, 3);
  assert.equal(detections[0].correctedNumber, detections[0].number);
});

test('supports empty and failed detection states', async () => {
  assert.deepEqual(await detectBibs(file('empty-finish.jpg')), []);
  await assert.rejects(() => detectBibs(file('fail-finish.jpg')), /Detection failed/);
});

test('formats confidence as a percentage', () => {
  assert.equal(formatConfidence(0.874), '87%');
});
