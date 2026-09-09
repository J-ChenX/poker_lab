import java.net.URI

plugins {
    id("com.android.application")
}

// 读取项目根目录中共用的 dotenv 文件，Android 构建无需额外依赖 Node.js。
// 仅读取服务器地址，账号密码等凭据不得写入 BuildConfig。
fun serverUrlFromEnvFile(contents: String): String? {
    val assignment = Regex("""^\s*(?:export\s+)?POKER_SERVER_URL\s*=\s*(?:"([^"]*)"|'([^']*)'|([^#\s]*))\s*(?:#.*)?$""")
    var result: String? = null
    contents.lineSequence().forEach { line ->
        if (Regex("""^\s*(?:export\s+)?POKER_SERVER_URL\s*=""").containsMatchIn(line)) {
            val match = assignment.matchEntire(line)
                ?: throw GradleException("POKER_SERVER_URL 必须是直接填写的单行完整地址")
            result = match.groups[1]?.value ?: match.groups[2]?.value ?: match.groups[3]?.value
        }
    }
    return result
}

val fileServerUrl = listOf(".env", ".env.local").fold("") { previous, name ->
    val contents = providers.fileContents(rootProject.layout.projectDirectory.file("../$name")).asText.orNull
    contents?.let(::serverUrlFromEnvFile) ?: previous
}
val configuredServerUrl = providers.environmentVariable("POKER_SERVER_URL")
    .getOrElse(fileServerUrl).trim().ifEmpty { "https://example.com" }
val serverUri = try {
    URI(configuredServerUrl)
} catch (_: Exception) {
    throw GradleException("POKER_SERVER_URL 必须是 HTTP(S) 根地址，例如 https://poker.example.com")
}
require(serverUri.scheme in listOf("http", "https") && !serverUri.host.isNullOrEmpty()
    && serverUri.rawUserInfo == null && serverUri.rawPath in listOf("", "/")
    && serverUri.rawQuery == null && serverUri.rawFragment == null) {
    "POKER_SERVER_URL 只能包含 HTTP(S) 根地址，不能包含账号密码、路径、查询参数或片段"
}
val defaultServerUrl = serverUri.toASCIIString().removeSuffix("/")

android {
    namespace = "com.pokerlab.tv"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.pokerlab.tv"
        minSdk = 21
        targetSdk = 36
        versionCode = 12
        versionName = "2.7.1"
        buildConfigField("String", "DEFAULT_SERVER_URL", "\"$defaultServerUrl\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // 个人分发版本沿用旧调试包的本地签名，便于电视直接覆盖安装并升级。
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
