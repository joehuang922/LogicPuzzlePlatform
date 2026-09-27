# Logic Puzzle Player — Android

Native Android player client for the LogicPuzzlePlatform. Compose + MVVM, talks to
the same serverless API as `player/frontend`. No auth (hardcoded `PLAYER_ID = 1`,
matching the web client). v1 plays **Sudoku** (puzzle type 1); other types are
listed but open an "unsupported in this version" screen. See
[`../../ .claude/plans`](../../) history / `puzzle/PuzzleEngine.kt` for how to add types.

## Build & run

Requires JDK 21 (Gradle 8.11.1 can't run on newer JDKs) and the Android SDK.

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
export ANDROID_HOME=$HOME/Library/Android/sdk

./gradlew test          # unit tests (SudokuEngine + deserializers)
./gradlew assembleDebug # build APK
./gradlew installDebug  # install on a running emulator/device
```

`local.properties` (git-ignored) must contain `sdk.dir=...`. The API base URL
defaults to the prod API Gateway stage; override with `API_BASE_URL` in
`local.properties` or as an env var.

## Cold starts

The backend is Aurora Serverless v2 and scales to zero, so the **first request
after idle can take 10–25s** (or briefly return `504`). `RetryInterceptor`
retries `502/503/504` + network errors with exponential backoff — just wait; it
recovers automatically. This is expected, not a bug.

## Behind a corporate TLS proxy (e.g. Netskope)

If your machine routes HTTPS through a TLS-inspecting proxy, the emulator won't
trust the proxy's CA and every API call fails with
`SSLHandshakeException: Unacceptable certificate`. Your browser works because the
OS trusts the CA; the emulator has its own trust store.

Fix (debug builds only — these files are git-ignored, so set them up locally):

1. Export your proxy CA (adjust the common-name match):
   ```bash
   security find-certificate -a -c "caadmin.netskope.com" -p /Library/Keychains/System.keychain \
     > app/src/debug/res/raw/proxy_ca.pem
   ```
2. Create `app/src/debug/res/xml/network_security_config.xml` with a `<base-config>`
   whose `<trust-anchors>` list both `<certificates src="system" />` and
   `<certificates src="@raw/proxy_ca" />`.
3. Create `app/src/debug/AndroidManifest.xml` setting
   `android:networkSecurityConfig="@xml/network_security_config"` on `<application>`.

These live under `src/debug`, so the **release build is never affected** and keeps
normal certificate validation.

## Release / CI

Tag-triggered GitHub Actions build at `.github/workflows/android-release.yml`
(repo root). Push an `android-v*` tag (e.g. `android-v0.1.0`) to build a signed
release APK and attach it to a GitHub Release. Requires these repo secrets:
`RELEASE_KEYSTORE_BASE64`, `RELEASE_STORE_PASSWORD`, `RELEASE_KEY_ALIAS`,
`RELEASE_KEY_PASSWORD`. Without a keystore the release build stays unsigned; debug
builds are unaffected.
