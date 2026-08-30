# Poker Lab Android TV

Android TV 遥控器应用。启动后以 1920 × 1080 电视视口全屏运行
`https://tv.example.com/display`。APK 与网页使用同一套 HTML、CSS、字体、状态同步和牌桌控制逻辑，避免维护第二套原生界面造成视觉差异。

## 功能

- 直接渲染定稿 `/display` 页面，视觉与网页保持一致
- 网页更新后 APK 无需重新复制一套布局
- 全屏沉浸显示并保持屏幕常亮
- 3–12 人、L1–L10、名次结算、淘汰加分与复活扣分功能完整保留
- 方向键、确认键、返回键和菜单键映射到网页的电视遥控交互
- 右方向键或菜单键打开牌桌控制，返回键关闭控制面板
- 网络或电脑端服务中断时显示重试页面
- 支持 cpolar HTTP Basic 访问保护；首次打开会提示输入并保存在电视本机

## 构建

APK 支持 Android 5.0（API 21）及以上系统。构建需要 JDK 17、Android SDK 36 和 Android Gradle Plugin 9.2。

```powershell
./gradlew.bat assembleRelease
```

安装包生成在 `app/build/outputs/apk/release/app-release.apk`。

## 电视安装

1. 将 `PokerLab-TV-v2.2.0.apk` 复制到 U 盘。
2. 在电视文件管理器中打开 APK；首次安装时允许该文件管理器安装未知来源应用。
3. 从电视应用列表启动“Poker Lab 牌桌看板”。
4. 如果 cpolar 开启了访问保护，首次启动时输入与浏览器访问网站相同的账号和密码。

应用启动后默认显示实时看板。按右方向键或菜单键打开网页牌桌控制面板；使用方向键移动、确认键选择，返回键关闭控制面板。
