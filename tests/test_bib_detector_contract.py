from api.detection.bib_detector import (
    BoundingBox,
    BibDetection,
    _dedupe_overlapping_regions,
    detections_for_response,
)


def test_detection_response_contains_overlay_bbox_without_crop():
    detection = BibDetection(BoundingBox(x=10, y=20, width=300, height=120), 0.87654, crop="ocr-ready")

    assert detections_for_response([detection]) == [
        {
            "bbox": {"x": 10, "y": 20, "width": 300, "height": 120},
            "confidence": 0.8765,
        }
    ]


def test_region_dedupe_keeps_highest_ranked_regions_without_crops():
    regions = [
        ("best", (10, 20, 100, 40), 0.9),
        ("overlap", (12, 22, 100, 40), 0.8),
        ("separate", (300, 20, 100, 40), 0.7),
    ]

    assert _dedupe_overlapping_regions(regions) == [regions[0], regions[2]]
