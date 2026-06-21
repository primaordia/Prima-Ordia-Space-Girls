# Android Release Notes

## Current App

- App name: Fantasy Space Girls
- Package name: com.primaordia.spacegirls
- Version code: 1
- Version name: 1.0

## Build Outputs

Debug APK for local testing:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Google Play Android App Bundle:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

## Private Signing Files

These files are required to make future Google Play updates, but must not be committed to Git:

```text
android/keystores/prima-ordia-upload.jks
android/signing.properties
```

Back them up somewhere private and safe. Losing them can make future app updates difficult.

## Upload

In Google Play Console, create the app and upload the release `.aab` file from the path above.
