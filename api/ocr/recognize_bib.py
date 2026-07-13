"""OCR helpers for recognizing race bib numbers from cropped bib images.

The module is intentionally dependency-light at import time. Runtime OCR and image
preprocessing backends are loaded with ``importlib`` so applications can choose an
MVP Tesseract stack (``opencv-python`` + ``pytesseract``) without making those
packages mandatory for code that only validates or normalizes OCR output.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from pathlib import Path
import importlib
import re
from typing import Any, Iterable, Mapping, Sequence

_DIGIT_RE = re.compile(r"\d+")
_CONFIDENCE_SCALE = 100.0
_MAX_BASELINE_DELTA_PX = 10
_MAX_GAP_HEIGHT_MULTIPLIER = 2.0
_MAX_GAP_WIDTH_MULTIPLIER = 1.25


@dataclass(frozen=True)
class _OcrToken:
    text: str
    digit_text: str
    confidence: float
    bbox: tuple[int, int, int, int]
    index: int

    @property
    def left(self) -> int:
        return self.bbox[0]

    @property
    def top(self) -> int:
        return self.bbox[1]

    @property
    def width(self) -> int:
        return self.bbox[2]

    @property
    def height(self) -> int:
        return self.bbox[3]

    @property
    def right(self) -> int:
        return self.left + self.width

    @property
    def center_y(self) -> float:
        return self.top + (self.height / 2)


@dataclass(frozen=True)
class BibOcrResult:
    """Structured OCR output for a detected bib crop."""

    text: str
    normalizedNumber: int | None
    confidence: float
    bbox: tuple[int, int, int, int] | None

    def to_dict(self) -> dict[str, Any]:
        """Return a JSON-serializable representation of the OCR result."""

        return asdict(self)


def normalize_bib_number(text: str) -> int | None:
    """Extract and normalize a bib number from OCR text.

    Non-digit separators are ignored so common OCR output such as ``"12 34"``
    can still normalize to ``1234``. Strings without any digits return ``None``.
    """

    digits = "".join(_DIGIT_RE.findall(text))
    return int(digits) if digits else None


def is_valid_bib_number(
    number: int | None,
    *,
    min_number: int = 1,
    max_number: int = 99999,
) -> bool:
    """Validate a normalized bib number against the expected race range."""

    return number is not None and min_number <= number <= max_number


def preprocess_bib_image(image: Any, *, scale: int = 2) -> Any:
    """Preprocess a cropped bib image for digits-first OCR.

    Processing steps:
    1. grayscale conversion
    2. denoising
    3. thresholding with Otsu's method
    4. upscaling to improve OCR on small bib crops

    ``image`` may be either an OpenCV image array or a path to an image file.
    """

    cv2 = importlib.import_module("cv2")
    source = _read_image(cv2, image)

    if len(source.shape) == 3:
        gray = cv2.cvtColor(source, cv2.COLOR_BGR2GRAY)
    else:
        gray = source

    denoised = cv2.fastNlMeansDenoising(gray, None, 30, 7, 21)
    thresholded = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[
        1
    ]

    if scale <= 1:
        return thresholded

    height, width = thresholded.shape[:2]
    return cv2.resize(
        thresholded,
        (width * scale, height * scale),
        interpolation=cv2.INTER_CUBIC,
    )
    gray = _to_grayscale(cv2, source)
    denoised = _denoise(cv2, gray)
    thresholded = _otsu_threshold(cv2, denoised)
    return _scale_image(cv2, thresholded, scale=scale)


def recognize_bib(
    image: Any,
    *,
    min_number: int = 1,
    max_number: int = 99999,
    bbox: Sequence[int] | None = None,
    tesseract_config: str | None = None,
) -> BibOcrResult | None:
    """Recognize a race bib number from a cropped bib image with Tesseract.

    The Tesseract invocation is configured for numeric recognition by default
    using a digit whitelist and a single-line page segmentation mode. Invalid OCR
    output, including non-numeric text or numbers outside the expected race
    range, returns ``None``.
    """

    pytesseract = importlib.import_module("pytesseract")
    config = tesseract_config or "--psm 7 -c tessedit_char_whitelist=0123456789"
    data = pytesseract.image_to_data(
        prepared_image,
        config=config,
        output_type=pytesseract.Output.DICT,
    )
    candidates = _results_from_tesseract_data(
        data, bbox=bbox, min_number=min_number, max_number=max_number
    )
    candidates: list[BibOcrResult] = []

    for prepared_image in _preprocess_variants(image):
        data = pytesseract.image_to_data(
            prepared_image,
            config=config,
            output_type=pytesseract.Output.DICT,
        )
        candidates.extend(_results_from_tesseract_data(data, bbox=bbox))

    valid = [
        result
        for result in candidates
        if is_valid_bib_number(
            result.normalizedNumber,
            min_number=min_number,
            max_number=max_number,
        )
    ]

    if not valid:
        return None

    return max(valid, key=_candidate_rank)


def _preprocess_variants(image: Any, *, scale: int = 2) -> Iterable[Any]:
    """Yield OCR-ready bib image variants from simple to more aggressive.

    The first yielded variant is always ``preprocess_bib_image`` so callers keep
    the existing default behavior while Tesseract can also evaluate alternate
    binarization, contrast, sharpening, and deskewed crops.
    """

    cv2 = importlib.import_module("cv2")
    source = _read_image(cv2, image)
    gray = _to_grayscale(cv2, source)
    denoised = _denoise(cv2, gray)

    yield _scale_image(cv2, _otsu_threshold(cv2, denoised), scale=scale)
    yield _scale_image(cv2, _otsu_threshold(cv2, denoised, inverted=True), scale=scale)
    yield _scale_image(cv2, _adaptive_threshold(cv2, denoised), scale=scale)

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    contrast_enhanced = clahe.apply(gray)
    yield _scale_image(
        cv2, _otsu_threshold(cv2, _denoise(cv2, contrast_enhanced)), scale=scale
    )

    sharpened = _light_sharpen(cv2, gray)
    yield _scale_image(cv2, _otsu_threshold(cv2, sharpened), scale=scale)

    deskewed = _deskew_crop_if_available(cv2, denoised)
    if deskewed is not None:
        yield _scale_image(cv2, _otsu_threshold(cv2, deskewed), scale=scale)


def _to_grayscale(cv2: Any, image: Any) -> Any:
    if len(image.shape) == 3:
        return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    return image


def _denoise(cv2: Any, gray: Any) -> Any:
    return cv2.fastNlMeansDenoising(gray, None, 30, 7, 21)


def _otsu_threshold(cv2: Any, gray: Any, *, inverted: bool = False) -> Any:
    mode = cv2.THRESH_BINARY_INV if inverted else cv2.THRESH_BINARY
    return cv2.threshold(gray, 0, 255, mode + cv2.THRESH_OTSU)[1]


def _adaptive_threshold(cv2: Any, gray: Any) -> Any:
    return cv2.adaptiveThreshold(
        gray,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        11,
    )


def _light_sharpen(cv2: Any, gray: Any) -> Any:
    blurred = cv2.GaussianBlur(gray, (0, 0), 1.0)
    return cv2.addWeighted(gray, 1.5, blurred, -0.5, 0)


def _deskew_crop_if_available(cv2: Any, gray: Any) -> Any | None:
    foreground = cv2.bitwise_not(_otsu_threshold(cv2, gray))
    points = cv2.findNonZero(foreground)
    if points is None:
        return None

    angle = cv2.minAreaRect(points)[-1]
    if angle < -45:
        angle = 90 + angle
    if abs(angle) < 1:
        return None

    height, width = gray.shape[:2]
    center = (width // 2, height // 2)
    rotation = cv2.getRotationMatrix2D(center, angle, 1.0)
    return cv2.warpAffine(
        gray,
        rotation,
        (width, height),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_REPLICATE,
    )


def _scale_image(cv2: Any, image: Any, *, scale: int = 2) -> Any:
    if scale <= 1:
        return image

    height, width = image.shape[:2]
    return cv2.resize(
        image,
        (width * scale, height * scale),
        interpolation=cv2.INTER_CUBIC,
    )


def _read_image(cv2: Any, image: Any) -> Any:
    if isinstance(image, (str, Path)):
        loaded = cv2.imread(str(image))
        if loaded is None:
            raise ValueError(f"Unable to read bib image: {image}")
        return loaded
    return image


def _results_from_tesseract_data(
    data: Mapping[str, Sequence[Any]],
    *,
    bbox: Sequence[int] | None = None,
    min_number: int = 1,
    max_number: int = 99999,
    allow_mixed_alphanumeric: bool = False,
) -> list[BibOcrResult]:
    """Build bib candidates from Tesseract word-level OCR data.

    Tesseract returns one row per detected word/box. Rather than blindly
    concatenating every digit group in the full OCR text, only merge numeric
    words that look like pieces of the same bib: they must share a horizontal
    baseline, be spatially close, fit the expected race range, and not come
    from mixed alpha-numeric labels such as ``10K`` unless explicitly allowed.
    """

    tokens = _numeric_tokens_from_tesseract_data(
        data, allow_mixed_alphanumeric=allow_mixed_alphanumeric
    )
    if not tokens:
        return []

    results: list[BibOcrResult] = []
    seen: set[tuple[int, ...]] = set()

    for line_tokens in _group_tokens_by_baseline(tokens):
        for start_index in range(len(line_tokens)):
            candidate_tokens: list[_OcrToken] = []
            for token in line_tokens[start_index:]:
                if candidate_tokens and not _tokens_are_close(
                    candidate_tokens[-1], token
                ):
                    break

                candidate_tokens.append(token)
                key = tuple(item.index for item in candidate_tokens)
                if key in seen:
                    continue
                seen.add(key)

                digit_text = "".join(item.digit_text for item in candidate_tokens)
                number = int(digit_text)
                if not is_valid_bib_number(
                    number, min_number=min_number, max_number=max_number
                ):
                    continue

                results.append(_result_from_tokens(candidate_tokens, number, bbox=bbox))

    return sorted(results, key=_candidate_rank, reverse=True)


def _numeric_tokens_from_tesseract_data(
    data: Mapping[str, Sequence[Any]],
    *,
    allow_mixed_alphanumeric: bool,
) -> list[_OcrToken]:
    texts = data.get("text", [])
    confidences = data.get("conf", [])
    lefts = data.get("left", [])
    tops = data.get("top", [])
    widths = data.get("width", [])
    heights = data.get("height", [])
    tokens: list[_OcrToken] = []

    for index, raw_text in enumerate(texts):
        text = str(raw_text).strip()
        if not text:
            continue

        digit_groups = _DIGIT_RE.findall(text)
        if not digit_groups:
            continue

        has_alpha = any(char.isalpha() for char in text)
        if has_alpha and not allow_mixed_alphanumeric:
            continue

        token_bbox = _normalize_bbox(
            (
                _safe_get(lefts, index, 0),
                _safe_get(tops, index, 0),
                _safe_get(widths, index, 0),
                _safe_get(heights, index, 0),
            )
        )
        if token_bbox is None:
            continue

        tokens.append(
            _OcrToken(
                text=text,
                digit_text="".join(digit_groups),
                confidence=_parse_confidence(_safe_get(confidences, index, 0)),
                bbox=token_bbox,
                index=index,
            )
        )

    return sorted(tokens, key=lambda item: (item.center_y, item.left))


def _group_tokens_by_baseline(tokens: Sequence[_OcrToken]) -> list[list[_OcrToken]]:
    lines: list[list[_OcrToken]] = []
    for token in tokens:
        for line in lines:
            average_center_y = sum(item.center_y for item in line) / len(line)
            average_height = sum(item.height for item in line) / len(line)
            if abs(token.center_y - average_center_y) <= max(
                _MAX_BASELINE_DELTA_PX, average_height * 0.5
            ):
                line.append(token)
                break
        else:
            lines.append([token])

    return [sorted(line, key=lambda item: item.left) for line in lines]


def _tokens_are_close(left: _OcrToken, right: _OcrToken) -> bool:
    gap = right.left - left.right
    if gap < 0:
        return True
    average_height = (left.height + right.height) / 2
    average_width = (left.width + right.width) / 2
    return gap <= max(
        _MAX_BASELINE_DELTA_PX,
        average_height * _MAX_GAP_HEIGHT_MULTIPLIER,
        average_width * _MAX_GAP_WIDTH_MULTIPLIER,
    )


def _result_from_tokens(
    tokens: Sequence[_OcrToken],
    number: int,
    *,
    bbox: Sequence[int] | None = None,
) -> BibOcrResult:
    left = min(token.left for token in tokens)
    top = min(token.top for token in tokens)
    right = max(token.right for token in tokens)
    bottom = max(token.top + token.height for token in tokens)
    confidence = sum(token.confidence for token in tokens) / len(tokens)
    return BibOcrResult(
        " ".join(token.text for token in tokens),
        number,
        confidence,
        (
            _normalize_bbox(bbox)
            if bbox is not None
            else (left, top, right - left, bottom - top)
        ),
    )


def _candidate_rank(result: BibOcrResult) -> tuple[int, float, int]:
    number = result.normalizedNumber or 0
    return (len(str(number)), result.confidence, number)


def _parse_confidence(value: Any) -> float:
    parsed = float(value)
    if parsed < 0:
        return 0.0
    return min(parsed / _CONFIDENCE_SCALE, 1.0)


def _normalize_bbox(bbox: Sequence[Any] | None) -> tuple[int, int, int, int] | None:
    if bbox is None:
        return None
    if len(bbox) != 4:
        raise ValueError("bbox must contain exactly four values: x, y, width, height")
    return tuple(int(value) for value in bbox)  # type: ignore[return-value]


def _safe_get(values: Sequence[Any], index: int, default: Any) -> Any:
    return values[index] if index < len(values) else default


__all__ = [
    "BibOcrResult",
    "is_valid_bib_number",
    "normalize_bib_number",
    "preprocess_bib_image",
    "recognize_bib",
]
