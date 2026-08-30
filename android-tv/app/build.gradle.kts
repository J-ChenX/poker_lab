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
        versionCode = 7
        versionName = "2.4.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Personal-distribution build: reuse the same local signing identity as the previous
            // debug APK so the television can install this version as an in-place upgrade.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    buildFeatures {
        buildConfig = true
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
