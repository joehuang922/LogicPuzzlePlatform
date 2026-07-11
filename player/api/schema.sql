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
  progress        FLOAT        NOT NULL DEFAULT 0.0,
  elapsed_seconds INT          NOT NULL DEFAULT 0,
  finished        BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (attempt) REFERENCES player_attempt(id)
);

CREATE TABLE IF NOT EXISTS player_achievement (
  id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  player          INT          NOT NULL,
  achievement_id  VARCHAR(64)  NOT NULL,
  unlocked_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (player) REFERENCES player_account(id),
  UNIQUE KEY uq_player_achievement (player, achievement_id)
);
