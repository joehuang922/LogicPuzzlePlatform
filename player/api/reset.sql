-- Reset: drop all tables and recreate from scratch.
-- Run against the puzzle_platform database.

DROP TABLE IF EXISTS puzzle_questions;
DROP TABLE IF EXISTS puzzle_collections;
DROP TABLE IF EXISTS puzzle_types;

SOURCE schema.sql;
