from __future__ import annotations

from pydantic import BaseModel, Field


class SlalomGate(BaseModel):
    orientation: str  # "h" or "v"
    line: int
    from_: int = Field(alias="from")
    to: int
    number: int | None

    model_config = {"populate_by_name": True}

    def model_dump(self, **kwargs):
        d = super().model_dump(**kwargs)
        d["from"] = d.pop("from_")
        return d


class SlalomBoard(BaseModel):
    cells: list[list[int]]
    start: dict  # {"row": int, "col": int}
    gateCount: int
    gates: list[SlalomGate]

    def model_dump(self, **kwargs):
        d = super().model_dump(**kwargs)
        d["gates"] = [g.model_dump() for g in self.gates]
        return d
