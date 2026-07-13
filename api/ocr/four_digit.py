"""Four-digit bib normalization and per-digit confidence helpers."""

from __future__ import annotations

from dataclasses import dataclass, asdict
import re
from typing import Any, Sequence

_DIGIT_RE = re.compile(r"\d")
DEFAULT_DIGIT_THRESHOLD = 0.65
REQUIRED_BIB_DIGITS = 4


@dataclass(frozen=True)
class DigitScore:
    """Confidence for a single bib-number position."""

    position: int
    value: str | None
    score: float
    clear: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class FourDigitBibCandidate:
    """Normalized four-digit bib output with per-digit clarity."""

    bib_number: str | None
    display_number: str
    confidence: float
    digit_scores: tuple[DigitScore, ...]
    raw_text: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "bibNumber": self.bib_number,
            "displayNumber": self.display_number,
            "confidence": self.confidence,
            "digitScores": [score.to_dict() for score in self.digit_scores],
            "rawText": self.raw_text,
        }


def normalize_four_digit_bib(
    text: str,
    *,
    confidence: float,
    digit_confidences: Sequence[float] | None = None,
    digit_threshold: float = DEFAULT_DIGIT_THRESHOLD,
) -> FourDigitBibCandidate | None:
    """Return a four-digit bib candidate, exposing unclear digits as ``?``.

    The project intentionally accepts only four-digit race numbers. Text with
    fewer or more than four digits is rejected so unrelated numbers are not
    silently merged into a bib result.
    """

    digits = _DIGIT_RE.findall(text)
    if len(digits) != REQUIRED_BIB_DIGITS:
        return None

    confidences = _normalize_digit_confidences(digit_confidences, fallback=confidence)
    scores = tuple(
        DigitScore(
            position=index + 1,
            value=digit,
            score=round(score, 4),
            clear=score >= digit_threshold,
        )
        for index, (digit, score) in enumerate(zip(digits, confidences, strict=True))
    )
    display_number = "".join(score.value if score.clear else "?" for score in scores)
    bib_number = "".join(score.value or "" for score in scores) if all(score.clear for score in scores) else None

    return FourDigitBibCandidate(
        bib_number=bib_number,
        display_number=display_number,
        confidence=round(min(confidences), 4),
        digit_scores=scores,
        raw_text=text,
    )


def _normalize_digit_confidences(
    digit_confidences: Sequence[float] | None,
    *,
    fallback: float,
) -> tuple[float, float, float, float]:
    if digit_confidences is None or len(digit_confidences) != REQUIRED_BIB_DIGITS:
        return (float(fallback),) * REQUIRED_BIB_DIGITS
    return tuple(max(0.0, min(float(value), 1.0)) for value in digit_confidences)  # type: ignore[return-value]


__all__ = [
    "DEFAULT_DIGIT_THRESHOLD",
    "REQUIRED_BIB_DIGITS",
    "DigitScore",
    "FourDigitBibCandidate",
    "normalize_four_digit_bib",
]
