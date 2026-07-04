-- difficulty enum:
--   1 = very-easy
--   2 = easy
--   3 = normal
--   4 = hard
--   5 = super-hard

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
