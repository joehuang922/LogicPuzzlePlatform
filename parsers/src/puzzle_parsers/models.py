from __future__ import annotations

from pydantic import BaseModel


class PuzzleMetadata(BaseModel):
    title: str | None = None
    source: str | None = None
    difficulty: str | None = None
    width: int | None = None
    height: int | None = None


class PuzzleData(BaseModel):
    puzzle_type: str
    metadata: PuzzleMetadata = PuzzleMetadata()
    grid: dict = {}
    constraints: list[dict] = []
    solution: dict | None = None
