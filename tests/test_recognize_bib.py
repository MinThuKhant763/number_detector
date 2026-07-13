from api.ocr.recognize_bib import (
    BibOcrResult,
    _results_from_tesseract_data,
    is_valid_bib_number,
    normalize_bib_number,
)


def test_normalize_bib_number_extracts_digits():
    assert normalize_bib_number("Bib 12 345") == 12345


def test_normalize_bib_number_returns_none_for_non_numeric_text():
    assert normalize_bib_number("runner") is None


def test_is_valid_bib_number_applies_expected_race_range():
    assert is_valid_bib_number(42, min_number=1, max_number=100)
    assert not is_valid_bib_number(101, min_number=1, max_number=100)
    assert not is_valid_bib_number(None, min_number=1, max_number=100)


def test_results_from_tesseract_data_returns_structured_numeric_candidates():
    data = {
        "text": ["", "A12", "987"],
        "conf": ["-1", "83", "99"],
        "left": [0, 10, 20],
        "top": [0, 11, 21],
        "width": [0, 12, 22],
        "height": [0, 13, 23],
    }

    assert _results_from_tesseract_data(data) == [
        BibOcrResult("A12", 12, 0.83, (10, 11, 12, 13)),
        BibOcrResult("987", 987, 0.99, (20, 21, 22, 23)),
    ]


def test_recognize_bib_selects_highest_confidence_valid_variant(monkeypatch):
    import importlib

    recognize_module = importlib.import_module("api.ocr.recognize_bib")

    variants = [object(), object(), object()]
    responses = {
        id(variants[0]): {
            "text": ["777"],
            "conf": ["95"],
            "left": [1],
            "top": [2],
            "width": [3],
            "height": [4],
        },
        id(variants[1]): {
            "text": ["100000"],
            "conf": ["99"],
            "left": [5],
            "top": [6],
            "width": [7],
            "height": [8],
        },
        id(variants[2]): {
            "text": ["1234"],
            "conf": ["82"],
            "left": [9],
            "top": [10],
            "width": [11],
            "height": [12],
        },
    }

    class FakeOutput:
        DICT = "dict"

    class FakePytesseract:
        Output = FakeOutput

        @staticmethod
        def image_to_data(image, *, config, output_type):
            assert config == "--psm 7 -c tessedit_char_whitelist=0123456789"
            assert output_type == FakeOutput.DICT
            return responses[id(image)]

    monkeypatch.setattr(recognize_module, "_preprocess_variants", lambda image: variants)
    monkeypatch.setattr(
        recognize_module.importlib,
        "import_module",
        lambda name: FakePytesseract if name == "pytesseract" else None,
    )

    assert recognize_module.recognize_bib("image", max_number=99999) == BibOcrResult(
        "777", 777, 0.95, (1, 2, 3, 4)
    )
