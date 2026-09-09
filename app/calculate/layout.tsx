import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Poker Lab · 德州扑克胜率计算器",
  description: "即时数学模型估算结合 50 万次蒙特卡洛校正，计算德州扑克多人胜率、分池权益和牌型概率。",
  openGraph: {
    title: "Poker Lab · 德州扑克胜率计算器",
    description: "先即时估算，再以 50 万次多人蒙特卡洛校正胜率、底池权益和牌型分布。",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Poker Lab 德州扑克胜率计算器" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Poker Lab · 德州扑克胜率计算器",
    description: "先即时估算，再以 50 万次多人蒙特卡洛校正胜率、底池权益和牌型分布。",
    images: ["/og.png"],
  },
};

export default function CalculateLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
