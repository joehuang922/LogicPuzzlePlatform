from __future__ import annotations

from pydantic import BaseModel


class SkeletonWord(BaseModel):
    # the kana as printed, small kana included
    word: str
    # the parenthesised text, shown but never placed
    hint: str | None = None


class SkeletonMark(BaseModel):
    # a double-framed cell for a prize question; display only
    r: int
    c: int
    label: str


class SkeletonPuzzleBoard(BaseModel):
    # rows x cols; 1 = a cell, 0 = not a cell
    cells: list[list[int]]
    words: list[SkeletonWord]
    # the parser leaves marks to the editor
    marks: list[SkeletonMark] | None = None

    def canon(self) -> dict:
        """The canon dict: hints and marks only where present (the schema has no nulls)."""
        out: dict = {
            "cells": self.cells,
            "words": [{"word": w.word, **({"hint": w.hint} if w.hint else {})} for w in self.words],
        }
        if self.marks:
            out["marks"] = [m.model_dump() for m in self.marks]
        return out
