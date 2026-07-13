"""FastAPI detection pipeline for four-digit race bibs."""

from __future__ import annotations

from typing import Any

from api.detection.yolo_detector import detect_bibs_with_yolo_or_fallback
from api.ocr.four_digit import normalize_four_digit_bib
from api.ocr.recognize_bib import _results_from_tesseract_data, preprocess_bib_image


def detect_four_digit_bibs(
    image: Any,
    *,
    max_candidates: int = 8,
    digit_threshold: float = 0.65,
) -> list[dict[str, Any]]:
    """Detect bib regions and return four-digit OCR results with digit scores."""

    detections = detect_bibs_with_yolo_or_fallback(image, max_candidates=max_candidates)
    results: list[dict[str, Any]] = []
    for index, detection in enumerate(detections, start=1):
        ocr_candidates = _ocr_four_digit_candidates(detection.crop, digit_threshold=digit_threshold)
        best = max(ocr_candidates, key=lambda candidate: candidate.confidence, default=None)
        if best is None:
            results.append(
                {
                    "id": f"bib-candidate-{index}",
                    "bibNumber": None,
                    "displayNumber": "????",
                    "confidence": 0.0,
                    "detectorConfidence": round(detection.confidence, 4),
                    "boundingBox": detection.bbox.as_dict(),
                    "digitScores": [],
                    "status": "flagged",
                    "reason": "No clear four-digit OCR candidate was found.",
                }
            )
            continue

        payload = best.to_dict()
        payload.update(
            {
                "id": f"bib-candidate-{index}",
                "detectorConfidence": round(detection.confidence, 4),
                "ocrConfidence": best.confidence,
                "boundingBox": detection.bbox.as_dict(),
                "status": "accepted" if best.bib_number is not None else "flagged",
                "reason": None if best.bib_number is not None else "One or more digits are below the clarity threshold.",
            }
        )
        results.append(payload)

    return results


def _ocr_four_digit_candidates(crop: Any, *, digit_threshold: float) -> list[Any]:
    if crop is None:
        return []
    try:
        import pytesseract  # type: ignore[import-not-found]
    except ImportError as exc:  # pragma: no cover - depends on deployment image
        raise RuntimeError("OCR requires the pytesseract package") from exc

    prepared = preprocess_bib_image(crop)
    data = pytesseract.image_to_data(
        prepared,
        config="--psm 7 -c tessedit_char_whitelist=0123456789",
        output_type=pytesseract.Output.DICT,
    )
    candidates = []
    for result in _results_from_tesseract_data(data):
        candidate = normalize_four_digit_bib(
            result.text,
            confidence=result.confidence,
            digit_threshold=digit_threshold,
        )
        if candidate is not None:
            candidates.append(candidate)
    return candidates
