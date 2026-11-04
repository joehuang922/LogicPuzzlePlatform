"""Shared test for "is a printed circle centred near this lattice point?".

Puzzles whose clues are circles or dots on a known lattice (Kuralin circles on
edges and corners, Tentai Show dots on centres, edges and corners) test each
lattice point instead of searching the image: a ring of ink at the expected
radius is a strong, local signal. HoughCircles hallucinated circles over empty
cells and missed a gray circle whose halftone fill and touching dashes defeated
the gradient vote; on Tentai Show it missed 14 of 38 dots. A dashed grid
crossing has ink on only a few perimeter samples, so it never passes.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

# Fraction of perimeter samples that must be inked for a circle.
RING_SUPPORT = 0.75
# Circle radii tried and the centre search window, as fractions of the pitch.
RADII = (0.14, 0.16, 0.18, 0.20, 0.22)
OFFSETS = np.linspace(-0.1, 0.1, 9)
# A sample is ink when it is this much darker than the local paper.
INK_CONTRAST = 45.0


@dataclass
class Ring:
    support: float  # best fraction of inked perimeter samples
    cx: float
    cy: float


def paper_level(gray: NDArray, cx: float, cy: float, pitch: float) -> float:
    """Paper brightness around a point: the bright majority of a ~1-pitch box."""
    h, w = gray.shape
    half = int(pitch * 0.45)
    ci, cj = int(round(cy)), int(round(cx))
    patch = gray[max(0, ci - half):min(h, ci + half), max(0, cj - half):min(w, cj + half)]
    return float(np.percentile(patch, 85)) if patch.size else 255.0


def probe_ring(gray: NDArray, x0: float, y0: float, pitch: float) -> Ring:
    """Best ring near (x0, y0), searching the centre and radius together."""
    h, w = gray.shape
    dark_thr = paper_level(gray, x0, y0, pitch) - INK_CONTRAST
    # Candidate centres (C), radii x angles (S): sample all C x S points at once.
    oy, ox = np.meshgrid(OFFSETS, OFFSETS, indexing="ij")
    cx = x0 + ox.ravel() * pitch
    cy = y0 + oy.ravel() * pitch
    best = Ring(0.0, x0, y0)
    for f in RADII:
        r = f * pitch
        n = max(24, int(2 * np.pi * r / 3))
        angles = 2 * np.pi * np.arange(n) / n
        xs = np.round(cx[:, None] + r * np.cos(angles)).astype(int)
        ys = np.round(cy[:, None] + r * np.sin(angles)).astype(int)
        inside = (xs >= 0) & (xs < w) & (ys >= 0) & (ys < h)
        dark = np.zeros(xs.shape, dtype=bool)
        dark[inside] = gray[ys[inside], xs[inside]] < dark_thr
        counts = inside.sum(axis=1)
        support = np.where(counts > 0, dark.sum(axis=1) / np.maximum(counts, 1), 0.0)
        k = int(np.argmax(support))
        if support[k] > best.support:
            best = Ring(float(support[k]), float(cx[k]), float(cy[k]))
    return best


def fill_ratio(gray: NDArray, cx: float, cy: float, pitch: float) -> float:
    """Inner-disk brightness over paper brightness: ~1 open, <0.4 solid black."""
    h, w = gray.shape
    r = max(2, int(pitch * 0.08))
    ci, cj = int(round(cy)), int(round(cx))
    disk = gray[max(0, ci - r):min(h, ci + r + 1), max(0, cj - r):min(w, cj + r + 1)]
    if not disk.size:
        return 1.0
    return float(disk.mean()) / max(1.0, paper_level(gray, cx, cy, pitch))
