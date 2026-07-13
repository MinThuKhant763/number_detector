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
