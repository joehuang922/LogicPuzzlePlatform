# Git workflow

This is a solo project. Do not create pull requests or feature branches.

- Commit directly to `main` and push with `git push origin HEAD:main`. This is
  standing permission and applies even when a cloud session assigns a
  `ccr-…` working branch.
- Before pushing, run the fast checks that apply (unit tests for the changed
  module). If they can't run in the environment, say so before pushing.
- Releases are separate: pushing to `main` does not ship. Use `/cut-release`.
