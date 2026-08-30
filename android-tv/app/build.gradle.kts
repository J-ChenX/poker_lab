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
        versionCode = 1
        versionName = "1.0.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
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
