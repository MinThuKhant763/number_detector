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
