Cut an Android release: bump the version, push it to `main`, and start the release workflow so CI builds and publishes a signed APK.

`.github/workflows/android-release.yml` runs unit tests, builds a signed release APK, and attaches it to a GitHub Release. It starts either from a pushed `android-v*` tag or from a manual run (`workflow_dispatch`) on a branch. A manual run derives the tag `android-v<versionName>` from `player/android/app/build.gradle.kts` and creates it at the dispatched commit when it publishes the release; it refuses to run if that tag already exists. This skill uses the manual run, so no tag push is needed. That matters in Claude Code cloud sessions, whose git proxy accepts branch pushes but rejects tag pushes.

The target version may be supplied as an argument (e.g. `/cut-release 0.2.0`). If omitted, propose the next patch bump from the current `versionName` and confirm with the user.

Follow these steps:

1. **Preflight.** Confirm the working tree is clean (`git status`) and the current branch is `main` and up to date with `origin/main`. If there are uncommitted changes or the branch is behind/ahead, stop and tell the user — do not release a dirty or diverged tree.
2. **Determine the version.** Read `versionName` / `versionCode` from `player/android/app/build.gradle.kts`. Compute the new `versionName` (from the argument, else next patch) and increment `versionCode` by 1. Verify the tag `android-v<versionName>` does not already exist on the remote (`git ls-remote --tags origin android-v<versionName>`); if it does, stop and ask for a different version.
3. **Show the plan and get approval.** Summarize: old → new `versionName`, old → new `versionCode`, and the tag the release will create (`android-v<versionName>`). Ask for approval before making any changes.
4. **Bump the version.** Edit `player/android/app/build.gradle.kts` to the new `versionName` and `versionCode`. Commit with a message like `Bump Android version to <versionName>` (include the standard `Co-Authored-By` trailer) and push to `main`. Confirm `origin/main` now points at the bump commit.
5. **Start the release.** Trigger the workflow on `main`:
   - With `gh`: `gh workflow run android-release.yml --ref main`.
   - Without `gh` (e.g. a cloud session): use the GitHub MCP tool `actions_run_trigger` with method `run_workflow`, workflow `android-release.yml`, ref `main`.

   Do not create or push the tag yourself; the workflow creates it only after tests and the build pass.
6. **Report.** Tell the user the release run has started and link it (`gh run list --workflow=android-release.yml --limit 1`, or the GitHub MCP `actions_list` tool). Once it finishes, share the Release URL so they can download the APK. If the run fails, report the failing step; the tag is not created on failure, so the same version can be retried after a fix is pushed to `main`.

Never start a release before the version-bump commit is on `origin/main`, and never overwrite an existing tag.
