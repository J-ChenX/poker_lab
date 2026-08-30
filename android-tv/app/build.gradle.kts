plugins {
    id("com.android.application")
}

android {
    namespace = "com.pokerlab.tv"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.pokerlab.tv"
        minSdk = 21
        targetSdk = 36
        versionCode = 5
        versionName = "2.2.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Personal-distribution build: reuse the same local signing identity as the previous
            // debug APK so the television can install this version as an in-place upgrade.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint {
        abortOnError = true
        checkReleaseBuilds = true
    }
}
