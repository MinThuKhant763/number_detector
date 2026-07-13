const DIGIT_WHITELIST = '0123456789';
const DEFAULT_TESSERACT_OPTIONS = {
  tessedit_char_whitelist: DIGIT_WHITELIST,
  tessedit_pageseg_mode: '7',
};
const DEFAULT_SCALE = 2;
const EMPTY_CONFIDENCE = 0;

let dependencyOverrides;

export async function runOcr(image, region) {
  const { sharp, tesseract } = await loadDependencies();
  const crop = await cropAndPreprocessImage(sharp, image, region);
  const ocrResult = await tesseract.recognize(crop.buffer, 'eng', DEFAULT_TESSERACT_OPTIONS);
  const candidate = bestNumericCandidate(ocrResult);

  return {
    ...region,
    bibNumber: candidate?.bibNumber ?? '',
    ocrConfidence: candidate?.ocrConfidence ?? EMPTY_CONFIDENCE,
    ocrText: candidate?.text ?? '',
    ocrBoundingBox: crop.boundingBox,
  };
}

export function __setOcrDependenciesForTests(overrides) {
  dependencyOverrides = overrides;
}

export function __resetOcrDependenciesForTests() {
  dependencyOverrides = undefined;
}

export async function cropAndPreprocessImage(sharpFactory, image, region) {
  const input = image?.buffer ?? image;
  if (!input) {
    throw new Error('runOcr expected an image buffer or an object with a buffer property.');
  }

  const baseImage = sharpFactory(input, { failOn: 'none' });
  const metadata = await baseImage.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error('Unable to determine uploaded image dimensions for OCR cropping.');
  }

  const boundingBox = toCropCoordinates(region?.boundingBox, metadata.width, metadata.height);
  const buffer = await sharpFactory(input, { failOn: 'none' })
    .extract(boundingBox)
    .grayscale()
    .median(3)
    .threshold()
    .resize({
      width: boundingBox.width * DEFAULT_SCALE,
      height: boundingBox.height * DEFAULT_SCALE,
      kernel: 'cubic',
    })
    .png()
    .toBuffer();

  return { buffer, boundingBox };
}

export function toCropCoordinates(boundingBox, imageWidth, imageHeight) {
  if (!boundingBox) {
    throw new Error('OCR requires a region boundingBox.');
  }

  const usesPercentages = [boundingBox.x, boundingBox.y, boundingBox.width, boundingBox.height]
    .every((value) => Number.isFinite(value) && value >= 0 && value <= 100);
  const scaleX = usesPercentages ? imageWidth / 100 : 1;
  const scaleY = usesPercentages ? imageHeight / 100 : 1;
  const left = clamp(Math.floor(boundingBox.x * scaleX), 0, imageWidth - 1);
  const top = clamp(Math.floor(boundingBox.y * scaleY), 0, imageHeight - 1);
  const right = clamp(Math.ceil((boundingBox.x + boundingBox.width) * scaleX), left + 1, imageWidth);
  const bottom = clamp(Math.ceil((boundingBox.y + boundingBox.height) * scaleY), top + 1, imageHeight);

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

export function bestNumericCandidate(result) {
  const data = result?.data ?? result ?? {};
  const candidates = collectCandidates(data)
    .map((candidate) => ({
      text: String(candidate.text ?? '').trim(),
      ocrConfidence: normalizeConfidence(candidate.confidence ?? candidate.conf ?? 0),
    }))
    .map((candidate) => ({
      ...candidate,
      bibNumber: extractDigits(candidate.text),
    }))
    .filter((candidate) => candidate.bibNumber.length > 0);

  if (candidates.length === 0) {
    return undefined;
  }

  return candidates.toSorted((a, b) => b.ocrConfidence - a.ocrConfidence)[0];
}

function collectCandidates(data) {
  const words = data.words ?? data.blocks?.flatMap((block) => block.paragraphs ?? [])
    .flatMap((paragraph) => paragraph.lines ?? [])
    .flatMap((line) => line.words ?? []);

  if (Array.isArray(words) && words.length > 0) {
    return words;
  }

  return [{ text: data.text ?? '', confidence: data.confidence ?? 0 }];
}

function extractDigits(text) {
  return (text.match(/\d+/g) ?? []).join('');
}

function normalizeConfidence(confidence) {
  const parsed = Number(confidence);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.min(parsed > 1 ? parsed / 100 : parsed, 1);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

async function loadDependencies() {
  if (dependencyOverrides) {
    return dependencyOverrides;
  }

  const [{ default: sharp }, tesseract] = await Promise.all([
    import('sharp'),
    import('tesseract.js'),
  ]);
  return { sharp, tesseract };
}
