"""Detection stage exports."""

from .bib_detector import BoundingBox, BibDetection, detect_bib_regions, detections_for_response

__all__ = ["BoundingBox", "BibDetection", "detect_bib_regions", "detections_for_response"]
