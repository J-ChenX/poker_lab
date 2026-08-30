"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BLIND_LEVELS, knockoutBase, knockoutShare, placementScore, reviveCost, scoringPlaceCount } from "../score/rules";
import styles from "./display.module.css";

export type DisplayPlayer = { name: string; score: number };
export type DisplaySharedState = {
  players: DisplayPlayer[];
  playerCount: number;
  currentLevel: number;
  rankedPlayers: string[];
  version: number;
  initialized: boolean;
};
export type DisplayScoreAction =
  | { type: "setGame"; playerCount: number; currentLevel: number; rankedPlayers: string[] }
  | { type: "addScores"; changes: { name: string; amount: number }[]; clearRanks?: boolean };

type ActionMode = "knockout" | "revive" | null;

const formatNumber = (value: number) => value.toLocaleString("zh-CN");

function RankPlayerSelect({ value, players, unavailableNames, label, disabled, onChange }: {
  value: string;
  players: DisplayPlayer[];
  unavailableNames: Set<string>;
  label: string;
  disabled: boolean;
  onChange: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [open]);

  return <div className={styles.rankPlayerSelect} ref={rootRef}>
    <button className={`${styles.rankSelectTrigger} ${open ? styles.rankSelectTriggerOpen : ""} ${value ? styles.rankSelectTriggerFilled : ""}`} type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onClick={() => setOpen((current) => !current)} onKeyDown={(event) => event.key === "Escape" && setOpen(false)}>
      <span>{value ? <><i>{value.slice(0, 2).toUpperCase()}</i><b>{value}</b></> : <b>{players.length ? "选择牌手" : "暂无牌手"}</b>}</span>
      <em aria-hidden="true">⌄</em>
    </button>
    {open && <div className={styles.rankSelectMenu} role="listbox" aria-label={label} tabIndex={-1} onKeyDown={(event) => event.key === "Escape" && setOpen(false)}>
      {value && <button className={styles.rankClearOption} type="button" onClick={() => { onChange(""); setOpen(false); }}><span>清除选择</span><small>×</small></button>}
      {players.map((player) => {
        const unavailable = unavailableNames.has(player.name);
        const selected = player.name === value;
        return <button className={selected ? styles.rankOptionSelected : ""} type="button" role="option" aria-selected={selected} disabled={unavailable} key={player.name} onClick={() => { onChange(player.name); setOpen(false); }}><i>{player.name.slice(0, 2).toUpperCase()}</i><span><strong>{player.name}</strong><small>{unavailable ? "已用于其他名次" : selected ? "当前选择" : `${player.score > 0 ? "+" : ""}${player.score} 分`}</small></span><b>{selected ? "✓" : ""}</b></button>;
      })}
    </div>}
  </div>;
}

export default function DisplayControlPanel({ state, busy, onClose, onMutate }: {
  state: DisplaySharedState;
  busy: boolean;
  onClose: () => void;
  onMutate: (action: DisplayScoreAction) => Promise<boolean>;
}) {
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [revivePlayer, setRevivePlayer] = useState("");
  const [knockoutWinners, setKnockoutWinners] = useState<string[]>([]);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  useEffect(() => {
    setKnockoutWinners((current) => current.filter((name) => state.players.some((player) => player.name === name)));
    if (revivePlayer && !state.players.some((player) => player.name === revivePlayer)) setRevivePlayer("");
  }, [revivePlayer, state.players]);

  const paidPlaces = scoringPlaceCount(state.playerCount);
  const selectedRanks = state.rankedPlayers.filter(Boolean);
  const currentBlind = BLIND_LEVELS[state.currentLevel - 1] ?? BLIND_LEVELS[0];
  const unitReviveCost = reviveCost(state.playerCount, state.currentLevel);
  const knockoutUnit = knockoutBase(state.playerCount);
  const knockoutPoints = knockoutShare(state.playerCount, knockoutWinners.length || 1);
  const sortedPlayers = useMemo(() => [...state.players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "zh-CN")), [state.players]);

  const updateGame = async (playerCount: number, currentLevel: number, rankedPlayers: string[]) => {
    setNotice("");
    return onMutate({ type: "setGame", playerCount, currentLevel, rankedPlayers });
  };

  const changePlayerCount = (count: number) => {
    const ranks = Array.from({ length: scoringPlaceCount(count) }, () => "");
    void updateGame(count, state.currentLevel, ranks);
  };

  const changeLevel = (level: number) => {
    void updateGame(state.playerCount, level, state.rankedPlayers);
  };

  const changeRank = (index: number, name: string) => {
    const nextRanks = Array.from({ length: paidPlaces }, (_, rank) => rank === index ? name : (state.rankedPlayers[rank] ?? ""));
    void updateGame(state.playerCount, state.currentLevel, nextRanks);
  };

  const settlePlacement = async () => {
    if (state.players.length < paidPlaces) return setNotice(`至少需要 ${paidPlaces} 位牌手才能结算`);
    if (selectedRanks.length !== paidPlaces || new Set(selectedRanks).size !== paidPlaces) return setNotice("请为每个计分名次选择不同的牌手");
    const ok = await onMutate({
      type: "addScores",
      changes: state.rankedPlayers.map((name, index) => ({ name, amount: placementScore(state.playerCount, index + 1) })),
      clearRanks: true,
    });
    if (ok) setNotice("名次积分已结算");
  };

  const toggleKnockoutWinner = (name: string) => {
    setKnockoutWinners((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name]);
  };

  const applyKnockout = async () => {
    if (!knockoutWinners.length) return setNotice("请至少选择一位淘汰得分人员");
    const ok = await onMutate({ type: "addScores", changes: knockoutWinners.map((name) => ({ name, amount: knockoutPoints })) });
    if (ok) {
      setKnockoutWinners([]);
      setActionMode(null);
      setNotice("淘汰积分已记录");
    }
  };

  const applyRevive = async () => {
    if (!revivePlayer) return setNotice("请选择复活人员");
    if (!unitReviveCost) return setNotice("当前人数或等级不可复活");
    const ok = await onMutate({ type: "addScores", changes: [{ name: revivePlayer, amount: -unitReviveCost }] });
    if (ok) {
      setRevivePlayer("");
      setActionMode(null);
      setNotice("复活扣分已记录");
    }
  };

  return <div className={styles.controlBackdrop} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <aside className={styles.controlPanel} role="dialog" aria-modal="true" aria-labelledby="display-control-title">
      <header className={styles.controlHead}>
        <div><small>TABLE CONTROL</small><h2 id="display-control-title">牌桌控制</h2><p>L{state.currentLevel} · {state.playerCount} 人局 · {formatNumber(currentBlind.small)} / {formatNumber(currentBlind.big)}</p></div>
        <button type="button" onClick={onClose} aria-label="关闭牌桌控制">×</button>
      </header>

      <div className={styles.controlBody}>
        {notice && <div className={styles.controlNotice} role="status">{notice}</div>}

        <section className={styles.controlSection}>
          <div className={styles.controlSectionTitle}><strong>本局开始人数</strong></div>
          <div className={styles.compactPicker}>{Array.from({ length: 10 }, (_, index) => index + 3).map((count) => <button className={count === state.playerCount ? styles.controlSelected : ""} type="button" disabled={busy} key={count} onClick={() => changePlayerCount(count)}><b>{count}</b><small>人</small></button>)}</div>
        </section>

        <section className={styles.controlSection}>
          <div className={styles.controlSectionTitle}><strong>当前盲注等级</strong></div>
          <div className={styles.compactLevels}>{BLIND_LEVELS.map((blind) => <button className={blind.level === state.currentLevel ? styles.controlSelected : ""} type="button" disabled={busy} key={blind.level} onClick={() => changeLevel(blind.level)}><b>L{blind.level}</b><span>{formatNumber(blind.small)} / {formatNumber(blind.big)}</span></button>)}</div>
        </section>

        <section className={styles.controlSection}>
          <div className={styles.controlSectionTitle}><strong>计分名次</strong></div>
          <div className={styles.controlRanks}>{Array.from({ length: paidPlaces }, (_, index) => {
            const current = state.rankedPlayers[index] ?? "";
            return <div className={styles.controlRankRow} key={index}><span><i>{index + 1}</i><b>第 {index + 1} 名</b><small>＋{placementScore(state.playerCount, index + 1)} 分</small></span><RankPlayerSelect value={current} players={sortedPlayers} unavailableNames={new Set(selectedRanks.filter((name) => name !== current))} label={`选择第 ${index + 1} 名牌手`} disabled={busy || !state.players.length} onChange={(name) => changeRank(index, name)} /></div>;
          })}</div>
          <button className={styles.settleButton} type="button" disabled={busy || !state.players.length} onClick={settlePlacement}>确认结算名次积分 <span>→</span></button>
        </section>

        <section className={styles.controlSection}>
          <div className={styles.controlSectionTitle}><strong>即时记分</strong><small>操作前选择人员，确认后才会记分</small></div>
          <div className={styles.controlActions}>
            <button className={actionMode === "knockout" ? styles.controlSelected : ""} type="button" disabled={!state.players.length} onClick={() => { setActionMode(actionMode === "knockout" ? null : "knockout"); setNotice(""); }}><i>✦</i><span><b>淘汰加分</b><small>基础 ＋{knockoutUnit} 分</small></span></button>
            <button className={actionMode === "revive" ? styles.controlSelected : ""} type="button" disabled={!state.players.length || !unitReviveCost} onClick={() => { setActionMode(actionMode === "revive" ? null : "revive"); setNotice(""); }}><i>↻</i><span><b>复活扣分</b><small>{unitReviveCost ? `单次 −${unitReviveCost} 分` : "当前不可复活"}</small></span></button>
          </div>

          {actionMode === "knockout" && <div className={styles.actionEditor}><p>选择一位或多位得分人员；多人共同淘汰时，每人获得 ＋{knockoutPoints} 分。</p><div className={styles.playerChips}>{sortedPlayers.map((player) => <button className={knockoutWinners.includes(player.name) ? styles.controlSelected : ""} type="button" disabled={busy} key={player.name} onClick={() => toggleKnockoutWinner(player.name)}><span>{player.name}</span><small>{knockoutWinners.includes(player.name) ? `＋${knockoutPoints}` : "选择"}</small></button>)}</div><button className={styles.actionConfirm} type="button" disabled={busy || !knockoutWinners.length} onClick={applyKnockout}>确认淘汰加分</button></div>}
          {actionMode === "revive" && <div className={styles.actionEditor}><p>L{state.currentLevel} 单次复活扣除 {unitReviveCost} 分，并获得 {formatNumber(currentBlind.chips ?? 0)} 筹码。</p><select aria-label="选择复活人员" value={revivePlayer} disabled={busy} onChange={(event) => setRevivePlayer(event.target.value)}><option value="">选择复活人员</option>{sortedPlayers.map((player) => <option value={player.name} key={player.name}>{player.name}（{player.score} 分）</option>)}</select><button className={styles.actionConfirm} type="button" disabled={busy || !revivePlayer} onClick={applyRevive}>确认一次复活扣分</button></div>}
        </section>
      </div>
    </aside>
  </div>;
}
