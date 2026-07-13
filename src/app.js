import { detectBibNumbers, validateRaceImage } from './lib/api.js';
import { formatConfidence } from './detector.js';

const input = document.querySelector('#race-image-input');
const status = document.querySelector('#status');
const stage = document.querySelector('#image-stage');
const resultsBody = document.querySelector('#results-body');
const detectionCount = document.querySelector('#detection-count');

let imageUrl = '';

input.addEventListener('change', async (event) => {
  const [file] = event.target.files;
  await handleUpload(file);
});

document.querySelector('.drop-zone').addEventListener('dragover', (event) => {
  event.preventDefault();
  event.currentTarget.classList.add('drop-zone--active');
});

document.querySelector('.drop-zone').addEventListener('dragleave', (event) => {
  event.currentTarget.classList.remove('drop-zone--active');
});

document.querySelector('.drop-zone').addEventListener('drop', async (event) => {
  event.preventDefault();
  event.currentTarget.classList.remove('drop-zone--active');
  const [file] = event.dataTransfer.files;
  input.files = event.dataTransfer.files;
  await handleUpload(file);
});

async function handleUpload(file) {
  const validationError = validateRaceImage(file);
  if (validationError) {
    renderError(validationError);
    return;
  }

  if (imageUrl) URL.revokeObjectURL(imageUrl);
  imageUrl = URL.createObjectURL(file);
  renderLoading(imageUrl);

  try {
    const { detections } = await detectBibNumbers(file);
    renderImage(imageUrl, detections);
    renderResults(detections);
    if (detections.length === 0) {
      renderStatus('empty', 'No bibs were detected in this image. Try another image or adjust detection settings.');
    } else {
      renderStatus('success', `${detections.length} bib detections ready for review.`);
    }
  } catch (error) {
    renderError(error.message);
  }
}

function renderLoading(src) {
  renderStatus('loading', 'Detecting bib numbers…');
  detectionCount.textContent = 'Scanning';
  stage.className = 'image-stage';
  stage.innerHTML = `<img src="${src}" alt="Uploaded race" /><div class="stage-overlay stage-overlay--loading">Analyzing image…</div>`;
  resultsBody.innerHTML = '<tr class="empty-row"><td colspan="5">Detection is running. Results will appear here shortly.</td></tr>';
}

function renderImage(src, detections) {
  detectionCount.textContent = `${detections.length} detection${detections.length === 1 ? '' : 's'}`;
  stage.className = detections.length ? 'image-stage' : 'image-stage image-stage--empty-detections';
  const boxes = detections.map((detection) => `
    <div class="bbox" style="left:${detection.boundingBox.x}%;top:${detection.boundingBox.y}%;width:${detection.boundingBox.width}%;height:${detection.boundingBox.height}%">
      <span>${detection.bibNumber}</span>
    </div>
  `).join('');
  stage.innerHTML = `<img src="${src}" alt="Uploaded race with detected bib boxes" />${boxes}`;
}

function renderResults(detections) {
  if (detections.length === 0) {
    resultsBody.innerHTML = '<tr class="empty-row"><td colspan="5">No detections were returned for this image.</td></tr>';
    return;
  }

  resultsBody.innerHTML = detections.map((detection) => `
    <tr>
      <td><strong>${detection.bibNumber}</strong></td>
      <td>${formatConfidence(detection.ocrConfidence)}</td>
      <td>${formatConfidence(detection.aiConfidence)}</td>
      <td>
        <div class="crop-preview" style="background-image:url('${imageUrl}')">
          <span>${detection.bibNumber}</span>
        </div>
      </td>
      <td>
        <label class="sr-only" for="correction-${detection.id}">Correct ${detection.bibNumber}</label>
        <input id="correction-${detection.id}" class="correction-input" value="${detection.bibNumber}" inputmode="numeric" />
      </td>
    </tr>
  `).join('');
}

function renderError(message) {
  detectionCount.textContent = '0 detections';
  renderStatus('error', message);
  stage.className = 'image-stage image-stage--empty';
  stage.innerHTML = '<p>Detection failed. Upload another image to try again.</p>';
  resultsBody.innerHTML = '<tr class="empty-row"><td colspan="5">No results are available because detection failed.</td></tr>';
}

function renderStatus(type, message) {
  status.className = `status status--${type}`;
  status.textContent = message;
}
