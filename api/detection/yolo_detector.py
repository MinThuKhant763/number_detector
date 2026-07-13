"""YOLO-backed bib detector with an OpenCV fallback."""

from __future__ import annotations

from functools import cache
from os import getenv
from typing import Any

from api.detection.bib_detector import BibDetection, detect_bib_regions_from_image

DEFAULT_MODEL_ENV = "YOLO_BIB_MODEL_PATH"
DEFAULT_CONFIDENCE_ENV = "YOLO_BIB_CONFIDENCE"


def detect_bibs_with_yolo_or_fallback(
    image: Any,
    *,
    model_path: str | None = None,
    confidence_threshold: float | None = None,
    max_candidates: int = 8,
) -> list[BibDetection]:
    """Detect bibs with YOLO when configured; otherwise use OpenCV heuristics."""

    resolved_model_path = model_path or getenv(DEFAULT_MODEL_ENV)
    if not resolved_model_path:
        return detect_bib_regions_from_image(image, max_candidates=max_candidates)

    threshold = confidence_threshold if confidence_threshold is not None else float(getenv(DEFAULT_CONFIDENCE_ENV, "0.35"))
    model = _load_yolo_model(resolved_model_path)
    results = model.predict(image, conf=threshold, verbose=False)
    detections: list[BibDetection] = []

    for result in results:
        boxes = getattr(result, "boxes", None)
        if boxes is None:
            continue
        for box in boxes:
            confidence = float(box.conf[0]) if getattr(box, "conf", None) is not None else threshold
            if confidence < threshold:
                continue
            x1, y1, x2, y2 = (int(value) for value in box.xyxy[0].tolist())
            width = max(0, x2 - x1)
            height = max(0, y2 - y1)
            if width == 0 or height == 0:
                continue
            crop = image[y1:y2, x1:x2]
            detections.append(BibDetection.from_bbox_values(x1, y1, width, height, confidence, crop))

    detections.sort(key=lambda detection: detection.confidence, reverse=True)
    return detections[:max_candidates]


@cache
def _load_yolo_model(model_path: str) -> Any:
    try:
        from ultralytics import YOLO  # type: ignore[import-not-found]
    except ImportError as exc:  # pragma: no cover - depends on deployment image
        raise RuntimeError("YOLO detection requires the ultralytics package") from exc
    return YOLO(model_path)
