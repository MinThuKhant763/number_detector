"""Race-bib detection and preprocessing helpers.

This module provides an MVP detection stage that can be inserted before OCR.
It uses OpenCV contour/rectangle heuristics to find likely bib regions, crops
and normalizes each candidate, and returns image-coordinate bounding boxes for
frontend overlays.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import cache
from dataclasses import dataclass, field
import importlib.util
from pathlib import Path
from typing import Any, Iterable

from api.ocr.recognize_bib import recognize_bib


@dataclass(frozen=True)
class BoundingBox:
    """A rectangular image-coordinate bounding box."""

    x: int
    y: int
    width: int
    height: int

    def as_dict(self) -> dict[str, int]:
        return {
            "x": self.x,
            "y": self.y,
            "width": self.width,
            "height": self.height,
        }


@dataclass(frozen=True)
class BibDetection:
    """A candidate bib region produced by the detector."""

    bbox: BoundingBox
    confidence: float
    crop: Any | None = None
    debug_scores: dict[str, float] = field(default_factory=dict)

    @classmethod
    def from_bbox_values(
        cls,
        x: int,
        y: int,
        width: int,
        height: int,
        confidence: float,
        crop: Any | None = None,
    ) -> "BibDetection":
        return cls(BoundingBox(x, y, width, height), confidence, crop)

    def as_dict(self, *, include_crop: bool = False) -> dict[str, Any]:
    def as_dict(self, *, include_crop: bool = False, include_debug: bool = False) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "bbox": self.bbox.as_dict(),
            "confidence": round(self.confidence, 4),
        }
        if include_crop:
            payload["crop"] = self.crop
        if include_debug:
            payload["debugScores"] = {
                name: round(value, 4) for name, value in self.debug_scores.items()
            }
        return payload


def detect_bib_regions(
    image_path: str | Path,
    *,
    min_area_ratio: float = 0.002,
    max_area_ratio: float = 0.35,
    max_candidates: int = 8,
    debug: bool = False,
    enable_preliminary_ocr: bool = False,
) -> list[BibDetection]:
    """Detect candidate bib regions and return normalized crops.

    Args:
        image_path: Path to an image on disk.
        min_area_ratio: Reject contours smaller than this fraction of the image.
        max_area_ratio: Reject contours larger than this fraction of the image.
        max_candidates: Maximum number of candidates to return.

    Returns:
        A list of detections sorted by descending confidence. Each detection
        includes an image-coordinate bounding box and a preprocessed crop ready
        for OCR.
    """

    cv2 = _require_cv2()
    image = cv2.imread(str(image_path))
    if image is None:
        raise ValueError(f"Could not read image: {image_path}")

    return detect_bib_regions_from_image(
        image,
        min_area_ratio=min_area_ratio,
        max_area_ratio=max_area_ratio,
        max_candidates=max_candidates,
        debug=debug,
        enable_preliminary_ocr=enable_preliminary_ocr,
    )


def detect_bib_regions_from_image(
    image: Any,
    *,
    min_area_ratio: float = 0.002,
    max_area_ratio: float = 0.35,
    max_candidates: int = 8,
    debug: bool = False,
    enable_preliminary_ocr: bool = False,
) -> list[BibDetection]:
    """Detect bib candidates in an OpenCV BGR image array."""

    cv2 = _require_cv2()
    height, width = image.shape[:2]
    image_area = float(width * height)

    mask = _build_bib_candidate_mask(image)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    # Crop normalization is the most expensive per-contour operation. Score and
    # de-duplicate candidates first so only the best final regions are warped,
    # sharpened, and resized for OCR.
    candidate_regions: list[tuple[Any, tuple[int, int, int, int], float]] = []
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        area = float(w * h)
        if not (image_area * min_area_ratio <= area <= image_area * max_area_ratio):
            continue

        aspect_ratio = w / max(h, 1)
        if not 1.15 <= aspect_ratio <= 4.8:
            continue

        extent = cv2.contourArea(contour) / max(area, 1.0)
        if extent < 0.35:
            continue

        confidence = _score_candidate(aspect_ratio=aspect_ratio, extent=extent, area_ratio=area / image_area)
        candidate_regions.append((contour, (x, y, w, h), confidence))

    candidate_regions.sort(key=lambda item: item[2], reverse=True)
    deduped_regions = _dedupe_overlapping_regions(candidate_regions)[:max_candidates]

    detections: list[BibDetection] = []
    for contour, rect, confidence in deduped_regions:
        x, y, w, h = rect
        crop = _crop_and_normalize(image, contour, rect)
        detections.append(BibDetection(BoundingBox(x, y, w, h), confidence, crop))

    return detections

    candidate_regions.sort(key=lambda item: item[2], reverse=True)
    deduped_regions = _dedupe_overlapping_regions(candidate_regions)[:max_candidates]

    detections: list[BibDetection] = []
    for contour, rect, confidence in deduped_regions:
        x, y, w, h = rect
        crop = _crop_and_normalize(image, contour, rect)
        detections.append(BibDetection(BoundingBox(x, y, w, h), confidence, crop))
        crop = _crop_and_normalize(image, contour, (x, y, w, h))
        ocr_confidence = _preliminary_ocr_confidence(crop) if enable_preliminary_ocr else None
        confidence, debug_scores = _score_candidate(
            aspect_ratio=aspect_ratio,
            extent=extent,
            area_ratio=area / image_area,
            crop=crop,
            ocr_confidence=ocr_confidence,
        )
        detections.append(
            BibDetection(
                BoundingBox(x, y, w, h),
                confidence,
                crop,
                debug_scores if debug else {},
            )
        )

    return detections


def detections_for_response(
    detections: Iterable[BibDetection], *, include_debug: bool = False
) -> list[dict[str, Any]]:
    """Serialize detections for an API response consumed by the frontend."""

    return [
        detection.as_dict(include_crop=False, include_debug=include_debug)
        for detection in detections
    ]


def _build_bib_candidate_mask(image: Any) -> Any:
    cv2 = _require_cv2()
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    # Bibs are often light rectangles with dark printed numbers. Adaptive
    # thresholding keeps the detector useful across outdoor lighting changes.
    threshold = cv2.adaptiveThreshold(
        blurred,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        5,
    )
    edges = cv2.Canny(blurred, 50, 150)
    mask = cv2.bitwise_or(threshold, edges)

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 5))
    return cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)


def _crop_and_normalize(image: Any, contour: Any, rect: tuple[int, int, int, int]) -> Any:
    cv2 = _require_cv2()
    x, y, w, h = rect

    # Perspective-correct when a stable four-corner approximation is available;
    # otherwise use the axis-aligned crop so OCR can still proceed.
    perimeter = cv2.arcLength(contour, True)
    approx = cv2.approxPolyDP(contour, 0.03 * perimeter, True)
    if len(approx) == 4:
        crop = _four_point_warp(image, approx.reshape(4, 2))
    else:
        crop = image[y : y + h, x : x + w]

    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if len(crop.shape) == 3 else crop
    enhanced = cv2.equalizeHist(gray)
    sharpened = cv2.filter2D(enhanced, -1, _sharpen_kernel())

    target_width = max(320, int(sharpened.shape[1] * 1.5))
    scale = target_width / max(sharpened.shape[1], 1)
    target_height = max(80, int(sharpened.shape[0] * scale))
    return cv2.resize(sharpened, (target_width, target_height), interpolation=cv2.INTER_CUBIC)


def _four_point_warp(image: Any, points: Any) -> Any:
    cv2 = _require_cv2()
    np = _require_numpy()
    rect = _order_points(points)
    top_left, top_right, bottom_right, bottom_left = rect

    width_a = np.linalg.norm(bottom_right - bottom_left)
    width_b = np.linalg.norm(top_right - top_left)
    height_a = np.linalg.norm(top_right - bottom_right)
    height_b = np.linalg.norm(top_left - bottom_left)
    max_width = max(1, int(max(width_a, width_b)))
    max_height = max(1, int(max(height_a, height_b)))

    destination = np.array(
        [[0, 0], [max_width - 1, 0], [max_width - 1, max_height - 1], [0, max_height - 1]],
        dtype="float32",
    )
    matrix = cv2.getPerspectiveTransform(rect, destination)
    return cv2.warpPerspective(image, matrix, (max_width, max_height))


def _order_points(points: Any) -> Any:
    np = _require_numpy()
    rect = np.zeros((4, 2), dtype="float32")
    sums = points.sum(axis=1)
    rect[0] = points[np.argmin(sums)]
    rect[2] = points[np.argmax(sums)]
    diffs = np.diff(points, axis=1)
    rect[1] = points[np.argmin(diffs)]
    rect[3] = points[np.argmax(diffs)]
    return rect


@cache
def _sharpen_kernel() -> Any:
    np = _require_numpy()
    return np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])


def _score_candidate(
    *,
    aspect_ratio: float,
    extent: float,
    area_ratio: float,
    crop: Any | None = None,
    ocr_confidence: float | None = None,
) -> tuple[float, dict[str, float]]:
    aspect_score = max(0.0, 1.0 - abs(aspect_ratio - 2.2) / 2.6)
    area_score = max(0.0, 1.0 - abs(area_ratio - 0.06) / 0.18)
    extent_score = min(max(extent, 0.0), 1.0)

    visual_scores = _score_crop_visual_signals(crop) if crop is not None else {}
    ocr_score = min(max(ocr_confidence or 0.0, 0.0), 1.0)

    scores = {
        "aspect": aspect_score,
        "extent": extent_score,
        "area": area_score,
        "darkOnLightContrast": visual_scores.get("darkOnLightContrast", 0.0),
        "componentDensity": visual_scores.get("componentDensity", 0.0),
        "horizontalDigitBandOccupancy": visual_scores.get("horizontalDigitBandOccupancy", 0.0),
        "centralEdgeDensity": visual_scores.get("centralEdgeDensity", 0.0),
        "preliminaryOcrConfidence": ocr_score,
    }

    confidence = (
        (scores["aspect"] * 0.22)
        + (scores["extent"] * 0.16)
        + (scores["area"] * 0.10)
        + (scores["darkOnLightContrast"] * 0.16)
        + (scores["componentDensity"] * 0.13)
        + (scores["horizontalDigitBandOccupancy"] * 0.11)
        + (scores["centralEdgeDensity"] * 0.08)
        + (scores["preliminaryOcrConfidence"] * 0.04)
    )
    scores["combined"] = min(1.0, confidence)
    return scores["combined"], scores


def _score_crop_visual_signals(crop: Any) -> dict[str, float]:
    """Score visual characteristics that distinguish race bibs from other rectangles."""

    cv2 = _require_cv2()
    np = _require_numpy()
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if len(crop.shape) == 3 else crop
    if gray.size == 0:
        return {}

    height, width = gray.shape[:2]
    threshold = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
    dark = threshold == 0
    dark_ratio = float(np.count_nonzero(dark)) / float(gray.size)
    light_pixels = gray[~dark]
    dark_pixels = gray[dark]
    contrast = (
        (float(light_pixels.mean()) - float(dark_pixels.mean())) / 255.0
        if light_pixels.size and dark_pixels.size
        else 0.0
    )
    background_lightness = float(light_pixels.mean()) / 255.0 if light_pixels.size else 0.0
    dark_fraction_score = _triangular_score(dark_ratio, target=0.22, tolerance=0.22)
    contrast_score = min(1.0, max(0.0, contrast / 0.55))
    lightness_score = min(1.0, max(0.0, (background_lightness - 0.45) / 0.45))
    dark_on_light_score = (contrast_score * 0.55) + (lightness_score * 0.25) + (dark_fraction_score * 0.20)

    num_labels, _labels, stats, _ = cv2.connectedComponentsWithStats(dark.astype("uint8"), 8)
    digit_like = 0
    min_component_area = max(8, int(gray.size * 0.0008))
    max_component_area = max(min_component_area + 1, int(gray.size * 0.18))
    for label in range(1, num_labels):
        _x, _y, w, h, area = (int(value) for value in stats[label])
        if not min_component_area <= area <= max_component_area:
            continue
        component_aspect = w / max(h, 1)
        if 0.15 <= component_aspect <= 1.25 and h >= height * 0.18:
            digit_like += 1
    component_density_score = _triangular_score(digit_like, target=4, tolerance=4)

    y0, y1 = int(height * 0.20), max(int(height * 0.80), int(height * 0.20) + 1)
    central_band = dark[y0:y1, :]
    band_dark_ratio = float(np.count_nonzero(central_band)) / max(float(central_band.size), 1.0)
    occupied_columns = np.count_nonzero(central_band.sum(axis=0) > max(1, central_band.shape[0] * 0.05))
    column_occupancy = float(occupied_columns) / max(width, 1)
    band_score = (
        _triangular_score(band_dark_ratio, target=0.22, tolerance=0.20) * 0.55
        + _triangular_score(column_occupancy, target=0.55, tolerance=0.45) * 0.45
    )

    central_x0, central_x1 = int(width * 0.10), max(int(width * 0.90), int(width * 0.10) + 1)
    central_crop = gray[y0:y1, central_x0:central_x1]
    edges = cv2.Canny(central_crop, 50, 150)
    edge_density = float(np.count_nonzero(edges)) / max(float(edges.size), 1.0)
    edge_density_score = _triangular_score(edge_density, target=0.08, tolerance=0.08)

    return {
        "darkOnLightContrast": min(1.0, dark_on_light_score),
        "componentDensity": min(1.0, component_density_score),
        "horizontalDigitBandOccupancy": min(1.0, band_score),
        "centralEdgeDensity": min(1.0, edge_density_score),
    }


def _triangular_score(value: float, *, target: float, tolerance: float) -> float:
    return max(0.0, 1.0 - abs(value - target) / max(tolerance, 0.000001))


def _preliminary_ocr_confidence(crop: Any) -> float:
    if importlib.util.find_spec("pytesseract") is None:
        return 0.0
    try:
        result = recognize_bib(crop)
    except Exception:
        return 0.0
    return result.confidence if result is not None else 0.0


def _dedupe_overlapping(detections: list[BibDetection], *, iou_threshold: float = 0.45) -> list[BibDetection]:
    kept: list[BibDetection] = []
    for detection in detections:
        if all(_iou(detection.bbox, existing.bbox) < iou_threshold for existing in kept):
            kept.append(detection)
    return kept


def _dedupe_overlapping_regions(
    regions: list[tuple[Any, tuple[int, int, int, int], float]],
    *,
    iou_threshold: float = 0.45,
) -> list[tuple[Any, tuple[int, int, int, int], float]]:
    kept: list[tuple[Any, tuple[int, int, int, int], float]] = []
    kept_boxes: list[BoundingBox] = []
    for region in regions:
        _, rect, _ = region
        candidate_box = BoundingBox(*rect)
        if all(_iou(candidate_box, existing_box) < iou_threshold for existing_box in kept_boxes):
            kept.append(region)
            kept_boxes.append(candidate_box)
    return kept


def _iou(a: BoundingBox, b: BoundingBox) -> float:
    x_left = max(a.x, b.x)
    y_top = max(a.y, b.y)
    x_right = min(a.x + a.width, b.x + b.width)
    y_bottom = min(a.y + a.height, b.y + b.height)
    if x_right <= x_left or y_bottom <= y_top:
        return 0.0
    intersection = float((x_right - x_left) * (y_bottom - y_top))
    union = float(a.width * a.height + b.width * b.height) - intersection
    return intersection / union if union else 0.0


@cache
def _require_cv2() -> Any:
    try:
        import cv2  # type: ignore[import-not-found]
    except ImportError as exc:  # pragma: no cover - depends on deployment image
        raise RuntimeError("bib detection requires the opencv-python package") from exc
    return cv2


@cache
def _require_numpy() -> Any:
    try:
        import numpy as np  # type: ignore[import-not-found]
    except ImportError as exc:  # pragma: no cover - depends on deployment image
        raise RuntimeError("bib detection requires the numpy package") from exc
    return np
