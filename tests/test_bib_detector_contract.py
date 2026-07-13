from api.detection.bib_detector import BoundingBox, BibDetection, detections_for_response


def test_detection_response_contains_overlay_bbox_without_crop():
    detection = BibDetection(BoundingBox(x=10, y=20, width=300, height=120), 0.87654, crop="ocr-ready")

    assert detections_for_response([detection]) == [
        {
            "bbox": {"x": 10, "y": 20, "width": 300, "height": 120},
            "confidence": 0.8765,
        }
    ]
