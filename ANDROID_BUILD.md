# Building Graphene PA for GrapheneOS

This guide covers building and packaging the Graphene PA web app as a native Android app for GrapheneOS.

## Prerequisites

1. **Android Studio** (latest version)
   - Download from https://developer.android.com/studio

2. **Java Development Kit (JDK) 11+**
   - Usually comes with Android Studio

3. **GrapheneOS device or emulator**
   - For testing the app

## Project Setup

### 1. Create Android Project Structure

```bash
# From the root Graphene-PA directory
mkdir -p android/app/src/main/java/com/graphenepa/app
mkdir -p android/app/src/main/res/layout
mkdir -p android/app/src/main/res/values
mkdir -p android/app/src/main/res/mipmap-nodpi
mkdir -p gradle/wrapper
```

### 2. Copy Source Files

The following files are provided in the `android/` directory:
- `android/build.gradle` — root build configuration
- `android/app/build.gradle` — app build configuration
- `android/settings.gradle` — gradle settings
- `android/app/src/main/AndroidManifest.xml` — app manifest
- `android/app/src/main/java/com/graphenepa/app/MainActivity.java` — main activity
- `android/app/src/main/res/layout/activity_main.xml` — layout
- `android/app/src/main/res/values/strings.xml` — strings
- `android/app/src/main/res/values/themes.xml` — themes
- `android/proguard-rules.pro` — minification rules

### 3. Create Root build.gradle

`android/build.gradle`:
```gradle
plugins {
    id 'com.android.application' version '8.1.0' apply false
}

task clean(type: Delete) {
    delete rootProject.buildDir
}
```

### 4. Gradle Wrapper

Create `android/gradle/wrapper/gradle-wrapper.properties`:
```properties
distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\://services.gradle.org/distributions/gradle-8.4-bin.zip
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
```

## Building the App

### 1. Open in Android Studio

```bash
# Open the android directory as a project
open -a "Android Studio" android/
```

Or use File → Open → select `android/` directory

### 2. Wait for Gradle Sync

Android Studio will download dependencies and sync the project.

### 3. Run on Emulator or Device

```bash
# Using Android Studio:
# Run → Run 'app'

# Or from command line:
cd android
./gradlew installDebug
```

### 4. Build Release APK

```bash
cd android
./gradlew assembleRelease
```

The APK will be located at: `android/app/build/outputs/apk/release/app-release.apk`

## Server Configuration

The app connects to a local Node.js server at `http://localhost:3000`. 

### On Device/Emulator

Ensure the backend server is running and accessible:

```bash
# From the root directory
npm start
```

For physical devices on the same network, update `MainActivity.java`:
```java
private static final String LOCAL_SERVER = "http://YOUR_COMPUTER_IP:3000";
```

For GrapheneOS devices, you'll need to run the Node.js server on the device itself or expose it over the network.

## For F-Droid Distribution

To publish on F-Droid for GrapheneOS:

1. **Prepare Release**
   ```bash
   cd android
   ./gradlew bundleRelease
   ```

2. **Sign APK**
   - Generate signing key in Android Studio
   - Sign the APK

3. **Submit to F-Droid**
   - Fork https://gitlab.com/fdroid/fdroiddata
   - Add metadata in `metadata/com.graphenepa.app.yml`
   - Submit merge request

## Key Security Features

- ✅ No cleartext traffic (HTTPS only after network setup)
- ✅ JavaScript interface locked down
- ✅ File access disabled
- ✅ Geolocation disabled
- ✅ Content access restricted
- ✅ Minimal permissions (internet only)
- ✅ Compatible with GrapheneOS restricted storage access

## Optional: SMS Integration

To enable SMS access, uncomment permissions in `AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.READ_SMS" />
<uses-permission android:name="android.permission.SEND_SMS" />
```

## Troubleshooting

### App won't connect to server

- Check that `npm start` is running
- Verify the server IP/port in `MainActivity.java`
- For emulator: use `10.0.2.2:3000` instead of `localhost:3000`
- For physical device: use the computer's local IP (e.g., `192.168.1.x`)

### Gradle build fails

- Run `./gradlew clean`
- Delete `.gradle` folder
- Invalidate Android Studio caches (File → Invalidate Caches)

### WebView crashes

- Ensure system WebView is up to date
- Check app minSdk/targetSdk version compatibility

## Development Workflow

1. **Make changes to web code**
   ```bash
   # Edit files in root directory (HTML, CSS, JS)
   ```

2. **Test in browser**
   ```bash
   npm start
   # Open http://localhost:3000 in browser
   ```

3. **Build and deploy to device**
   ```bash
   cd android
   ./gradlew installDebug
   ```

4. **Iterate until satisfied**

## Next Steps

- Integrate real Tutanota SDK
- Add Twilio SMS integration
- Set up CI/CD for automated builds
- Configure app signing for F-Droid
- Add app icon and branding assets
