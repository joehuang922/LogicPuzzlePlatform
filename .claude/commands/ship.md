Stage, commit, and push changes to the remote.

Follow these steps:

1. Run `git status` and `git diff` to review all changes (staged, unstaged, and untracked).
2. Stage all relevant files. Exclude files matched by `.gitignore` and any files that look like secrets (`.env`, credentials, etc.). Prefer adding specific files by name over `git add -A`.
3. Show the user a summary of what will be committed and draft a concise commit message. Ask for approval before committing.
4. After approval, commit and push to the current branch's remote.
