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
  jp_label     VARCHAR(128) NOT NULL,
  rule         TEXT         NOT NULL,
  -- Experimental, reader-invented types from a single magazine appearance (few
  -- puzzles, not published periodically). Listed after every other type.
  incubating   TINYINT(1)   NOT NULL DEFAULT 0
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
  special         BOOLEAN      NOT NULL DEFAULT FALSE,
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
INSERT INTO puzzle_types (id, name, jp_label, rule) VALUES
  (1, 'sudoku', '数独', 'Fill every empty cell with a number so that each row, each column and each room (the boxes outlined by thick lines) contains every number from 1 to N exactly once, where N is the width of the board. On the standard 9x9 board that is the digits 1 to 9 in rows, columns and 3x3 boxes.'),
  (2, 'combo-sudoku', '合体数独', 'The board is made of several overlapping 9x9 sudoku grids. Fill every empty cell with a digit from 1 to 9 so that, in every grid, each row, each column and each 3x3 box contains every digit exactly once. A cell where grids overlap belongs to each of them and must satisfy all of their rules.'),
  (3, 'nurimaze', 'ぬりめいず', 'Paint rooms black or mark them to create a maze. The shortest path from S to G must pass all circles and no triangles. No 2x2 blocks of same color allowed.'),
  (4, 'double-choco', 'ダブルチョコ', 'Divide the grid into rooms. Each room contains equal numbers of white and gray cells with the same shape (one is a translation of the other). Numbers indicate how many cells of that color are in the room.'),
  (5, 'slitherlink', 'スリザーリンク', 'Draw a single closed loop along the grid edges. Each number indicates how many of its four surrounding edges are part of the loop.'),
  (6, 'nonogram', 'お絵かきロジック', 'Fill cells black according to row and column clues. Each clue number represents a consecutive group of filled cells. Groups within a line must appear in order with at least one empty cell between them.'),
  (7, 'masyu', 'ましゅ', 'Draw a single closed loop through cell centers. The loop passes through all circles. At white circles the line goes straight but a neighbor must turn. At black circles the line turns but both neighbors must go straight.'),
  (8, 'pencils', 'ペンシルズ', 'Draw pencils (head, body, trail) to fill every cell. Each pencil body is a 1xn rectangle behind its head. The trail extends n segments from the head. Trails cannot overlap or cross. Body length must match the number clue.'),
  (9, 'nuritwin', 'ぬりツイン', 'Blacken cells so each room has exactly two connected black components of equal size. If a room has number N, each component is N cells. All black cells globally connected. No 2x2 all-black.'),
  (10, 'slalom', 'スラローム', 'Draw a closed loop through cell centers starting from the circled number. The loop must cross every gate exactly once perpendicularly. Numbered gates must be crossed in the specified order (either direction). The loop cannot pass through walls or touch itself.'),
  (11, 'shakashaka', 'シャカシャカ', 'Place black right-angled triangles in white cells so that all remaining white regions form rectangles (axis-aligned or 45-degree rotated). Numbers on black cells indicate how many adjacent cells contain a triangle.'),
  (12, 'kakuro', 'カックロ', 'Fill empty cells with digits 1-9. Each horizontal or vertical run of empty cells must sum to the clue number. No digit may repeat within a single run.'),
  (13, 'yajilin', 'ヤジリン', 'Blacken some cells and draw a single closed loop through the rest. No two black cells may be adjacent. Each arrow-number clue indicates exactly how many black cells lie in that direction from the clue.'),
  (14, 'fillomino', 'フィルオミノ', 'Fill every cell with a positive integer and draw borders to divide the grid into rooms. Each room of size N must contain only the digit N. No two adjacent rooms may contain the same number.'),
  (15, 'lits', 'LITS', 'Shade one L, I, T, or S tetromino in every region. All shaded cells form a single connected group. No 2x2 area is fully shaded. Two tetrominoes of the same shape may not be orthogonally adjacent.'),
  (16, 'choco-banana', 'チョコバナナ', 'Shade some cells. Every group of connected shaded cells must form a rectangle; every group of connected unshaded cells must not form a rectangle. A number indicates the size of the group (shaded or unshaded) that its cell belongs to.'),
  (17, 'number-link', 'ナンバーリンク', 'Connect each pair of matching numbers with a single continuous path running horizontally or vertically between cells. Paths may not cross or overlap, and every cell must be used by exactly one path.'),
  (18, 'akari', '美術館', 'Place light bulbs in white cells. Each bulb lights its row and column until blocked by a black wall. Every white cell must be lit, and no bulb may light another. A numbered wall must have exactly that many bulbs orthogonally adjacent.'),
  (19, 'hell-golf', 'ヘルゴルフ', 'Move every ball onto a goal (H). A ball with number k slides k cells in a straight line, then its number drops by 1; a ball at 0 cannot move. Moves may not stop on a lake (gray region) but may slide across one. Trails may not cross each other or themselves, or pass over other balls and goals. Each ball ends on its own distinct goal.'),
  (20, 'tentaishow', '天体ショー', 'Divide the grid into regions by drawing walls along cell edges. Each region contains exactly one dot and has 180-degree rotational symmetry about that dot. Every cell belongs to exactly one connected region.'),
  (21, 'heyawake', 'へやわけ', 'Paint cells black. A number in a room gives exactly how many of its cells are black. No two black cells may be orthogonally adjacent. All white cells must stay connected. No straight horizontal or vertical run of white cells may span three or more rooms.'),
  (22, 'shikaku', '四角に切れ', 'Divide the grid into rectangles. Each rectangle contains exactly one number, and that number equals the rectangle''s area (its width times height in cells). Rectangles may not overlap, and every cell must belong to exactly one rectangle.'),
  (23, 'norinori', 'のりのり', 'Shade cells so every region contains exactly two shaded cells. All shaded cells must form dominoes: each shaded cell is orthogonally adjacent to exactly one other shaded cell. Dominoes may cross region boundaries.'),
  (24, 'nurikabe', 'ぬりかべ', 'Each number is an island of that many white cells, with exactly one number per island. Islands may not touch orthogonally. All remaining black cells form one connected sea, and no 2x2 area is entirely black.'),
  (25, 'ripple-effect', '波及効果', 'The grid is divided into rooms. Fill every cell so each room of size N contains the numbers 1 to N exactly once. If the same number K appears more than once in a row or column, those equal numbers must be at least K cells apart.'),
  (26, 'hitori', 'ひとりにしてくれ', 'Shade some cells so that no number appears more than once among the unshaded cells of any row or column. Shaded cells may not touch each other orthogonally. All unshaded cells must form one orthogonally connected group.'),
  (27, 'picto-link', 'ピクトリンク', 'Link each pair of matching numbers with a path of cells. The path length (counting both endpoints) equals the number. A 1 is a single cell on its own. Paths may not cross or overlap, and the filled cells reveal a picture.'),
  (28, 'kuralin', 'クラリン', 'Draw a single loop through cell centers and blacken every cell the loop does not pass through. The loop never crosses itself, branches, or visits a cell twice. A black circle touches more black cells than white cells, a white circle touches more white cells than black cells, and a gray circle touches equal numbers of each.'),
  (29, 'unequal-sudoku', '不等号ナンプレ', 'Fill every cell with a digit from 1 to 9 so that each row, column and 3x3 box contains every digit exactly once. Every inequality sign between two neighbouring cells must hold: the sign points at the smaller digit.'),
  (30, 'corner-chain', '隅角チェーン', 'Shade some cells. Each number gives the size of its island, the group of orthogonally connected unshaded cells it belongs to. An island may contain any number of numbers, and numbered cells are never shaded. An island with an even number of cells must be a rectangle; an island with an odd number of cells must not be a rectangle. All islands must link into one network through cells touching at a corner.'),
  (31, 'sinkamino', 'シンカミノ', 'Place squares in some white cells; printed squares are already placed. Squares sharing an edge form an island. Every island must be crossed by the arrows at exactly one of its squares, and every arrow must cross at least two islands. Along each arrow, from tail to head, each island is the previous island in the same orientation (no rotating or flipping) with one square added.'),
  (32, 'balance-link', 'バランスリンク', 'Draw lines through white cells to join identical symbols (same shape and colour) in pairs. Lines may not enter black cells. Lines run horizontally and vertically through cell centres, and each line must be mirror-symmetric about the point halfway along it. Lines may not cross, branch, share a cell or pass through a symbol. Not every cell needs a line.'),
  (33, 'l-ring', 'えるりんぐ', 'Draw a single closed loop through cell centres, moving horizontally and vertically; it may not cross or branch, and not every cell needs to be on it. The loop passes through every arrow cell and turns there, making an L. Of the two straight arms leaving an arrow cell (each runs to the loop''s next turn), the arm in the arrow''s direction is exactly one cell longer than the other.'),
  (34, 'hashi', '橋をかけろ', 'Connect the islands with bridges. Bridges run straight horizontally or vertically between two islands, never cross each other or pass over an island, and at most two bridges join the same pair of islands. The number on each island is how many bridges end there. All islands must be connected into one group.'),
  (35, 'skeleton-puzzle', 'スケルトンパズル', 'Fit every word of the list into the board, one kana per cell, reading left to right or top to bottom. Each run of two or more cells holds exactly one word of its length, every word is used once, and where two words cross they share the same kana. Small kana such as ッ or ゃ are written full-size.'),
  (36, 'zebra-rope', 'シマシマロープ', 'Shade some cells. A circle tells which kind of cell is the majority of the cells touching it: black means more shaded cells, white means more unshaded cells, gray means equal numbers. The cells each gray rope passes through are all unshaded, all shaded, or alternate shaded and unshaded along the rope. A rope crossing a cell corner diagonally passes only the two cells it joins, not the other cells at that corner.'),
  (37, 'whimsical-knight', '気まぐれナイト', 'Draw segments between dots to form a single closed loop. A segment runs one step up, down, left or right, or a knight''s move (1x2). The loop passes through the centre of every white circle and white square: it goes straight through a circle and turns at a right angle at a square. A knight segment may not pass over a gray square. Segments may not cross or branch.'),
  (38, 'omino-tree', 'オミノツリー', 'Divide the grid into blocks by drawing walls along the dotted lines. A number gives the size of its block; a block may hold several numbers, or none. The two cells joined by an arrow are in different blocks, and the block at the arrow''s head is the block at its tail, in the same orientation (not rotated or reflected), with one cell added. Every block contains the start or end of at least one arrow.'),
  (39, 'minus-room', 'マイナルーム', 'Fill every empty cell with a number from 1 to the puzzle''s maximum. Inside each room, orthogonally adjacent equal numbers form blocks, and a block of number N has exactly N cells; a room may not hold two blocks of the same number. A circled number between two cells is their difference. Equal numbers may never form a 2x2 clump.'),
  (40, 'tile-paint', 'タイルペイント', 'Shade some of the tiles (the areas outlined by thick lines). Every tile is either shaded whole or left unshaded; never only part of it. A number in a clue cell gives how many shaded cells its run holds: the upper-right number counts the cells to its right, the lower-left number the cells below it, each up to the edge of the board or the next clue cell.'),
  (41, 'country-road', 'カントリーロード', 'Draw one closed loop through cell centres, moving horizontally and vertically; it never crosses or branches and need not visit every cell. The loop passes through every room exactly once, entering and leaving it once. A number in a room gives how many of its cells the loop passes through. Two cells the loop does not use may not touch across a room wall.'),
  (42, 'perfect-l-ring', '完全えるりんぐ', 'Draw a single closed loop through cell centres, moving horizontally and vertically; it may not cross or branch, and not every cell needs to be on it. The loop passes through every arrow cell and turns there, making an L. Of the two straight arms leaving an arrow cell (each runs to the loop''s next turn), the arm in the arrow''s direction is exactly one cell longer than the other. Wherever the loop turns in a cell without an arrow, its two arms must not differ by exactly one cell.'),
  (43, 'mannequin-gate-2', 'マネキンゲート2', 'Shade some cells. Gray lines run through cell centres, horizontally, vertically or diagonally; a line only passing a cell''s corner does not pass that cell. Every line passes through exactly two shaded cells. A line''s gate size is the number of unshaded cells between its two shaded cells. Lines that cross (sharing a cell, or crossing diagonally at a grid corner) must have different gate sizes. All unshaded cells must be connected orthogonally.'),
  (44, 'picturesque-maze', '浮き出しメイロ', 'Find the shortest route through the maze from the entrance (IN) to the exit (OUT), moving between neighbouring cells without crossing a wall. Shade the cells of that route: they draw a picture.'),
  (45, 'irregular-nonogram', '変形ロジック', 'A nonogram on an irregular board. Fill some cells so that every piece of the board (a run of cells along a row or column, between gaps in the board) holds exactly the runs of filled cells its clue lists, in order, with at least one empty cell between runs. Each piece''s clue is printed at one end of it, left or right of a row piece, above or below a column piece. The filled cells draw a picture.'),
  (46, 'yajilix', 'ヤジリックス', 'Draw a single closed loop through cell centres, moving horizontally and vertically; it may not cross or branch, and not every cell needs to be on it. The loop never enters a clue cell. A clue counts the cells without a clue from it to the edge of the board in the arrow''s direction (other clue cells are skipped): L counts the cells where the loop turns, I the cells it goes straight through, and X the cells it does not visit.'),
  (47, 'majority-yajilix', '多数派ヤジリックス', 'Draw a single closed loop through cell centres, moving horizontally and vertically; it may not cross or branch, and not every cell needs to be on it. The loop never enters a clue cell. Every other cell is an L (the loop turns there), an I (it goes straight through) or an X (it does not visit it). A clue looks at the cells without a clue from it to the edge of the board in the arrow''s direction (other clue cells are skipped): its letter is the kind that has strictly more of those cells than each of the other two kinds.'),
  (48, 'half-full-paint', '半全ペイント', 'Shade some cells. Thick lines divide the board into rooms. Every room is either all shaded, all unshaded, or exactly half shaded; in each room the shaded cells must be connected, and so must the unshaded cells. A circle on a grid line shows the majority of the cells it touches (two on an edge, four on a corner): black means more shaded cells, white means more unshaded cells, and gray means as many of each.'),
  (49, 'melon-pie', 'メロンパイ', 'Draw lines along the dotted lines to join circles of the same colour in pairs. A line never branches and ends only at circles, and it never passes through a point that holds a circle. Lines may cross at a point; there each line goes straight on, like a bridge. Through their crossings, all the lines together form one connected whole.');

-- Incubating types (see the column comment): listed after every other type.
UPDATE puzzle_types SET incubating = 1 WHERE id IN (37, 38, 39, 42, 43, 46, 47, 49);

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

-- Seed sample puzzle: hitori (difficulty 1 = easy). Puzzle 1 from docs/hitori/board-hitori-8x8.jpg;
-- verified to have a unique solution.
INSERT INTO puzzle_questions (id, puzzle_type, title, difficulty, width, height, canon_repr) VALUES (
  'a0000000-0000-0000-0000-000000000026',
  26,
  'Sample Hitori',
  1,
  8,
  8,
  '{"cells":[[7,8,4,3,6,5,7,2],[7,5,6,2,4,8,8,8],[7,2,8,4,5,3,7,6],[3,4,5,2,7,4,6,1],[4,1,8,5,6,7,2,3],[2,7,3,1,2,4,4,4],[2,3,4,8,5,6,3,7],[2,6,7,2,3,2,5,4]]}'
);

-- Seed sample puzzle: hitori 17x17 (difficulty 4 = hard). Puzzle 3 ("白銀のオオカミ") from
-- docs/hitori/board-hitori-17x17.jpg; parsed with Gemini OCR and verified to have a unique solution.
INSERT INTO puzzle_questions (id, puzzle_type, title, difficulty, width, height, canon_repr) VALUES (
  'a0000000-0000-0000-0000-000000000027',
  26,
  'Sample Hitori 17x17',
  4,
  17,
  17,
  '{"cells":[[1,1,1,4,2,10,2,17,8,5,8,11,8,15,9,13,6],[6,5,3,17,12,17,16,15,13,7,11,10,1,5,4,2,8],[16,3,16,10,16,12,7,13,9,14,9,1,9,4,11,2,6],[10,14,12,15,8,9,11,4,16,7,13,17,5,3,6,2,1],[13,10,13,8,6,3,5,11,4,1,2,15,12,16,13,9,13],[17,14,9,13,11,4,1,4,2,7,15,4,10,6,5,12,16],[3,12,14,2,3,8,3,16,3,4,6,13,6,10,9,11,15],[9,15,8,13,4,5,14,5,1,7,10,5,3,12,2,12,12],[16,9,14,6,13,1,13,2,8,17,3,12,11,7,10,4,5],[8,15,6,7,5,11,9,12,17,11,1,10,14,2,16,15,4],[16,6,15,9,13,2,13,3,4,8,12,7,12,13,1,5,17],[12,11,16,16,17,7,8,1,5,3,4,10,2,1,14,1,9],[1,13,15,5,9,6,2,8,4,16,12,3,12,14,11,10,7],[5,14,2,7,15,7,12,7,6,7,16,10,4,17,8,7,11],[4,4,4,1,6,14,5,10,7,2,12,8,12,11,3,3,3],[11,8,4,15,1,9,6,9,10,3,5,14,13,8,12,7,2],[1,7,4,3,6,13,5,14,12,15,2,16,11,9,10,8,17]]}'
);

-- Seed sample puzzle: norinori (difficulty 2 = easy-normal). A 6x6 board with 8 regions,
-- generated and verified by brute-force search to have a unique solution.
INSERT INTO puzzle_questions (id, puzzle_type, title, difficulty, width, height, canon_repr) VALUES (
  'a0000000-0000-0000-0000-000000000023',
  23,
  'Sample Norinori',
  2,
  6,
  6,
  '{"grids":{"h":[[0,1,0,1,0,0],[0,1,0,1,1,1],[1,1,1,1,0,1],[0,1,0,0,1,0],[1,1,1,1,0,0]],"v":[[0,1,1,0,0],[1,0,0,1,0],[0,1,1,0,0],[0,1,0,1,1],[1,0,0,1,0],[0,0,0,1,0]]}}'
);

-- Seed sample puzzle: heyawake (difficulty 2 = easy-normal). A 6x6 board with 15 rectangular
-- rooms (4 clued), generated and verified by brute-force search to have a unique solution.
INSERT INTO puzzle_questions (id, puzzle_type, title, difficulty, width, height, canon_repr) VALUES (
  'a0000000-0000-0000-0000-000000000021',
  21,
  'Sample Heyawake',
  2,
  6,
  6,
  '{"width":6,"height":6,"rooms":[{"r":0,"c":0,"w":2,"h":3,"clue":2},{"r":0,"c":2,"w":1,"h":2,"clue":null},{"r":0,"c":3,"w":1,"h":2,"clue":null},{"r":0,"c":4,"w":1,"h":3,"clue":null},{"r":0,"c":5,"w":1,"h":3,"clue":1},{"r":2,"c":2,"w":1,"h":2,"clue":null},{"r":2,"c":3,"w":1,"h":1,"clue":null},{"r":3,"c":0,"w":2,"h":2,"clue":null},{"r":3,"c":3,"w":2,"h":1,"clue":null},{"r":3,"c":5,"w":1,"h":3,"clue":null},{"r":4,"c":2,"w":2,"h":1,"clue":0},{"r":4,"c":4,"w":1,"h":1,"clue":null},{"r":5,"c":0,"w":3,"h":1,"clue":1},{"r":5,"c":3,"w":1,"h":1,"clue":null},{"r":5,"c":4,"w":1,"h":1,"clue":null}]}'
);

-- Seed default admin account
INSERT INTO player_account (name, password, role) VALUES ('admin', 'admin', 'admin');
