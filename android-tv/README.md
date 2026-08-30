# Poker Lab Android TV

Android TV 遥控器应用。启动后全屏打开 `https://tv.example.com/display`，并通过原生控制面板管理同一份牌桌数据。

## 功能

- 全屏实时积分与盲注看板
- 3–12 人开局人数设置
- L1–L10 盲注等级切换
- 名次人员选择与独立确认结算
- 多人共同淘汰加分
- 单人复活扣分
- 可在电视端修改服务器地址
- 支持 cpolar HTTP Basic 访问保护；首次打开会提示输入访问保护账号和密码
- 支持遥控器方向键、确定键和菜单键

## 构建

APK 支持 Android 5.0（API 21）及以上系统。构建需要 JDK 17、Android SDK 36 和 Android Gradle Plugin 9.2。

```powershell
./gradlew.bat assembleDebug
```

安装包生成在 `app/build/outputs/apk/debug/app-debug.apk`。

## 电视安装

1. 将 `PokerLab-TV-v1.0.0.apk` 复制到 U 盘。
2. 在电视文件管理器中打开 APK；首次安装时允许该文件管理器安装未知来源应用。
3. 从电视应用列表启动“Poker Lab 牌桌看板”。
4. 如果 cpolar 开启了访问保护，首次启动时输入与浏览器访问网站相同的账号和密码。

应用启动后默认显示实时看板。使用遥控器选择右上角“牌桌控制”，或按菜单键，可打开原生控制台。返回键关闭控制台并回到看板。
