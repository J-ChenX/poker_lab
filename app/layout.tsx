import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "@fontsource/noto-sans-sc/chinese-simplified-400.css";
import "@fontsource/noto-sans-sc/chinese-simplified-700.css";
import "@fontsource/noto-serif-sc/chinese-simplified-600.css";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://site.example.com"),
  title: "牌桌积分簿｜德州扑克电子记分系统",
  description: "为 3–12 人德州牌局自动计算名次积分、复活扣分和淘汰奖励。",
  openGraph: {
    title: "牌桌积分簿｜德州扑克电子记分系统",
    description: "每一局，都算得清楚。",
    type: "website",
    images: [],
  },
  twitter: {
    card: "summary",
    title: "牌桌积分簿｜德州扑克电子记分系统",
    description: "每一局，都算得清楚。",
    images: [],
  },
  icons: {
    icon: [{ url: "/favicon.svg?v=2", type: "image/svg+xml" }],
    shortcut: "/favicon.svg?v=2",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f3f0e7",
};

const legacyTvBootstrap = `
(function () {
  if (typeof window.globalThis === "undefined") window.globalThis = window;
  if (!String.prototype.replaceAll) {
    String.prototype.replaceAll = function (search, replacement) {
      if (search instanceof RegExp) return this.replace(search, replacement);
      return this.split(search).join(replacement);
    };
  }
  if (window.Promise && !Promise.prototype.finally) {
    Promise.prototype.finally = function (callback) {
      var P = this.constructor;
      return this.then(
        function (value) { return P.resolve(callback()).then(function () { return value; }); },
        function (reason) { return P.resolve(callback()).then(function () { throw reason; }); }
      );
    };
  }
  if (/(?:^|[?&])tvapp=1(?:&|$)/.test(window.location.search)) {
    document.documentElement.setAttribute("data-tv-app", "1");
    var meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "viewport";
      document.head.appendChild(meta);
    }
    meta.content = "width=1920,user-scalable=no,viewport-fit=cover";
    window.addEventListener("load", function () {
      window.setInterval(function () {
        if (window.__pokerLabClientReady) return;
        var root = document.querySelector("[data-score-version]");
        if (!root) return;
        var request = new XMLHttpRequest();
        request.open("GET", "/api/score-state?legacy=" + Date.now(), true);
        request.onreadystatechange = function () {
          if (request.readyState !== 4 || request.status !== 200) return;
          try {
            var next = JSON.parse(request.responseText);
            var current = Number(root.getAttribute("data-score-version") || 0);
            if (Number(next.version || 0) > current) window.location.reload();
          } catch (error) {}
        };
        request.send();
      }, 3000);
    });
  }
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <script dangerouslySetInnerHTML={{ __html: legacyTvBootstrap }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
