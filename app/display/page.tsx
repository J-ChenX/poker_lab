"use client";

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
  const [advancing, setAdvancing] = useState(false);

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
  const cost = reviveCost(playerCount, currentLevel);

  const advanceLevel = async () => {
    if (!state || state.currentLevel >= BLIND_LEVELS.length || advancing) return;
    setAdvancing(true);
    try {
      const response = await fetch("/api/score-state", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "setGame",
          playerCount: state.playerCount,
          currentLevel: state.currentLevel + 1,
          rankedPlayers: state.rankedPlayers,
        }),
      });
      if (!response.ok) throw new Error("更新失败");
      setState(await response.json() as SharedState);
      setConnected(true);
    } catch {
      setConnected(false);
    } finally {
      setAdvancing(false);
    }
  };

  return <main className={styles.screen}>
    <header className={styles.header}>
      <div className={styles.brand}><span>♠</span><div><strong>牌桌实时看板</strong><small>POKER TABLE LIVE</small></div></div>
      <div className={styles.connection}><i className={connected ? styles.online : styles.offline} /><span>{connected ? "与手机同步中" : "等待网络恢复"}</span></div>
      <button className={styles.advanceLevel} type="button" onClick={advanceLevel} disabled={!state || currentLevel >= BLIND_LEVELS.length || advancing}>
        <span>{currentLevel >= BLIND_LEVELS.length ? "最高等级" : "下一等级"}</span>
        <strong>{currentLevel >= BLIND_LEVELS.length ? "L10" : `L${currentLevel + 1}`}</strong>
        <i aria-hidden="true">→</i>
      </button>
    </header>

    <section className={styles.dashboard}>
      <aside className={styles.ranking}>
        <div className={styles.sectionHead}><div><span>01</span><h1>实时积分排名</h1></div><small>{sortedPlayers.length} 位牌手</small></div>
        {!state && <div className={styles.empty}><span>◌</span><strong>正在连接牌桌</strong><small>获取最新积分与盲注信息</small></div>}
        {state && sortedPlayers.length === 0 && <div className={styles.empty}><span>♠</span><strong>牌桌正在等待玩家</strong><small>请在手机控制台中添加人员</small></div>}
        <div className={styles.playerList}>{sortedPlayers.map((player, index) => <article className={index < 3 ? styles.leader : ""} key={player.name}>
          <i>{index + 1}</i><span className={styles.avatar}>{player.name.slice(0, 2).toUpperCase()}</span><p><strong>{player.name}</strong><small>{index === 0 ? "当前领先" : "积分账户"}</small></p><b className={player.score < 0 ? styles.negative : ""}>{player.score > 0 ? "+" : ""}{player.score}<small>分</small></b>
        </article>)}</div>
      </aside>

      <section className={styles.gameState} aria-label="当前轮次与盲注信息">
        <div className={styles.levelCard}>
          <div><span>当前轮次</span><small>CURRENT LEVEL</small></div>
          <strong>L{currentLevel}</strong>
          <p><b>{playerCount}</b> 人开局</p>
        </div>

        <div className={styles.blindGrid}>
          <article className={styles.smallBlind}><div><span>小盲</span><small>SMALL BLIND</small></div><strong>{formatNumber(blind.small)}</strong><i>SB</i></article>
          <article className={styles.bigBlind}><div><span>大盲</span><small>BIG BLIND</small></div><strong>{formatNumber(blind.big)}</strong><i>BB</i></article>
        </div>

        <div className={styles.reviveCard}>
          <div><span>复活信息</span><small>REVIVAL</small></div>
          <section><span>本轮复活价格</span><strong>{cost ? `−${cost}` : "—"}<small>{cost ? "积分 / 次" : "当前轮次不可复活"}</small></strong></section>
          <section><span>复活筹码</span><strong>{cost && blind.chips ? formatNumber(blind.chips) : "—"}<small>{cost && blind.chips ? "筹码" : "当前轮次不可复活"}</small></strong></section>
        </div>
      </section>
    </section>
  </main>;
}
