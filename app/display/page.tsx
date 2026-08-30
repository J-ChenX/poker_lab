"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BLIND_LEVELS, reviveCost } from "../score/rules";
import styles from "./display.module.css";

type Player = { name: string; score: number };
type SharedState = {
  players: Player[];
  playerCount: number;
  currentLevel: number;
  rankedPlayers: string[];
  version: number;
  initialized: boolean;
};

const formatNumber = (value: number) => value.toLocaleString("zh-CN");

export default function DisplayPage() {
  const [state, setState] = useState<SharedState | null>(null);
  const [connected, setConnected] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/score-state", { cache: "no-store" });
      if (!response.ok) throw new Error("读取失败");
      const next = await response.json() as SharedState;
      setState((current) => !current || next.version >= current.version ? next : current);
      setConnected(true);
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2000);
    const onVisibilityChange = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refresh]);

  const sortedPlayers = useMemo(() => [...(state?.players ?? [])].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "zh-CN")), [state?.players]);
  const playerCount = state?.playerCount ?? 5;
  const currentLevel = state?.currentLevel ?? 1;
  const blind = BLIND_LEVELS[currentLevel - 1] ?? BLIND_LEVELS[0];
  const nextBlind = BLIND_LEVELS[currentLevel] ?? null;
  const cost = reviveCost(playerCount, currentLevel);

  const enterFullscreen = async () => {
    try { await document.documentElement.requestFullscreen(); } catch { /* 浏览器可能已处于接收器全屏 */ }
  };

  return <main className={styles.screen}>
    <header className={styles.header}>
      <div className={styles.brand}><span>♠</span><div><strong>牌桌实时看板</strong><small>POKER TABLE LIVE</small></div></div>
      <div className={styles.connection}><i className={connected ? styles.online : styles.offline} /><span>{connected ? "与手机同步中" : "等待网络恢复"}</span></div>
      <div className={styles.actions}><Link href="/">返回控制台</Link><button type="button" onClick={enterFullscreen}>全屏显示</button></div>
    </header>

    <section className={styles.blinds} aria-label="当前牌局状态">
      <div className={styles.level}><span>当前轮次</span><strong>L{currentLevel}</strong><small>{playerCount} 人开局</small></div>
      <div><span>小盲</span><strong>{formatNumber(blind.small)}</strong><small>SMALL BLIND</small></div>
      <div><span>大盲</span><strong>{formatNumber(blind.big)}</strong><small>BIG BLIND</small></div>
      <div><span>复活价格</span><strong>{cost ? `−${cost}` : "—"}</strong><small>{cost ? "积分 / 次" : "当前不可复活"}</small></div>
      <div><span>下一轮</span><strong>{nextBlind ? `${formatNumber(nextBlind.small)} / ${formatNumber(nextBlind.big)}` : "终局"}</strong><small>{nextBlind ? `L${nextBlind.level}` : "FINAL LEVEL"}</small></div>
    </section>

    <section className={styles.content}>
      <div className={styles.ranking}>
        <div className={styles.sectionHead}><div><span>01</span><h1>实时积分排名</h1></div><small>{sortedPlayers.length} 位牌手</small></div>
        {!state && <div className={styles.empty}><span>◌</span><strong>正在连接牌桌</strong><small>获取最新积分与盲注信息</small></div>}
        {state && sortedPlayers.length === 0 && <div className={styles.empty}><span>♠</span><strong>牌桌正在等待玩家</strong><small>请在手机控制台中添加人员</small></div>}
        <div className={styles.playerGrid}>{sortedPlayers.map((player, index) => <article className={index < 3 ? styles.leader : ""} key={player.name}>
          <i>{index + 1}</i><span className={styles.avatar}>{player.name.slice(0, 2).toUpperCase()}</span><p><strong>{player.name}</strong><small>{index === 0 ? "当前领先" : "积分账户"}</small></p><b className={player.score < 0 ? styles.negative : ""}>{player.score > 0 ? "+" : ""}{player.score}<small>分</small></b>
        </article>)}</div>
      </div>

      <aside className={styles.placements}>
        <div className={styles.sectionHead}><div><span>02</span><h2>本局名次</h2></div></div>
        <div className={styles.placeList}>{(state?.rankedPlayers ?? []).map((name, index) => <div key={index} className={name ? styles.placeFilled : ""}><i>{index + 1}</i><span><strong>第 {index + 1} 名</strong><small>{name || "等待结算"}</small></span><b>{name ? "✓" : "—"}</b></div>)}</div>
        <p>手机端的每次操作都会自动同步到这里。电视看板仅展示，不会修改牌局数据。</p>
      </aside>
    </section>
  </main>;
}
