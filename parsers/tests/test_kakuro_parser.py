"""Tests for kakuro clue-cell decoding, focused on the recognizer response format."""
from __future__ import annotations

from puzzle_parsers.kakuro.parser import _parse_dual_int


def test_parses_compact_string_both_halves():
    assert _parse_dual_int("3/5") == (3, 5)


def test_parses_compact_string_single_half():
    assert _parse_dual_int("7/0") == (7, 0)
    assert _parse_dual_int("0/12") == (0, 12)


def test_parses_compact_string_empty():
    assert _parse_dual_int("0/0") == (0, 0)


def test_multi_digit_values_survive():
    assert _parse_dual_int("29/16") == (29, 16)


def test_whitespace_is_tolerated():
    assert _parse_dual_int(" 3 / 5 ") == (3, 5)


def test_malformed_string_degrades_to_zero():
    assert _parse_dual_int("") == (0, 0)
    assert _parse_dual_int("abc") == (0, 0)
    assert _parse_dual_int("5") == (5, 0)  # missing separator -> only top-right


def test_dict_form_still_accepted_for_resilience():
    assert _parse_dual_int({"top_right": 3, "bottom_left": 5}) == (3, 5)
    assert _parse_dual_int({"top_right": 0, "bottom_left": 0}) == (0, 0)
    assert _parse_dual_int({"top_right": 7}) == (7, 0)


def test_negative_or_bogus_numbers_clamp_to_zero():
    assert _parse_dual_int("-3/5") == (0, 5)
    assert _parse_dual_int({"top_right": -1, "bottom_left": 4}) == (0, 4)
