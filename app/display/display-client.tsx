"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BLIND_LEVELS, knockoutBase, placementScore, reviveCost, scoringPlaceCount } from "../score/rules";
import DisplayControlPanel, { DisplayScoreAction, DisplaySharedState } from "./control-panel";
import styles from "./display.module.css";

const formatNumber = (value: number) => value.toLocaleString("zh-CN");

export default function DisplayClient({ initialState }: { initialState: DisplaySharedState | null }) {
  const [state, setState] = useState<DisplaySharedState | null>(initialState);
  const [connectionFailed, setConnectionFailed] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [controlOpen, setControlOpen] = useState(false);
  const advanceLevelRef = useRef<HTMLButtonElement>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/score-state", { cache: "no-store" });
      if (!response.ok) throw new Error("读取失败");
      const next = await response.json() as DisplaySharedState;
      setState((current) => !current || next.version >= current.version ? next : current);
      setConnectionFailed(false);
    } catch {
      setConnectionFailed(true);
    }
  }, []);

  useEffect(() => {
    const tvWindow = window as Window & { __pokerLabClientReady?: boolean };
    tvWindow.__pokerLabClientReady = true;
    const initialFrame = window.requestAnimationFrame(() => void refresh());
    const timer = window.setInterval(() => void refresh(), 2000);
    const onVisibilityChange = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.cancelAnimationFrame(initialFrame);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      tvWindow.__pokerLabClientReady = false;
    };
  }, [refresh]);

  useEffect(() => {
    const handleRemoteKey = (event: KeyboardEvent) => {
      if (!state || controlOpen) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setControlOpen(true);
        return;
      }
      if (["ArrowUp", "ArrowDown", "ArrowLeft"].includes(event.key)) {
        event.preventDefault();
        advanceLevelRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleRemoteKey);
    return () => window.removeEventListener("keydown", handleRemoteKey);
  }, [controlOpen, state]);

  const sortedPlayers = useMemo(() => [...(state?.players ?? [])].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "zh-CN")), [state?.players]);
  const playerCount = state?.playerCount ?? 5;
  const currentLevel = state?.currentLevel ?? 1;
  const blind = BLIND_LEVELS[currentLevel - 1] ?? BLIND_LEVELS[0];
  const cost = reviveCost(playerCount, currentLevel);
  const nextBlind = BLIND_LEVELS[currentLevel] ?? null;
  const nextCost = nextBlind ? reviveCost(playerCount, nextBlind.level) : 0;
  const placementValues = Array.from({ length: scoringPlaceCount(playerCount) }, (_, index) => placementScore(playerCount, index + 1));
  const knockoutValue = knockoutBase(playerCount);

  const mutateState = useCallback(async (action: DisplayScoreAction) => {
    if (mutating) return false;
    setMutating(true);
    try {
      const response = await fetch("/api/score-state", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action),
      });
      if (!response.ok) throw new Error("更新失败");
      setState(await response.json() as DisplaySharedState);
      return true;
    } catch {
      return false;
    } finally {
      setMutating(false);
    }
  }, [mutating]);

  const advanceLevel = () => {
    if (!state || state.currentLevel >= BLIND_LEVELS.length || mutating) return;
    void mutateState({ type: "setGame", playerCount: state.playerCount, currentLevel: state.currentLevel + 1, rankedPlayers: state.rankedPlayers });
  };

  const closeControls = useCallback(() => {
    setControlOpen(false);
    window.requestAnimationFrame(() => advanceLevelRef.current?.focus());
  }, []);

  return <main className={`${styles.screen} ${controlOpen ? styles.panelOpen : ""}`} data-score-version={state?.version ?? 0}>
    <header className={styles.header}>
      <div className={styles.brand}><span>♠</span><div><strong>牌桌实时看板</strong><small>POKER TABLE LIVE</small></div></div>
      <div className={styles.headerControls}>
        <button ref={advanceLevelRef} className={styles.advanceLevel} type="button" onClick={advanceLevel} disabled={!state || currentLevel >= BLIND_LEVELS.length || mutating}>
          <span>{currentLevel >= BLIND_LEVELS.length ? "最高等级" : "下一等级"}</span>
          <strong>{currentLevel >= BLIND_LEVELS.length ? "L10" : `L${currentLevel + 1}`}</strong>
          <i aria-hidden="true">→</i>
        </button>
      </div>
    </header>

    <section className={styles.dashboard}>
      <aside className={styles.ranking}>
        <div className={styles.sectionHead}><div><span>01</span><h1>实时积分排名</h1></div><small>{sortedPlayers.length} 位牌手</small></div>
        {!state && <div className={styles.empty}><span>◌</span><strong>{connectionFailed ? "牌桌数据连接失败" : "正在连接牌桌"}</strong><small>{connectionFailed ? "正在自动重试，请检查电脑端服务" : "获取最新积分与盲注信息"}</small></div>}
        {state && sortedPlayers.length === 0 && <div className={styles.empty}><span>♠</span><strong>牌桌正在等待玩家</strong><small>请在手机控制台中添加人员</small></div>}
        <div className={styles.playerList}>{sortedPlayers.map((player, index) => <article className={index < 3 ? styles.leader : ""} key={player.name}>
          <i>{index + 1}</i><span className={styles.avatar}>{player.name.slice(0, 2).toUpperCase()}</span><p><strong>{player.name}</strong><small>{index === 0 ? "当前领先" : "积分账户"}</small></p><b className={player.score < 0 ? styles.negative : ""}>{player.score > 0 ? "+" : ""}{player.score}<small>分</small></b>
        </article>)}</div>
      </aside>

      <section className={styles.gameState} aria-label="当前轮次与盲注信息">
        <div className={styles.levelCard}>
          <div><span>当前轮次</span><small>CURRENT LEVEL</small></div>
          <strong>L{currentLevel}</strong>
          <p className={styles.playerMeta}>
            <span><b>{playerCount}</b> 人开局</span>
            <small><i>名次积分</i>{placementValues.join(" / ")}</small>
            <small><i>淘汰积分</i>＋{knockoutValue}</small>
          </p>
        </div>

        <div className={styles.blindGrid}>
          <article className={styles.smallBlind}><div><span>小盲</span><small>SMALL BLIND</small></div><strong>{formatNumber(blind.small)}</strong><i>SB</i></article>
          <article className={styles.bigBlind}><div><span>大盲</span><small>BIG BLIND</small></div><strong>{formatNumber(blind.big)}</strong><i>BB</i></article>
        </div>

        <div className={styles.reviveCard}>
          <div><span>复活信息</span><small>REVIVAL</small></div>
          <section><span>本轮复活价格</span><strong>{cost ? `−${cost}` : "—"}<small>{cost ? "积分 / 次" : "当前轮次不可复活"}</small></strong><em className={styles.nextRevive}>下一轮 <b>{nextBlind ? nextCost ? `−${nextCost} 分 / 次` : "不可复活" : "已到最高等级"}</b></em></section>
          <section><span>复活筹码</span><strong>{cost && blind.chips ? formatNumber(blind.chips) : "—"}<small>{cost && blind.chips ? "筹码" : "当前轮次不可复活"}</small></strong><em className={styles.nextRevive}>下一轮 <b>{nextBlind ? nextCost && nextBlind.chips ? `${formatNumber(nextBlind.chips)} 筹码` : "不可复活" : "已到最高等级"}</b></em></section>
        </div>
      </section>
    </section>
    {controlOpen && state && <DisplayControlPanel state={state} busy={mutating} onClose={closeControls} onMutate={mutateState} />}
  </main>;
}
