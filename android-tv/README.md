# Poker Lab Android TV

Android TV 遥控器应用。启动后按电视真实输出分辨率等比显示与
`https://tv.example.com/display` 目标图对齐的原生看板。布局以 1920 × 1080 为比例基准，可自动适配 4K 输出，并额外采用 1.5 倍电视可读性字号；不再依赖旧电视 WebView 对现代 CSS/React 的支持。

## 功能

- 原生复刻定稿 `/display` 的关闭状态和 32:68 控制面板状态
- 固定结构按屏幕百分比缩放，4K 面板自动使用 2 倍像素尺寸并保持相同视觉比例
- 内置裁剪后的 Noto Serif SC 字体，旧电视也使用相同数字与标题字形
- 全屏沉浸显示并保持屏幕常亮
- 3–12 人、L1–L10、名次结算、淘汰加分与复活扣分由原生控制面板完成
- 下一等级按钮是原生 Android 按钮，方向键和确认键不依赖 WebView 的 JavaScript 激活
- 右方向键或菜单键打开原生牌桌控制，返回键关闭控制面板
- APK 每 2.5 秒原生轮询牌桌状态，电脑或手机端修改后自动刷新看板
- 网络或电脑端服务中断时保留最后一次看板数据并提示连接失败
- 支持 cpolar HTTP Basic 访问保护；首次打开会提示输入并保存在电视本机

## 构建

APK 支持 Android 5.0（API 21）及以上系统。构建需要 JDK 17、Android SDK 36 和 Android Gradle Plugin 9.2。

```powershell
./gradlew.bat assembleRelease
```

安装包生成在 `app/build/outputs/apk/release/app-release.apk`。

## 电视安装

1. 将 `PokerLab-TV-v2.7.0.apk` 复制到 U 盘。
2. 在电视文件管理器中打开 APK；首次安装时允许该文件管理器安装未知来源应用。
3. 从电视应用列表启动“Poker Lab 牌桌看板”。
4. 如果 cpolar 开启了访问保护，首次启动时输入与浏览器访问网站相同的账号和密码。

应用启动后焦点默认位于“下一等级”。按确认键升到下一级；按右方向键或菜单键打开原生牌桌控制面板，使用方向键移动、确认键选择，返回键关闭。

## 旧版 Android TV 回归环境

本机已建立 `poker_tv_api23`（Android TV 6.0 / API 23 / 1920 × 1080）模拟器，用来覆盖 TCL 电视常见的旧 WebView 行为。调试包会连接电脑端 `http://10.0.2.2:3000/display?tvapp=1`。

```powershell
pnpm dev
cd android-tv
./gradlew.bat assembleDebug
adb -s emulator-5556 install -r app/build/outputs/apk/debug/app-debug.apk
adb -s emulator-5556 shell am start -n com.pokerlab.tv/.MainActivity
adb -s emulator-5556 shell input keyevent 23
```

最后一条命令模拟遥控器确认键，可配合 `/api/score-state` 检查等级是否实际更新。
