plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// The phone UI and the car map are the shared web app in ../simulator, bundled as assets.
val copyWeb by tasks.registering(Sync::class) {
    from("../../simulator") {
        include("index.html", "app/**", "core/**", "data/**")
    }
    into(layout.buildDirectory.dir("generated/webassets/web"))
}

android {
    namespace = "com.faradaymicrosystems.cybernav"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.faradaymicrosystems.cybernav"
        minSdk = 26
        targetSdk = 35
        versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        versionName = "0.1." + (System.getenv("GITHUB_RUN_NUMBER") ?: "0")
    }

    signingConfigs {
        // Fixed throwaway debug key so every CI build installs over the previous one.
        getByName("debug") {
            storeFile = rootProject.file("debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    buildTypes {
        getByName("debug") { signingConfig = signingConfigs.getByName("debug") }
    }

    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/webassets"))

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    lint { abortOnError = false }
}

tasks.named("preBuild") { dependsOn(copyWeb) }

dependencies {
    implementation("androidx.car.app:app:1.4.0")
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.activity:activity-ktx:1.9.3")
}
