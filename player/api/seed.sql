-- Reset and seed the database with initial data.
-- Run against the puzzle_platform database.

DROP TABLE IF EXISTS player_attempt_snapshot;
DROP TABLE IF EXISTS player_attempt;
DROP TABLE IF EXISTS puzzle_questions;
DROP TABLE IF EXISTS puzzle_collections;
DROP TABLE IF EXISTS puzzle_types;
DROP TABLE IF EXISTS player_account;

CREATE TABLE IF NOT EXISTS puzzle_types (
  id           INT          NOT NULL PRIMARY KEY,
  name         VARCHAR(128) NOT NULL,
  rule         TEXT         NOT NULL
);

CREATE TABLE IF NOT EXISTS puzzle_collections (
  id           INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(255) NOT NULL,
  publisher    VARCHAR(255) NULL,
  publish_at   DATE         NULL,
  cover_src    VARCHAR(512) NULL
);

CREATE TABLE IF NOT EXISTS player_account (
  id           INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(255) NOT NULL,
  password     VARCHAR(255) NOT NULL,
  role         VARCHAR(64)  NOT NULL
);

CREATE TABLE IF NOT EXISTS puzzle_questions (
  id              VARCHAR(36)  NOT NULL PRIMARY KEY,
  puzzle_type     INT          NOT NULL,
  title           VARCHAR(255) NULL,
  author          VARCHAR(255) NULL,
  difficulty      INT          NOT NULL,
  width           INT          NULL,
  height          INT          NULL,
  canon_repr      JSON         NOT NULL,
  src_collection  INT          NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (puzzle_type) REFERENCES puzzle_types(id),
  FOREIGN KEY (src_collection) REFERENCES puzzle_collections(id)
);

CREATE TABLE IF NOT EXISTS player_attempt (
  id           VARCHAR(36)  NOT NULL PRIMARY KEY,
  player       INT          NOT NULL,
  question     VARCHAR(36)  NOT NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at  TIMESTAMP    NULL,
  FOREIGN KEY (player) REFERENCES player_account(id),
  FOREIGN KEY (question) REFERENCES puzzle_questions(id)
);

CREATE TABLE IF NOT EXISTS player_attempt_snapshot (
  id              VARCHAR(36)  NOT NULL PRIMARY KEY,
  attempt         VARCHAR(36)  NOT NULL,
  current_answer  JSON         NOT NULL,
  progress        FLOAT        NOT NULL,
  elapsed_seconds INT          NOT NULL DEFAULT 0,
  finished        BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (attempt) REFERENCES player_attempt(id)
);

-- Seed puzzle types
INSERT INTO puzzle_types (id, name, rule) VALUES
  (1, 'sudoku', ''),
  (2, 'combo-sudoku', ''),
  (3, 'nurimaze', 'Paint rooms black or mark them to create a maze. The shortest path from S to G must pass all circles and no triangles. No 2x2 blocks of same color allowed.'),
  (4, 'double-choco', 'Divide the grid into rooms. Each room contains equal numbers of white and gray cells with the same shape (one is a translation of the other). Numbers indicate how many cells of that color are in the room.'),
  (5, 'slitherlink', 'Draw a single closed loop along the grid edges. Each number indicates how many of its four surrounding edges are part of the loop.'),
  (6, 'nonogram', 'Fill cells black according to row and column clues. Each clue number represents a consecutive group of filled cells. Groups within a line must appear in order with at least one empty cell between them.'),
  (7, 'masyu', 'Draw a single closed loop through cell centers. The loop passes through all circles. At white circles the line goes straight but a neighbor must turn. At black circles the line turns but both neighbors must go straight.'),
  (8, 'pencils', 'Draw pencils (head, body, trail) to fill every cell. Each pencil body is a 1xn rectangle behind its head. The trail extends n segments from the head. Trails cannot overlap or cross. Body length must match the number clue.'),
  (9, 'nuritwin', 'Blacken cells so each room has exactly two connected black components of equal size. If a room has number N, each component is N cells. All black cells globally connected. No 2x2 all-black.'),
  (10, 'slalom', 'Draw a closed loop through cell centers starting from the circled number. The loop must cross every gate exactly once perpendicularly. Numbered gates must be crossed in the specified order (either direction). The loop cannot pass through walls or touch itself.'),
  (11, 'shakashaka', 'Place black right-angled triangles in white cells so that all remaining white regions form rectangles (axis-aligned or 45-degree rotated). Numbers on black cells indicate how many adjacent cells contain a triangle.'),
  (12, 'kakuro', 'Fill empty cells with digits 1-9. Each horizontal or vertical run of empty cells must sum to the clue number. No digit may repeat within a single run.'),
  (13, 'yajilin', 'Blacken some cells and draw a single closed loop through the rest. No two black cells may be adjacent. Each arrow-number clue indicates exactly how many black cells lie in that direction from the clue.'),
  (14, 'fillomino', 'Fill every cell with a positive integer and draw borders to divide the grid into rooms. Each room of size N must contain only the digit N. No two adjacent rooms may contain the same number.'),
  (15, 'lits', 'Shade one L, I, T, or S tetromino in every region. All shaded cells form a single connected group. No 2x2 area is fully shaded. Two tetrominoes of the same shape may not be orthogonally adjacent.'),
  (16, 'choco-banana', 'Shade some cells. Every group of connected shaded cells must form a rectangle; every group of connected unshaded cells must not form a rectangle. A number indicates the size of the group (shaded or unshaded) that its cell belongs to.'),
  (17, 'number-link', 'Connect each pair of matching numbers with a single continuous path running horizontally or vertically between cells. Paths may not cross or overlap, and every cell must be used by exactly one path.'),
  (18, 'akari', 'Place light bulbs in white cells. Each bulb lights its row and column until blocked by a black wall. Every white cell must be lit, and no bulb may light another. A numbered wall must have exactly that many bulbs orthogonally adjacent.'),
  (19, 'hell-golf', 'Move every ball onto a goal (H). A ball with number k slides k cells in a straight line, then its number drops by 1; a ball at 0 cannot move. Moves may not stop on a lake (gray region) but may slide across one. Trails may not cross each other or themselves, or pass over other balls and goals. Each ball ends on its own distinct goal.'),
  (20, 'tentaishow', 'Divide the grid into regions by drawing walls along cell edges. Each region contains exactly one dot and has 180-degree rotational symmetry about that dot. Every cell belongs to exactly one connected region.'),
  (21, 'heyawake', 'Paint cells black. A number in a room gives exactly how many of its cells are black. No two black cells may be orthogonally adjacent. All white cells must stay connected. No straight horizontal or vertical run of white cells may span three or more rooms.');

-- Seed sample puzzle: sudoku (difficulty 4 = hard)
INSERT INTO puzzle_questions (id, puzzle_type, title, difficulty, width, height, canon_repr) VALUES (
  'a0000000-0000-0000-0000-000000000001',
  1,
  'Sample Sudoku',
  4,
  9,
  9,
  '{"hints":[[0,0,1,0,0,0,8,0,0],[0,2,0,0,0,7,0,4,0],[0,3,0,5,0,0,9,0,0],[8,0,0,0,0,0,0,0,3],[0,0,0,6,0,1,0,0,0],[9,0,0,0,0,0,0,0,5],[0,0,9,0,0,4,0,6,0],[0,8,0,3,0,0,0,2,0],[0,0,7,0,0,0,1,0,0]]}'
);

-- Seed sample puzzle: combo-sudoku (difficulty 4 = hard)
INSERT INTO puzzle_questions (id, puzzle_type, title, difficulty, width, height, canon_repr) VALUES (
  'a0000000-0000-0000-0000-000000000002',
  2,
  'Sample Combo Sudoku',
  4,
  21,
  27,
  '{"subboards":[{"x":1,"y":0,"hints":[[7,5,0,0,1,2,0,0,0],[4,0,0,3,6,0,0,7,0],[0,0,6,0,0,0,0,0,0],[0,9,0,0,0,0,0,0,7],[3,7,0,0,9,0,0,4,6],[0,0,0,0,0,0,0,5,0],[0,0,0,0,0,0,0,9,0],[0,0,0,0,0,0,7,0,1],[0,0,0,0,0,0,0,2,0]]},{"x":0,"y":1,"hints":[[7,3,0,0,9,0,0,0,0],[8,0,0,3,7,0,0,9,0],[0,0,1,0,0,0,0,0,0],[0,5,0,0,0,0,0,0,0],[1,8,0,0,0,0,0,0,0],[4,0,0,0,0,0,0,0,0],[0,0,0,0,1,0,0,0,0],[0,7,0,8,0,6,0,0,0],[0,0,0,0,2,0,0,0,0]]},{"x":2,"y":2,"hints":[[0,0,0,0,9,0,0,0,0],[0,0,0,7,0,1,0,5,0],[0,0,0,0,2,0,0,0,0],[0,0,0,0,0,0,0,0,1],[0,0,0,0,0,0,0,6,8],[0,0,0,0,0,0,0,2,0],[0,0,0,0,0,0,3,0,0],[0,9,0,0,1,2,0,0,5],[0,0,0,0,3,0,0,9,2]]},{"x":1,"y":3,"hints":[[0,1,0,0,0,0,0,0,0],[8,0,6,0,0,0,0,0,0],[0,2,0,0,0,0,0,0,0],[0,3,0,0,0,0,0,0,0],[5,7,0,0,9,0,0,1,2],[6,0,0,0,0,0,0,3,0],[0,0,0,8,0,0,3,0,0],[0,8,0,0,4,6,0,0,5],[0,0,0,2,3,0,0,8,1]]}]}'
);

-- Seed sample puzzle: nurimaze (difficulty 3 = normal)
INSERT INTO puzzle_questions (id, puzzle_type, title, difficulty, width, height, canon_repr) VALUES (
  'a0000000-0000-0000-0000-000000000003',
  3,
  'Sample Nurimaze',
  3,
  10,
  10,
  '{"cells":[[3,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,2,0,0],[0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,1,0,0,0],[0,0,0,1,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0],[0,0,0,1,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,4]],"grids":{"h":[[1,0,0,1,0,0,0,0,1,0],[0,0,1,0,0,1,0,0,0,1],[0,1,0,0,1,0,0,1,0,0],[1,0,0,1,0,0,1,0,0,1],[0,0,1,0,1,0,0,0,1,0],[0,1,0,0,0,1,0,1,0,0],[1,0,0,1,0,0,1,0,0,1],[0,0,1,0,0,1,0,0,1,0],[0,1,0,0,1,0,0,1,0,0]],"v":[[0,1,0,0,1,0,0,1,0],[1,0,0,1,0,0,1,0,1],[0,0,1,0,0,1,0,0,0],[0,1,0,0,1,0,0,1,0],[1,0,0,1,0,0,1,0,1],[0,0,1,0,1,0,0,0,0],[0,1,0,0,0,1,0,1,0],[1,0,0,1,0,0,1,0,1],[0,0,1,0,0,1,0,0,0],[0,1,0,0,1,0,0,1,0]]}}'
);

-- Seed sample puzzle: hell-golf (difficulty 3 = normal)
INSERT INTO puzzle_questions (id, puzzle_type, title, difficulty, width, height, canon_repr) VALUES (
  'a0000000-0000-0000-0000-000000000019',
  19,
  'Sample Hell Golf',
  3,
  10,
  10,
  '{"lakes":[[0,0,0,0,0,1,1,0,0,0],[0,0,0,0,0,1,0,0,0,0],[0,0,0,0,0,1,0,0,0,0],[0,0,0,0,0,1,0,0,0,0],[0,0,0,1,1,1,0,0,0,0],[1,1,0,0,0,0,1,1,1,1],[0,1,0,0,0,1,0,0,0,0],[0,1,0,0,0,1,0,0,0,0],[0,0,1,0,0,1,0,0,0,0],[0,0,0,0,0,1,1,1,0,0]],"balls":[{"r":2,"c":2,"n":2},{"r":2,"c":6,"n":2},{"r":3,"c":1,"n":3},{"r":3,"c":2,"n":4},{"r":4,"c":2,"n":2},{"r":5,"c":5,"n":3},{"r":6,"c":7,"n":3},{"r":7,"c":6,"n":3},{"r":9,"c":4,"n":3}],"goals":[[0,3],[2,4],[2,9],[3,7],[4,0],[6,4],[7,3],[9,1],[9,8]]}'
);

-- Seed default admin account
INSERT INTO player_account (name, password, role) VALUES ('admin', 'admin', 'admin');
