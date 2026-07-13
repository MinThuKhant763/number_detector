#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectBibNumbers } from '../server/detection/pipeline.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const labelsPath = path.join(repoRoot, 'samples', 'labels.json');
const imagesDir = path.join(repoRoot, 'samples', 'images');

function normalizeBibNumber(value) {
  return value == null ? '' : String(value).trim();
}

function detectionBibNumber(detection) {
  return normalizeBibNumber(detection.bibNumber ?? detection.bib_number ?? detection.number);
}

function detectionConfidence(detection) {
  const confidence = detection.ocrConfidence ?? detection.ocr_confidence ?? detection.confidence;
  return Number.isFinite(confidence) ? confidence : null;
}

function normalizeBox(box) {
  if (!box) return null;
  const normalized = {
    x: Number(box.x),
    y: Number(box.y),
    width: Number(box.width ?? box.w),
    height: Number(box.height ?? box.h),
  };
  return Object.values(normalized).every(Number.isFinite) ? normalized : null;
}

function detectionBox(detection) {
  return normalizeBox(detection.boundingBox ?? detection.bbox ?? detection.box);
}

export function calculateIoU(firstBox, secondBox) {
  const a = normalizeBox(firstBox);
  const b = normalizeBox(secondBox);
  if (!a || !b) return null;

  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : null;
}

function mean(values) {
  const finiteValues = values.filter(Number.isFinite);
  return finiteValues.length > 0
    ? finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length
    : null;
}

function formatMetric(value) {
  return value == null ? 'n/a' : value.toFixed(3);
}

function matchDetections(labels, detections) {
  const unmatchedLabelIndexes = new Set(labels.map((_, index) => index));
  const matches = [];
  const falsePositives = [];

  detections.forEach((detection, detectionIndex) => {
    const detectedBib = detectionBibNumber(detection);
    let matchedLabelIndex = null;

    for (const labelIndex of unmatchedLabelIndexes) {
      if (normalizeBibNumber(labels[labelIndex].bib_number) === detectedBib) {
        matchedLabelIndex = labelIndex;
        break;
      }
    }

    if (matchedLabelIndex == null) {
      falsePositives.push({ detection, detectionIndex });
      return;
    }

    unmatchedLabelIndexes.delete(matchedLabelIndex);
    matches.push({ label: labels[matchedLabelIndex], detection, detectionIndex });
  });

  return {
    matches,
    falsePositives,
    missedLabels: [...unmatchedLabelIndexes].map((labelIndex) => ({
      label: labels[labelIndex],
      labelIndex,
    })),
  };
}

async function imageForLabel(label) {
  const imagePath = path.join(imagesDir, label.image);
  const buffer = await fs.readFile(imagePath);
  return {
    buffer,
    mimeType: mimeTypeForPath(imagePath),
    originalName: label.image,
    path: imagePath,
  };
}

function mimeTypeForPath(imagePath) {
  const extension = path.extname(imagePath).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.webp') return 'image/webp';
  return 'image/jpeg';
}

export async function evaluateDetection({ labelsFile = labelsPath } = {}) {
  const labels = JSON.parse(await fs.readFile(labelsFile, 'utf8'));
  const perImage = [];
  const correctConfidences = [];
  const incorrectConfidences = [];
  const ious = [];
  let totalLabels = 0;
  let totalPredictions = 0;
  let truePositives = 0;

  for (const imageLabel of labels) {
    const expectedBibs = imageLabel.bibs ?? [];
    totalLabels += expectedBibs.length;

    let detections;
    try {
      detections = await detectBibNumbers(await imageForLabel(imageLabel));
    } catch (error) {
      perImage.push({
        image: imageLabel.image,
        error: error.message,
        falsePositives: [],
        missedBibs: expectedBibs.map((bib) => normalizeBibNumber(bib.bib_number)),
        ious: [],
      });
      continue;
    }

    totalPredictions += detections.length;
    const { matches, falsePositives, missedLabels } = matchDetections(expectedBibs, detections);
    truePositives += matches.length;

    for (const { label, detection } of matches) {
      const confidence = detectionConfidence(detection);
      if (confidence != null) correctConfidences.push(confidence);
      const iou = calculateIoU(label.bbox, detectionBox(detection));
      if (iou != null) ious.push(iou);
    }

    for (const { detection } of falsePositives) {
      const confidence = detectionConfidence(detection);
      if (confidence != null) incorrectConfidences.push(confidence);
    }

    perImage.push({
      image: imageLabel.image,
      falsePositives: falsePositives.map(({ detection }) => detectionBibNumber(detection) || '(blank)'),
      missedBibs: missedLabels.map(({ label }) => normalizeBibNumber(label.bib_number)),
      ious: matches
        .map(({ label, detection }) => ({
          bibNumber: normalizeBibNumber(label.bib_number),
          iou: calculateIoU(label.bbox, detectionBox(detection)),
        }))
        .filter(({ iou }) => iou != null),
    });
  }

  const precision = totalPredictions > 0 ? truePositives / totalPredictions : 0;
  const recall = totalLabels > 0 ? truePositives / totalLabels : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return {
    summary: {
      images: labels.length,
      labeledBibs: totalLabels,
      predictions: totalPredictions,
      exactBibNumberAccuracy: totalLabels > 0 ? truePositives / totalLabels : 0,
      precision,
      recall,
      f1,
      meanIoU: mean(ious),
      meanOcrConfidenceCorrect: mean(correctConfidences),
      meanOcrConfidenceIncorrect: mean(incorrectConfidences),
    },
    perImage,
  };
}

function printReport(report) {
  const { summary } = report;
  console.log('Detection evaluation');
  console.log(`Images: ${summary.images}`);
  console.log(`Labeled bibs: ${summary.labeledBibs}`);
  console.log(`Predictions: ${summary.predictions}`);
  console.log(`Exact bib-number accuracy: ${formatMetric(summary.exactBibNumberAccuracy)}`);
  console.log(`Precision: ${formatMetric(summary.precision)}`);
  console.log(`Recall: ${formatMetric(summary.recall)}`);
  console.log(`F1: ${formatMetric(summary.f1)}`);
  console.log(`Mean IoU: ${formatMetric(summary.meanIoU)}`);
  console.log(`Mean OCR confidence (correct): ${formatMetric(summary.meanOcrConfidenceCorrect)}`);
  console.log(`Mean OCR confidence (incorrect): ${formatMetric(summary.meanOcrConfidenceIncorrect)}`);
  console.log('\nPer-image errors and IoU:');
  for (const image of report.perImage) {
    console.log(`- ${image.image}`);
    if (image.error) console.log(`  error: ${image.error}`);
    console.log(`  false positives: ${image.falsePositives.length ? image.falsePositives.join(', ') : 'none'}`);
    console.log(`  missed bibs: ${image.missedBibs.length ? image.missedBibs.join(', ') : 'none'}`);
    console.log(`  IoU: ${image.ious.length ? image.ious.map(({ bibNumber, iou }) => `${bibNumber}=${formatMetric(iou)}`).join(', ') : 'n/a'}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  evaluateDetection()
    .then(printReport)
    .catch((error) => {
      console.error(`Evaluation failed: ${error.message}`);
      process.exitCode = 1;
    });
}
