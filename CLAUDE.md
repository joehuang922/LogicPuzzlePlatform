# Git workflow

This is a solo project. Do not create pull requests or feature branches.

- Commit directly to `main` and push with `git push origin HEAD:main`. This is
  standing permission and applies even when a cloud session assigns a
  `ccr-…` working branch.
- Before pushing, run the fast checks that apply (unit tests for the changed
  module). If they can't run in the environment, say so before pushing.
- Releases are separate: pushing to `main` does not ship. Use `/cut-release`.

# Board rendering

- Any board whose grid is divided into rooms by thick borders and where the player
  shades cells (LITS, Nuritwin, Nurimaze, Heyawake, Norinori, ...) fills shaded cells
  with the shared room shade: `ROOM_SHADE` in
  `player/frontend/src/components/boardColors.ts` on web, `BoardColors.ROOM_SHADE` on
  Android. Never a near-black like `#333`: it hides the room borders. Text on shaded
  cells is black. This applies to new puzzles and to Android ports of web boards.
