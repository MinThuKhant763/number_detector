import { readFile } from 'node:fs/promises';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

const MAX_CANDIDATES = 8;

export async function runBibDetector(image) {
  const source = await loadImageBytes(image);
  const decoded = decodeImage(source.buffer);
  const candidates = findLightRectangularRegions(decoded);
  const baseName = stableImageName(image);

  return candidates.map((candidate, index) => ({
    id: `${baseName}-candidate-${index + 1}`,
    boundingBox: candidate.boundingBox,
  }));
}

async function loadImageBytes(image) {
  if (image?.buffer) {
    return { buffer: Buffer.from(image.buffer) };
  }

  const path = image?.path ?? image?.filePath ?? image;
  if (typeof path === 'string') {
    return { buffer: await readFile(path) };
  }

  throw new TypeError('runBibDetector requires an image buffer or path.');
}

function stableImageName(image) {
  if (image?.originalName) return sanitizeIdPart(image.originalName);
  if (image?.path) return sanitizeIdPart(image.path.split(/[\\/]/).pop());
  if (typeof image === 'string') return sanitizeIdPart(image.split(/[\\/]/).pop());
  return 'uploaded-image';
}

function sanitizeIdPart(value = 'image') {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'image';
}

function decodeImage(buffer) {
  if (buffer.subarray(0, 2).equals(Buffer.from([0xff, 0xd8]))) {
    const image = jpeg.decode(buffer, { useTArray: true });
    return rgbaToRgb(image.width, image.height, image.data);
  }

  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    const image = PNG.sync.read(buffer);
    return rgbaToRgb(image.width, image.height, image.data);
  }

  return decodePortablePixmap(buffer);
}

function rgbaToRgb(width, height, rgbaPixels) {
  const pixels = Buffer.alloc(width * height * 3);
  for (let sourceOffset = 0, targetOffset = 0; sourceOffset < rgbaPixels.length; sourceOffset += 4, targetOffset += 3) {
    const alpha = rgbaPixels[sourceOffset + 3] / 255;
    pixels[targetOffset] = Math.round(rgbaPixels[sourceOffset] * alpha + 255 * (1 - alpha));
    pixels[targetOffset + 1] = Math.round(rgbaPixels[sourceOffset + 1] * alpha + 255 * (1 - alpha));
    pixels[targetOffset + 2] = Math.round(rgbaPixels[sourceOffset + 2] * alpha + 255 * (1 - alpha));
  }
  return { width, height, pixels };
}

function decodePortablePixmap(buffer) {
  let offset = 0;

  function skipWhitespaceAndComments() {
    while (offset < buffer.length) {
      const byte = buffer[offset];
      if (byte === 35) {
        while (offset < buffer.length && buffer[offset] !== 10) offset += 1;
      } else if (byte === 9 || byte === 10 || byte === 13 || byte === 32) {
        offset += 1;
      } else {
        break;
      }
    }
  }

  function readToken() {
    skipWhitespaceAndComments();
    const start = offset;
    while (offset < buffer.length && ![9, 10, 13, 32, 35].includes(buffer[offset])) offset += 1;
    return buffer.toString('ascii', start, offset);
  }

  const magic = readToken();
  if (magic !== 'P6') {
    throw new Error(`Unsupported image format for bib detector: ${magic || 'unknown'}. Supported formats are JPEG, PNG, and P6 PPM.`);
  }

  const width = Number.parseInt(readToken(), 10);
  const height = Number.parseInt(readToken(), 10);
  const maxValue = Number.parseInt(readToken(), 10);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || maxValue <= 0 || maxValue > 255) {
    throw new Error('Invalid PPM image header.');
  }

  if ([9, 10, 13, 32].includes(buffer[offset])) offset += 1;
  const expectedLength = width * height * 3;
  const pixels = buffer.subarray(offset, offset + expectedLength);
  if (pixels.length !== expectedLength) {
    throw new Error('PPM image data is truncated.');
  }

  return { width, height, pixels };
}

function findLightRectangularRegions({ width, height, pixels }) {
  const imageArea = width * height;
  const visited = new Uint8Array(imageArea);
  const isCandidatePixel = new Uint8Array(imageArea);

  for (let index = 0; index < imageArea; index += 1) {
    const pixelOffset = index * 3;
    const red = pixels[pixelOffset];
    const green = pixels[pixelOffset + 1];
    const blue = pixels[pixelOffset + 2];
    const brightness = (red + green + blue) / 3;
    const colorSpread = Math.max(red, green, blue) - Math.min(red, green, blue);
    if (brightness >= 185 && colorSpread <= 55) {
      isCandidatePixel[index] = 1;
    }
  }

  const candidates = [];
  const stack = [];

  for (let start = 0; start < imageArea; start += 1) {
    if (!isCandidatePixel[start] || visited[start]) continue;

    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let area = 0;
    visited[start] = 1;
    stack.push(start);

    while (stack.length) {
      const current = stack.pop();
      area += 1;
      const x = current % width;
      const y = Math.floor(current / width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      for (const neighbor of [current - 1, current + 1, current - width, current + width]) {
        if (neighbor < 0 || neighbor >= imageArea || visited[neighbor] || !isCandidatePixel[neighbor]) continue;
        if ((current % width === 0 && neighbor === current - 1) || (current % width === width - 1 && neighbor === current + 1)) continue;
        visited[neighbor] = 1;
        stack.push(neighbor);
      }
    }

    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    const boxArea = boxWidth * boxHeight;
    const areaRatio = boxArea / imageArea;
    const aspectRatio = boxWidth / Math.max(boxHeight, 1);
    const extent = area / Math.max(boxArea, 1);

    if (areaRatio < 0.002 || areaRatio > 0.35 || aspectRatio < 1.15 || aspectRatio > 4.8 || extent < 0.35) {
      continue;
    }

    candidates.push({
      boundingBox: { x: minX, y: minY, width: boxWidth, height: boxHeight },
      confidence: scoreCandidate(aspectRatio, extent, areaRatio),
    });
  }

  return dedupe(candidates.sort((a, b) => b.confidence - a.confidence)).slice(0, MAX_CANDIDATES);
}

function scoreCandidate(aspectRatio, extent, areaRatio) {
  const aspectScore = Math.max(0, 1 - Math.abs(aspectRatio - 2.2) / 2.6);
  const areaScore = Math.max(0, 1 - Math.abs(areaRatio - 0.06) / 0.18);
  return Math.min(1, aspectScore * 0.45 + extent * 0.35 + areaScore * 0.20);
}

function dedupe(candidates) {
  const kept = [];
  for (const candidate of candidates) {
    if (kept.every((existing) => iou(candidate.boundingBox, existing.boundingBox) < 0.45)) {
      kept.push(candidate);
    }
  }
  return kept;
}

function iou(a, b) {
  const xLeft = Math.max(a.x, b.x);
  const yTop = Math.max(a.y, b.y);
  const xRight = Math.min(a.x + a.width, b.x + b.width);
  const yBottom = Math.min(a.y + a.height, b.y + b.height);
  if (xRight <= xLeft || yBottom <= yTop) return 0;
  const intersection = (xRight - xLeft) * (yBottom - yTop);
  const union = a.width * a.height + b.width * b.height - intersection;
  return union ? intersection / union : 0;
}
