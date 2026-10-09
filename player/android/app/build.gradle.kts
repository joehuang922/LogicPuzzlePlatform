import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
}

val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

// The player API base URL. Defaults to the production API Gateway stage; can be overridden
// via local.properties (e.g. to point at a dev stack) without touching source.
val apiBaseUrl: String = System.getenv("API_BASE_URL")
    ?: localProps.getProperty("API_BASE_URL")
    ?: "https://ff24npl9f3.execute-api.ap-northeast-1.amazonaws.com/prod"

// Release signing. Values come from env vars in CI or local.properties on a dev machine.
// If no keystore is configured, the release build stays unsigned (debug builds are unaffected),
// so the project still builds for anyone without the key.
fun signingProp(name: String): String? =
    System.getenv(name) ?: localProps.getProperty(name)

val releaseStoreFile: String? = signingProp("RELEASE_STORE_FILE")

android {
    namespace = "com.puzzleplatform.player"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.puzzleplatform.player"
        minSdk = 26
        targetSdk = 35
        versionCode = 15
        versionName = "0.11.1"

        // Expose the API base URL to code as BuildConfig.API_BASE_URL
        buildConfigField("String", "API_BASE_URL", "\"$apiBaseUrl\"")
    }

    signingConfigs {
        // A single, stable release key used for every distributed APK. Keeping the same key
        // across builds is what lets a new APK install *over* the old one without an uninstall.
        if (releaseStoreFile != null) {
            create("release") {
                storeFile = rootProject.file(releaseStoreFile)
                storePassword = signingProp("RELEASE_STORE_PASSWORD")
                keyAlias = signingProp("RELEASE_KEY_ALIAS")
                keyPassword = signingProp("RELEASE_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Only attach the signing config when a keystore was provided.
            signingConfig = signingConfigs.findByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    val composeBom = platform(libs.androidx.compose.bom)
    implementation(composeBom)

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)

    // Compose UI
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    debugImplementation(libs.androidx.compose.ui.tooling)

    // Navigation
    implementation(libs.androidx.navigation.compose)

    // Image loading (collection cover images served from CloudFront)
    implementation(libs.coil.compose)

    // Networking + JSON
    implementation(libs.retrofit)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging.interceptor)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.retrofit.kotlinx.serialization.converter)

    // Coroutines
    implementation(libs.kotlinx.coroutines.android)

    // Local persistence (offline-first) + background sync
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)
    implementation(libs.androidx.work.runtime.ktx)

    // Unit tests (JVM, no emulator; no mocking lib — pure logic like the reference project)
    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.androidx.room.testing)
}
