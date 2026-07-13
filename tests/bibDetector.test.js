import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { test } from 'node:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runBibDetector } from '../server/detection/services/bibDetector.js';

function ppmWithBib({ width = 120, height = 80, box }) {
  const pixels = Buffer.alloc(width * height * 3, 35);
  for (let y = box.y; y < box.y + box.height; y += 1) {
    for (let x = box.x; x < box.x + box.width; x += 1) {
      const offset = (y * width + x) * 3;
      pixels[offset] = 240;
      pixels[offset + 1] = 240;
      pixels[offset + 2] = 235;
    }
  }
  return Buffer.concat([Buffer.from(`P6\n${width} ${height}\n255\n`, 'ascii'), pixels]);
}

test('runBibDetector analyzes image buffers and returns image-specific candidate boxes', async () => {
  const first = await runBibDetector({ originalName: 'left.ppm', buffer: ppmWithBib({ box: { x: 8, y: 12, width: 38, height: 18 } }) });
  const second = await runBibDetector({ originalName: 'right.ppm', buffer: ppmWithBib({ box: { x: 62, y: 44, width: 44, height: 16 } }) });

  assert.equal(first[0].id, 'left.ppm-candidate-1');
  assert.deepEqual(first[0].boundingBox, { x: 8, y: 12, width: 38, height: 18 });
  assert.equal(second[0].id, 'right.ppm-candidate-1');
  assert.deepEqual(second[0].boundingBox, { x: 62, y: 44, width: 44, height: 16 });
  assert.notDeepEqual(first[0].boundingBox, second[0].boundingBox);
});

test('runBibDetector can analyze an image path', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'bib-detector-'));
  const filePath = path.join(dir, 'path-image.ppm');
  await writeFile(filePath, ppmWithBib({ box: { x: 20, y: 30, width: 50, height: 20 } }));

  const detections = await runBibDetector(filePath);

  assert.equal(detections[0].id, 'path-image.ppm-candidate-1');
  assert.deepEqual(detections[0].boundingBox, { x: 20, y: 30, width: 50, height: 20 });
});
