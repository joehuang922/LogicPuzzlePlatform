Cut an Android release: bump the version, push it to `main`, and start the release workflow so CI builds and publishes a signed APK.

`.github/workflows/android-release.yml` runs unit tests, builds a signed release APK, and attaches it to a GitHub Release. It starts either from a pushed `android-v*` tag or from a manual run (`workflow_dispatch`) on a branch. A manual run derives the tag `android-v<versionName>` from `player/android/app/build.gradle.kts` and creates it at the dispatched commit when it publishes the release; it refuses to run if that tag already exists.

**Two trigger routes, because no single one works everywhere.** A phone/cloud session can dispatch the workflow via `gh`/MCP but its git proxy rejects tag pushes; a laptop can push tags over SSH but its `gh` may be authed as an account without repo-admin rights, so `workflow_dispatch` returns `HTTP 403: Must have admin rights`. This skill therefore **tries `workflow_dispatch` first and falls back to a tag push** (step 5), rather than guessing the environment — trying tests the real capability, detection only guesses it. Dispatch is preferred because it creates the tag only after tests+build pass, so a failed build leaves nothing to clean up; the tag-push fallback creates the tag up front and so needs manual cleanup if the build fails.

The target version may be supplied as an argument (e.g. `/cut-release 0.2.0`). If omitted, propose the next patch bump from the current `versionName` and confirm with the user.

Follow these steps:

1. **Preflight.** Confirm the working tree is clean (`git status`) and the current branch is `main` and up to date with `origin/main`. If there are uncommitted changes or the branch is behind/ahead, stop and tell the user — do not release a dirty or diverged tree.
2. **Determine the version.** Read `versionName` / `versionCode` from `player/android/app/build.gradle.kts`. Compute the new `versionName` (from the argument, else next patch) and increment `versionCode` by 1. Verify the tag `android-v<versionName>` does not already exist on the remote (`git ls-remote --tags origin android-v<versionName>`); if it does, stop and ask for a different version.
3. **Show the plan and get approval.** Summarize: old → new `versionName`, old → new `versionCode`, and the tag the release will create (`android-v<versionName>`). Ask for approval before making any changes.
4. **Bump the version.** Edit `player/android/app/build.gradle.kts` to the new `versionName` and `versionCode`. Commit with a message like `Bump Android version to <versionName>` (include the standard `Co-Authored-By` trailer) and push to `main`. Confirm `origin/main` now points at the bump commit.
5. **Start the release.** Try the dispatch route first; fall back to a tag push only if dispatch is unavailable. In both cases the commit to release must already be on `origin/main` (step 4).
   - **Primary — `workflow_dispatch` (preferred; no tag cleanup on failure):**
     - With `gh`: `gh workflow run android-release.yml --ref main`.
     - Without `gh` (e.g. a cloud session): use the GitHub MCP tool `actions_run_trigger` with method `run_workflow`, workflow `android-release.yml`, ref `main`.
     - Here, do NOT create or push the tag yourself — the workflow creates `android-v<versionName>` only after tests and the build pass.
   - **Fallback — tag push (use only when dispatch failed, e.g. `HTTP 403: Must have admin rights`, no `gh`/MCP, or an auth error you can't resolve):** push the tag at the bump commit so the `push: tags: android-v*` trigger fires:
     ```
     git tag android-v<versionName> && git push origin android-v<versionName>
     ```
     Only reach for this after dispatch has actually failed — never as the first move, and never on a phone/cloud session (its git proxy rejects tag pushes, so this will fail too; stay on the dispatch route there). Caveat: this creates the tag BEFORE the build runs, so if the build fails you must delete it (`git push origin :refs/tags/android-v<versionName>` and `git tag -d android-v<versionName>`) before retrying the same version.
6. **Report.** Tell the user the release run has started, which route was used, and link it (`gh run list --workflow=android-release.yml --limit 1`, or the GitHub MCP `actions_list` tool). Once it finishes, share the Release URL so they can download the APK. If the run fails, report the failing step:
   - Dispatch route: the tag was not created on failure, so the same version can be retried after a fix is pushed to `main`.
   - Tag-push route: the tag already exists, so delete it (remote + local, as above) before retrying the same version, or the workflow will refuse the rerun.

Never start a release before the version-bump commit is on `origin/main`. Never overwrite an existing tag — if `android-v<versionName>` already exists on the remote, stop and pick a new version (step 2).
