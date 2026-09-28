Cut an Android release: bump the version, tag it, and push the tag so CI builds and publishes a signed APK.

Pushing an `android-v*` tag triggers `.github/workflows/android-release.yml`, which runs unit tests, builds a signed release APK, and attaches it to a GitHub Release. This skill prepares and pushes that tag safely.

The target version may be supplied as an argument (e.g. `/cut-release 0.2.0`). If omitted, propose the next patch bump from the current `versionName` and confirm with the user.

Follow these steps:

1. **Preflight.** Confirm the working tree is clean (`git status`) and the current branch is `main` and up to date with `origin/main`. If there are uncommitted changes or the branch is behind/ahead, stop and tell the user — do not tag a dirty or diverged tree.
2. **Determine the version.** Read `versionName` / `versionCode` from `player/android/app/build.gradle.kts`. Compute the new `versionName` (from the argument, else next patch) and increment `versionCode` by 1. Verify the tag `android-v<versionName>` does not already exist (`git tag -l`); if it does, stop and ask for a different version.
3. **Show the plan and get approval.** Summarize: old → new `versionName`, old → new `versionCode`, and the tag to be created (`android-v<versionName>`). Ask for approval before making any changes.
4. **Bump the version.** Edit `player/android/app/build.gradle.kts` to the new `versionName` and `versionCode`. Commit with a message like `Bump Android version to <versionName>` (include the standard `Co-Authored-By` trailer) and push to `main`.
5. **Tag and push.** Create an annotated tag `git tag -a android-v<versionName> -m "Android release <versionName>"` and push it with `git push origin android-v<versionName>`. This is what triggers the release workflow.
6. **Report.** Tell the user the tag was pushed and the release build is running. If `gh` is available, surface the Actions run (`gh run list --workflow=android-release.yml --limit 1`) and the eventual Release URL so they can download the APK.

Never push a tag without pushing the corresponding version-bump commit first, and never overwrite an existing tag.
