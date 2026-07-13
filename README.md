# Number Detector

Number Detector is a starter project for identifying race bib numbers in uploaded runner images. The intended workflow combines image upload, bib detection, optical character recognition (OCR), and optional AI-assisted post-processing to return likely bib numbers with confidence metadata.

## Project purpose

Race photos often contain visible bib numbers that can be used to match athletes with event results or photo galleries. This project documents a repeatable pipeline for:

- accepting a test race image,
- locating candidate bib regions,
- reading numbers from those regions,
- validating or correcting OCR output with AI assistance, and
- evaluating results against labeled sample data.

## Setup

This repository currently contains documentation and sample-data conventions. Add the application code, model weights, and dependency files that match your implementation stack.

Recommended setup flow:

1. Clone the repository.
2. Create and activate a local development environment for your chosen runtime.
3. Install the web framework, computer-vision, OCR, and AI SDK dependencies used by your implementation.
4. Place local test race images in `samples/images/`.
5. Add expected outputs to `samples/labels.json`.
6. Run the application or evaluation script provided by your implementation.

Example directory layout:

```text
number_detector/
├── README.md
├── samples/
│   ├── images/
│   │   └── .gitkeep
│   └── labels.json
└── <application files>
```

## Uploading an image

Use the upload entry point supplied by your application. A typical web workflow should look like this:

1. Open the local or deployed Number Detector application.
2. Choose a race photo from your machine.
3. Submit the image through the upload form or API endpoint.
4. Review the returned detections, including bib number, confidence score, and optional bounding box.

A typical API workflow can expose an endpoint similar to:

```http
POST /detect
Content-Type: multipart/form-data

image=<race-photo.jpg>
```

A successful response should include one or more detected bibs:

```json
{
  "image": "race_001.jpg",
  "detections": [
    {
      "bib_number": "1284",
      "confidence": 0.92,
      "bbox": { "x": 412, "y": 288, "width": 96, "height": 44 }
    }
  ]
}
```

## Detection, OCR, and AI pipeline

The recommended processing pipeline is:

1. **Image intake**: Validate file type and size, normalize orientation, and resize large images while preserving aspect ratio.
2. **Preprocessing**: Improve readability with contrast adjustment, denoising, sharpening, or perspective correction when appropriate.
3. **Bib detection**: Locate candidate bib regions using an object detector, contour-based heuristics, or a hybrid approach.
4. **Region extraction**: Crop each candidate bib area and optionally expand the crop to include the full number.
5. **OCR**: Run OCR on each crop to read numeric text.
6. **AI post-processing**: Use an AI model to reconcile uncertain OCR output, reject non-bib text, normalize formatting, and reason over multiple candidate readings.
7. **Result ranking**: Return bib numbers with confidence scores, bounding boxes, and any warnings about low-quality input.
8. **Evaluation**: Compare predictions with `samples/labels.json` to measure exact-match accuracy and, when bounding boxes are provided, localization quality.

## Sample images

Store test race images in `samples/images/`. This directory is intentionally kept in the repository with a `.gitkeep` file, but image files are not required for the initial documentation-only setup.

Suggested file naming:

- `race_001.jpg`
- `race_002.jpg`
- `marathon_finish_001.png`

When adding real race images, make sure you have permission to store and use them. Avoid committing sensitive images unless the repository is private and the images are approved for that use.

## Evaluation label format

Expected labels live in `samples/labels.json`. Each item represents one image and the bibs expected in that image. Bounding boxes are optional but recommended when evaluating detection quality.

Bounding boxes use pixel coordinates relative to the original image:

- `x`: left edge of the box,
- `y`: top edge of the box,
- `width`: box width,
- `height`: box height.

Example:

```json
[
  {
    "image": "race_001.jpg",
    "bibs": [
      {
        "bib_number": "1284",
        "bbox": { "x": 412, "y": 288, "width": 96, "height": 44 }
      }
    ]
  }
]
```

## Known limitations

Detection and OCR quality can be reduced by:

- **Motion blur**: Fast runners or camera movement can smear digits.
- **Small bibs**: Distant runners may have too few pixels for reliable OCR.
- **Occluded bibs**: Arms, clothing, other runners, or race gear may hide digits.
- **Glare or overexposure**: Bright sunlight or reflective bib material can wash out numbers.
- **Multiple runners with overlapping bodies**: Nearby athletes can make it difficult to associate a detected bib with the correct person.

For best results, use images where bibs are front-facing, well lit, and large enough for the digits to be legible.
## Bib detection stage

The OCR pipeline now has a pre-OCR detection module at `api/detection/bib_detector.py`.
It implements an OpenCV-based MVP for race-bib candidate extraction:

1. Finds rectangular candidate regions with adaptive thresholding, edges, morphology, and contour filtering.
2. Returns bounding boxes in original image coordinates for frontend overlays.
3. Crops each candidate and normalizes it with optional perspective correction, histogram equalization, sharpening, and resizing before OCR.

Install runtime image-processing dependencies in the API environment before enabling the stage:

```bash
pip install opencv-python numpy
```

Typical API usage:

```python
from api.detection import detect_bib_regions, detections_for_response

candidates = detect_bib_regions("runner.jpg")
overlay_payload = detections_for_response(candidates)
ocr_inputs = [candidate.crop for candidate in candidates]
```
# Race Bib Number Detector

An initial full-stack project for uploading race photos and detecting runner bib numbers. The app includes a React frontend, an Express API, and a modular detection pipeline that can be swapped for production OCR, object detection, and AI post-processing providers.

## Features

- Upload a race image from the browser.
- Preview the uploaded image before processing.
- Call `POST /api/detect` with a multipart image upload.
- Display detected bib numbers with bounding boxes, OCR confidence, and AI confidence.
- Keep detection responsibilities isolated in separate modules:
  - `server/detection/services/bibDetector.js` locates bib candidate regions.
  - `server/detection/services/ocr.js` extracts text from candidate regions.
  - `server/detection/services/aiPostProcessor.js` ranks and normalizes final detections.

## Project structure

```text
.
├── src/                         # React frontend
│   ├── components/              # Upload, preview, and results UI
│   └── lib/api.js               # Browser API client
├── server/                      # Express backend
│   ├── index.js                 # API entry point
│   └── detection/               # Swappable detection pipeline
├── package.json                 # Scripts and dependencies
└── README.md
```

## Getting started

Install dependencies:

```bash
npm install
```

Run the frontend and backend together:

```bash
npm run dev
```

Then open the Vite URL printed in your terminal. The frontend uses a relative `/api/detect` request; during local development you can set `VITE_API_BASE_URL=http://localhost:3001` if you run the API separately.

Run only the API:

```bash
npm run dev:api
```

Run only the frontend:

```bash
npm run dev:web
```

Build the frontend:

```bash
npm run build
```

## API

### `POST /api/detect`

Accepts a multipart form upload with an `image` field.

Example response:

```json
{
  "detections": [
    {
      "id": "race.jpg-candidate-1",
      "bibNumber": "1234",
      "boundingBox": {
        "x": 37,
        "y": 42,
        "width": 26,
        "height": 14
      },
      "ocrConfidence": 0.86,
      "aiConfidence": 0.94
    }
  ]
}
```

Bounding-box values are percentages relative to the displayed image area.

## Swapping detection providers

The current backend returns deterministic placeholder detections so the full-stack flow can be exercised immediately. To add real detection:

1. Replace `runBibDetector` with an object detector or image segmentation model.
2. Replace `runOcr` with an OCR engine such as Tesseract, an OCR API, or a custom model.
3. Replace `rankDetections` with domain-specific validation or an AI model that resolves ambiguous OCR output.

Keep each integration behind the same function signatures to avoid changing API routes or frontend code.

## FastAPI + YOLO backend

The Python backend exposes the same `POST /api/detect` contract as the original Express prototype, but is designed for model-backed race-bib detection:

```bash
pip install -r requirements.txt
uvicorn api.main:app --host 0.0.0.0 --port 3001 --reload
```

Set `YOLO_BIB_MODEL_PATH=/path/to/bib-detector.pt` to use a fine-tuned YOLO model for bib localization. If no model path is configured, the API falls back to the OpenCV candidate detector in `api/detection/bib_detector.py`.

Detection output is four-digit focused. The API only accepts OCR candidates with exactly four digits. When one or more digits are below the clarity threshold, the response returns `bibNumber: null`, a masked `displayNumber` such as `12?4`, and `digitScores` so the UI can show confidence for each digit instead of pretending the full number is clear.

## Deploying the FastAPI backend

This repository includes a backend-only Docker deployment target. The image installs the Python API dependencies plus the system Tesseract binary required by `pytesseract`.

Build and run locally:

```bash
docker build -f Dockerfile.api -t number-detector-api .
docker run --rm -p 3001:3001 --env-file .env.example number-detector-api
curl http://localhost:3001/api/health
```

Or use Compose:

```bash
docker compose -f docker-compose.api.yml up --build
```

Cloud platforms should run the API with:

```bash
python -m api.start
```

The entrypoint reads these environment variables:

- `PORT`: port provided by the host, default `3001`.
- `HOST`: bind host, default `0.0.0.0`.
- `YOLO_BIB_MODEL_PATH`: optional path to a trained YOLO `.pt` model. If omitted, OpenCV fallback detection is used.
- `YOLO_BIB_CONFIDENCE`: optional YOLO confidence threshold, default `0.35`.

For Render, `render.yaml` defines a Docker web service using `Dockerfile.api` and `/api/health` as the health check. After deployment, set the frontend environment variable `VITE_API_BASE_URL` to the deployed backend URL so browser uploads call the FastAPI service.


### Deployment checklist

1. Train or upload YOLO weights if you want model-backed detection; otherwise leave `YOLO_BIB_MODEL_PATH` unset for the OpenCV fallback.
2. Copy `.env.example` to your platform environment variables and set `PORT`, `YOLO_BIB_CONFIDENCE`, and optionally `YOLO_BIB_MODEL_PATH`.
3. Deploy `Dockerfile.api` as the backend web service.
4. Confirm the service health check returns `{"status":"ok"}` at `/api/health`.
5. Set the frontend `VITE_API_BASE_URL` to the deployed backend origin, for example `https://number-detector-api.example.com`.
6. Upload a test image through the frontend or call `POST /api/detect` with a multipart field named `image`.

GitHub Actions now includes a backend workflow that runs Python tests and builds the backend Docker image on pull requests.
