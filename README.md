# Number Detector

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
