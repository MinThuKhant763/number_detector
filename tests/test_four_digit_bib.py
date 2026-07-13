from api.ocr.four_digit import normalize_four_digit_bib


def test_accepts_clear_four_digit_bib():
    result = normalize_four_digit_bib("1284", confidence=0.91)

    assert result is not None
    assert result.bib_number == "1284"
    assert result.display_number == "1284"
    assert [score.clear for score in result.digit_scores] == [True, True, True, True]


def test_rejects_non_four_digit_text():
    assert normalize_four_digit_bib("12845", confidence=0.99) is None
    assert normalize_four_digit_bib("123", confidence=0.99) is None


def test_masks_unclear_digits_and_keeps_digit_scores():
    result = normalize_four_digit_bib(
        "1284",
        confidence=0.9,
        digit_confidences=[0.91, 0.88, 0.42, 0.77],
        digit_threshold=0.65,
    )

    assert result is not None
    assert result.bib_number is None
    assert result.display_number == "12?4"
    assert [score.score for score in result.digit_scores] == [0.91, 0.88, 0.42, 0.77]
