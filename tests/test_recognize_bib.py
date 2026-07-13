from api.ocr.recognize_bib import (
    BibOcrResult,
    _results_from_tesseract_data,
    is_valid_bib_number,
    normalize_bib_number,
)


def _data(words):
    return {
        "text": [word[0] for word in words],
        "conf": [word[1] for word in words],
        "left": [word[2] for word in words],
        "top": [word[3] for word in words],
        "width": [word[4] for word in words],
        "height": [word[5] for word in words],
    }


def _numbers(results):
    return [result.normalizedNumber for result in results]


def test_normalize_bib_number_extracts_digits():
    assert normalize_bib_number("Bib 12 345") == 12345


def test_normalize_bib_number_returns_none_for_non_numeric_text():
    assert normalize_bib_number("runner") is None


def test_is_valid_bib_number_applies_expected_race_range():
    assert is_valid_bib_number(42, min_number=1, max_number=100)
    assert not is_valid_bib_number(101, min_number=1, max_number=100)
    assert not is_valid_bib_number(None, min_number=1, max_number=100)


def test_results_from_tesseract_data_returns_structured_numeric_candidates():
    data = _data(
        [
            ("", "-1", 0, 0, 0, 0),
            ("A12", "83", 10, 11, 12, 13),
            ("987", "99", 20, 21, 22, 23),
        ]
    )

    assert _results_from_tesseract_data(data) == [
        BibOcrResult("987", 987, 0.99, (20, 21, 22, 23)),
    ]


def test_results_merge_same_baseline_close_digit_groups_after_bib_label():
    data = _data(
        [
            ("Bib", "80", 0, 10, 26, 12),
            ("12", "90", 34, 10, 18, 12),
            ("345", "88", 58, 11, 28, 12),
        ]
    )

    results = _results_from_tesseract_data(data)

    assert results[0] == BibOcrResult("12 345", 12345, 0.89, (34, 10, 52, 13))
    assert 12345 in _numbers(results)


def test_results_ignore_mixed_alphanumeric_race_label_by_default():
    data = _data(
        [
            ("10K", "95", 0, 10, 26, 12),
            ("1234", "91", 34, 10, 42, 12),
        ]
    )

    results = _results_from_tesseract_data(data)

    assert results[0].normalizedNumber == 1234
    assert 101234 not in _numbers(results)


def test_results_can_explicitly_allow_mixed_alphanumeric_tokens():
    data = _data(
        [
            ("A12", "83", 10, 11, 12, 13),
        ]
    )

    assert _results_from_tesseract_data(data, allow_mixed_alphanumeric=True) == [
        BibOcrResult("A12", 12, 0.83, (10, 11, 12, 13)),
    ]


def test_results_reject_merged_candidate_outside_expected_bib_range():
    data = _data(
        [
            ("12", "90", 0, 10, 18, 12),
            ("34", "90", 24, 10, 18, 12),
            ("56", "90", 48, 10, 18, 12),
        ]
    )

    results = _results_from_tesseract_data(data, max_number=99999)

    assert 123456 not in _numbers(results)
    assert {12, 34, 56, 1234, 3456}.issubset(set(_numbers(results)))


def test_results_do_not_merge_separate_text_boxes():
    data = _data(
        [
            ("12", "90", 0, 10, 18, 12),
            ("345", "88", 240, 10, 28, 12),
        ]
    )

    results = _results_from_tesseract_data(data)

    assert 12345 not in _numbers(results)
    assert set(_numbers(results)) == {12, 345}
