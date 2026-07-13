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
