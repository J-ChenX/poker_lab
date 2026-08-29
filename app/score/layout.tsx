import type { Metadata } from "next";

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
