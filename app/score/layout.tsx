import type { Metadata } from "next";
import "@fontsource/noto-sans-sc/chinese-simplified-400.css";
import "@fontsource/noto-sans-sc/chinese-simplified-700.css";
import "@fontsource/noto-serif-sc/chinese-simplified-600.css";

export const metadata: Metadata = {
  title: "牌桌积分簿｜德州扑克电子记分系统",
  description: "为 3–12 人德州牌局自动计算名次积分、复活扣分和淘汰奖励。",
  openGraph: {
    title: "牌桌积分簿｜德州扑克电子记分系统",
    description: "每一局，都算得清楚。",
    images: [],
  },
  twitter: {
    card: "summary",
    title: "牌桌积分簿｜德州扑克电子记分系统",
    description: "每一局，都算得清楚。",
    images: [],
  },
};

export default function ScoreLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
