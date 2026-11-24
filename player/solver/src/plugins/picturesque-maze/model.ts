import { Branch, ConstraintModel } from "../../types";

/** Mirrors the frontend `MazeOpening`: a border cell's outer edge. */
export interface MazeOpening {
  side: "top" | "bottom" | "left" | "right";
  index: number;
}

/** Canonical Picturesque Maze representation, mirroring the frontend `PicturesqueMazeCanon`. */
export interface PicturesqueMazeCanon {
  width: number;
  height: number;
  walls: {
    // (height - 1) x width; 1 = wall between (r, c) and (r + 1, c)
    h: number[][];
    // height x (width - 1); 1 = wall between (r, c) and (r, c + 1)
    v: number[][];
  };
  entrance: MazeOpening;
  exit: MazeOpening;
}

/**
 * The route's segments, the frontend `PicturesqueMazeAnswer.edges` shape (note the
 * axes differ from the walls'): `h` is height x (width - 1), 1 = segment between
 * (r, c) and (r, c + 1); `v` is (height - 1) x width, 1 = segment between (r, c) and
 * (r + 1, c).
 */
export interface PicturesqueMazeEdges {
  h: number[][];
  v: number[][];
}

/** The border cell an opening opens, as a cell index, or -1 when it is off the board. */
function openingCell(o: MazeOpening, width: number, height: number): number {
  const limit = o.side === "top" || o.side === "bottom" ? width : height;
  if (!Number.isInteger(o.index) || o.index < 0 || o.index >= limit) return -1;
  switch (o.side) {
    case "top":
      return o.index;
    case "bottom":
      return (height - 1) * width + o.index;
    case "left":
      return o.index * width;
    default:
      return o.index * width + width - 1;
  }
}

/** Shared per puzzle: the BFS distances from the entrance. */
interface Spec {
  width: number;
  height: number;
  walls: PicturesqueMazeCanon["walls"];
  start: number;
  goal: number;
  dist: Int32Array; // -1 = unreachable
}

function openNeighbours(s: Spec, cell: number): number[] {
  const { width, height, walls } = s;
  const r = Math.floor(cell / width);
  const c = cell % width;
  const out: number[] = [];
  if (r > 0 && !walls.h[r - 1]?.[c]) out.push(cell - width);
  if (r < height - 1 && !walls.h[r]?.[c]) out.push(cell + width);
  if (c > 0 && !walls.v[r]?.[c - 1]) out.push(cell - 1);
  if (c < width - 1 && !walls.v[r]?.[c]) out.push(cell + 1);
  return out;
}

/**
 * The puzzle's answer is the shortest route from the entrance to the exit; it must be
 * unique. One BFS from the entrance labels every cell's distance. A shortest route is
 * then a walk back from the exit, each step to an open neighbour one closer to the
 * entrance; every such walk reaches the entrance, so no branch is ever dead.
 *
 * The model is that walk: forced steps (one closer neighbour) are taken at once, and a
 * cell with two or more closer neighbours is a branch point, its candidates those
 * neighbours. A unique shortest route is therefore solved at construction with no
 * search, and two shortest routes surface as the driver's first two leaves.
 */
export class PicturesqueMazeModel implements ConstraintModel<PicturesqueMazeEdges> {
  private constructor(
    private readonly spec: Spec | null,
    /** Cells from the exit back toward the entrance, walked so far. */
    private readonly back: number[],
  ) {}

  static fromCanon(canon: PicturesqueMazeCanon): PicturesqueMazeModel {
    const { width, height, walls } = canon;
    const start = openingCell(canon.entrance, width, height);
    const goal = openingCell(canon.exit, width, height);
    if (width < 1 || height < 1 || start < 0 || goal < 0 || start === goal) {
      return new PicturesqueMazeModel(null, []);
    }
    const spec: Spec = { width, height, walls, start, goal, dist: new Int32Array(width * height).fill(-1) };
    spec.dist[start] = 0;
    const queue = [start];
    for (let qi = 0; qi < queue.length; qi++) {
      const cur = queue[qi];
      for (const nb of openNeighbours(spec, cur)) {
        if (spec.dist[nb] < 0) {
          spec.dist[nb] = spec.dist[cur] + 1;
          queue.push(nb);
        }
      }
    }
    if (spec.dist[goal] < 0) return new PicturesqueMazeModel(null, []);
    return new PicturesqueMazeModel(spec, PicturesqueMazeModel.walk(spec, [goal]));
  }

  /** Neighbours of `cell` one step closer to the entrance. */
  private static closer(spec: Spec, cell: number): number[] {
    const d = spec.dist[cell];
    return openNeighbours(spec, cell).filter((nb) => spec.dist[nb] === d - 1);
  }

  /** Take forced steps from the end of `back` until the entrance or a branch point. */
  private static walk(spec: Spec, back: number[]): number[] {
    for (;;) {
      const end = back[back.length - 1];
      if (end === spec.start) return back;
      const next = PicturesqueMazeModel.closer(spec, end);
      if (next.length !== 1) return back;
      back.push(next[0]);
    }
  }

  isDead(): boolean {
    return this.spec === null;
  }

  isSolved(): boolean {
    return this.spec !== null && this.back[this.back.length - 1] === this.spec.start;
  }

  selectBranch(): Branch | null {
    if (!this.spec || this.isSolved()) return null;
    return { id: 0, candidates: PicturesqueMazeModel.closer(this.spec, this.back[this.back.length - 1]) };
  }

  assign(_id: number, value: number): PicturesqueMazeModel {
    const spec = this.spec!;
    const end = this.back[this.back.length - 1];
    if (!PicturesqueMazeModel.closer(spec, end).includes(value)) return new PicturesqueMazeModel(null, []);
    return new PicturesqueMazeModel(spec, PicturesqueMazeModel.walk(spec, [...this.back, value]));
  }

  /** The route's cells, entrance first, as [row, col]. */
  route(): [number, number][] {
    const w = this.spec?.width ?? 1;
    return [...this.back].reverse().map((cell) => [Math.floor(cell / w), cell % w]);
  }

  solution(): PicturesqueMazeEdges {
    const { width, height } = this.spec!;
    const h = Array.from({ length: height }, () => new Array<number>(Math.max(0, width - 1)).fill(0));
    const v = Array.from({ length: Math.max(0, height - 1) }, () => new Array<number>(width).fill(0));
    const route = this.route();
    for (let i = 1; i < route.length; i++) {
      const [r1, c1] = route[i - 1];
      const [r2, c2] = route[i];
      if (r1 === r2) h[r1][Math.min(c1, c2)] = 1;
      else v[Math.min(r1, r2)][c1] = 1;
    }
    return { h, v };
  }
}
