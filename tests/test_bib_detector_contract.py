from api.detection.bib_detector import BoundingBox, BibDetection, detections_for_response


def test_detection_response_contains_overlay_bbox_without_crop():
    detection = BibDetection(BoundingBox(x=10, y=20, width=300, height=120), 0.87654, crop="ocr-ready")

    assert detections_for_response([detection]) == [
        {
            "bbox": {"x": 10, "y": 20, "width": 300, "height": 120},
            "confidence": 0.8765,
        }
    ]


def test_detection_response_can_include_debug_scores():
    detection = BibDetection(
        BoundingBox(x=10, y=20, width=300, height=120),
        0.87654,
        crop="ocr-ready",
        debug_scores={"aspect": 0.9, "darkOnLightContrast": 0.81234},
    )

    assert detections_for_response([detection], include_debug=True) == [
        {
            "bbox": {"x": 10, "y": 20, "width": 300, "height": 120},
            "confidence": 0.8765,
            "debugScores": {"aspect": 0.9, "darkOnLightContrast": 0.8123},
        }
    ]
