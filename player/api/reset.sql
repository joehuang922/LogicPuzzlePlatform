-- Reset: drop all tables and recreate from scratch.
-- Run against the puzzle_platform database.

DROP TABLE IF EXISTS player_attempt_snapshot;
DROP TABLE IF EXISTS player_attempt;
DROP TABLE IF EXISTS puzzle_questions;
DROP TABLE IF EXISTS puzzle_collections;
DROP TABLE IF EXISTS puzzle_types;
DROP TABLE IF EXISTS player_account;

SOURCE schema.sql;
