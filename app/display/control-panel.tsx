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
type RemoteDirection = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

const formatNumber = (value: number) => value.toLocaleString("zh-CN");
const remoteFocusableSelector = "button:not(:disabled), select:not(:disabled), [tabindex='0']";
const noUnavailablePlayers = new Set<string>();

function getRemoteFocusable(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(remoteFocusableSelector)).filter((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && window.getComputedStyle(element).visibility !== "hidden";
  });
}

function moveRemoteFocus(container: HTMLElement, direction: RemoteDirection) {
  const focusable = getRemoteFocusable(container);
  if (!focusable.length) return false;

  const active = document.activeElement instanceof HTMLElement && container.contains(document.activeElement)
    ? document.activeElement
    : null;
  if (!active) {
    focusable[0].focus();
    return true;
  }

  const source = active.getBoundingClientRect();
  const sourceX = source.left + source.width / 2;
  const sourceY = source.top + source.height / 2;
  const horizontal = direction === "ArrowLeft" || direction === "ArrowRight";
  const sign = direction === "ArrowLeft" || direction === "ArrowUp" ? -1 : 1;
  let target: HTMLElement | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of focusable) {
    if (candidate === active) continue;
    const rect = candidate.getBoundingClientRect();
    const deltaX = rect.left + rect.width / 2 - sourceX;
    const deltaY = rect.top + rect.height / 2 - sourceY;
    const primary = (horizontal ? deltaX : deltaY) * sign;
    if (primary <= 2) continue;
    const secondary = Math.abs(horizontal ? deltaY : deltaX);
    const score = primary + secondary * 1.8;
    if (score < bestScore) {
      bestScore = score;
      target = candidate;
    }
  }

  if (!target) return false;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  return true;
}

function RankPlayerSelect({ value, players, unavailableNames, label, placeholder = "选择牌手", remoteTarget, remoteKey, disabled, onChange }: {
  value: string;
  players: DisplayPlayer[];
  unavailableNames: Set<string>;
  label: string;
  placeholder?: string;
  remoteTarget?: "rank" | "revive";
  remoteKey?: string;
  disabled: boolean;
  onChange: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => menuRef.current?.querySelector<HTMLElement>(remoteFocusableSelector)?.focus());
  }, [open]);

  return <div className={styles.rankPlayerSelect} ref={rootRef}>
    <button ref={triggerRef} data-tv-target={remoteTarget} data-tv-key={remoteKey} className={`${styles.rankSelectTrigger} ${open ? styles.rankSelectTriggerOpen : ""} ${value ? styles.rankSelectTriggerFilled : ""}`} type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onClick={() => setOpen((current) => !current)} onKeyDown={(event) => {
      if (event.key === "Escape" && open) {
        event.stopPropagation();
        closeMenu();
      }
    }}>
      <span>{value ? <><i>{value.slice(0, 2).toUpperCase()}</i><b>{value}</b></> : <b>{players.length ? placeholder : "暂无牌手"}</b>}</span>
      <em aria-hidden="true">⌄</em>
    </button>
    {open && <div ref={menuRef} className={styles.rankSelectMenu} role="listbox" aria-label={label} tabIndex={-1} onKeyDown={(event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeMenu();
        return;
      }
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        const options = Array.from(menuRef.current?.querySelectorAll<HTMLElement>(remoteFocusableSelector) ?? []);
        if (!options.length) return;
        const currentIndex = options.indexOf(document.activeElement as HTMLElement);
        const step = event.key === "ArrowDown" ? 1 : -1;
        const nextIndex = Math.min(options.length - 1, Math.max(0, currentIndex + step));
        options[nextIndex].focus({ preventScroll: true });
        options[nextIndex].scrollIntoView({ block: "nearest" });
      }
    }}>
      {value && <button className={styles.rankClearOption} type="button" onClick={() => { onChange(""); closeMenu(); }}><span>清除选择</span><small>×</small></button>}
      {players.map((player) => {
        const unavailable = unavailableNames.has(player.name);
        const selected = player.name === value;
        return <button className={selected ? styles.rankOptionSelected : ""} type="button" role="option" aria-selected={selected} disabled={unavailable} key={player.name} onClick={() => { onChange(player.name); closeMenu(); }}><i>{player.name.slice(0, 2).toUpperCase()}</i><span><strong>{player.name}</strong><small>{unavailable ? "已用于其他名次" : selected ? "当前选择" : `${player.score > 0 ? "+" : ""}${player.score} 分`}</small></span><b>{selected ? "✓" : ""}</b></button>;
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
  const panelRef = useRef<HTMLElement>(null);
  const lastRemoteFocusRef = useRef<{ key?: string; index: number }>({ index: 0 });

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
    window.requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>(`.${styles.controlSelected}`)?.focus());
  }, []);

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

  useEffect(() => {
    if (busy) return;
    const frame = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const active = document.activeElement;
      if (active instanceof HTMLElement && panel.contains(active) && !active.matches(":disabled")) return;
      const focusable = getRemoteFocusable(panel);
      if (!focusable.length) return;
      const remembered = lastRemoteFocusRef.current;
      const keyedTarget = remembered.key ? focusable.find((element) => element.dataset.tvKey === remembered.key) : null;
      const target = keyedTarget ?? focusable[Math.min(Math.max(remembered.index, 0), focusable.length - 1)];
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [actionMode, busy, paidPlaces, state.version]);

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
    <aside ref={panelRef} className={styles.controlPanel} role="dialog" aria-modal="true" aria-labelledby="display-control-title" onKeyDown={(event) => {
      if (event.key === "Escape") return onClose();
      const active = document.activeElement;
      if (event.key === "Enter" && active instanceof HTMLButtonElement && panelRef.current?.contains(active)) {
        event.preventDefault();
        const focusable = getRemoteFocusable(panelRef.current);
        const owner = active.dataset.tvKey
          ? active
          : active.closest(`.${styles.rankPlayerSelect}`)?.querySelector<HTMLElement>("[data-tv-key]") ?? active;
        lastRemoteFocusRef.current = { key: owner.dataset.tvKey, index: Math.max(0, focusable.indexOf(owner)) };
        active.click();
        return;
      }
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
      if (active instanceof HTMLSelectElement) return;
      event.preventDefault();
      if (!panelRef.current) return;
      if (event.key === "ArrowRight" && active instanceof HTMLElement && active.dataset.tvKey === "action-knockout") {
        const reviveAction = panelRef.current.querySelector<HTMLElement>("[data-tv-key='action-revive']:not(:disabled)");
        if (reviveAction) {
          reviveAction.focus({ preventScroll: true });
          return;
        }
      }
      if (event.key === "ArrowLeft" && active instanceof HTMLElement && active.dataset.tvKey === "action-revive") {
        const knockoutAction = panelRef.current.querySelector<HTMLElement>("[data-tv-key='action-knockout']:not(:disabled)");
        if (knockoutAction) {
          knockoutAction.focus({ preventScroll: true });
          return;
        }
      }
      if (event.key === "ArrowDown" && active instanceof HTMLElement && Number(active.dataset.tvLevel) >= 6) {
        const firstRank = panelRef.current.querySelector<HTMLElement>("[data-tv-target='rank']:not(:disabled)");
        if (firstRank) {
          firstRank.focus({ preventScroll: true });
          firstRank.scrollIntoView({ block: "nearest", behavior: "smooth" });
          return;
        }
      }
      const moved = moveRemoteFocus(panelRef.current, event.key as RemoteDirection);
      if (!moved && event.key === "ArrowLeft") onClose();
    }}>
      <header className={styles.controlHead}>
        <div><h2 id="display-control-title">牌桌控制</h2></div>
      </header>

      <div className={styles.controlBody}>
        {notice && <div className={styles.controlNotice} role="status">{notice}</div>}

        <section className={styles.controlSection}>
          <div className={styles.controlSectionTitle}><strong>本局开始人数</strong></div>
          <div className={styles.compactPicker}>{Array.from({ length: 10 }, (_, index) => index + 3).map((count) => <button data-tv-key={`player-count-${count}`} className={count === state.playerCount ? styles.controlSelected : ""} type="button" disabled={busy} key={count} onClick={() => changePlayerCount(count)}><b>{count}</b><small>人</small></button>)}</div>
        </section>

        <section className={styles.controlSection}>
          <div className={styles.controlSectionTitle}><strong>当前盲注等级</strong></div>
          <div className={styles.compactLevels}>{BLIND_LEVELS.map((blind) => {
            const levelReviveCost = reviveCost(state.playerCount, blind.level);
            return <button data-tv-level={blind.level} data-tv-key={`level-${blind.level}`} className={blind.level === state.currentLevel ? styles.controlSelected : ""} type="button" disabled={busy} key={blind.level} onClick={() => changeLevel(blind.level)}>
              <b>L{blind.level}</b>
              <span>{formatNumber(blind.small)} / {formatNumber(blind.big)}</span>
              <em className={styles.levelReviveCost}>{levelReviveCost && blind.chips ? `${levelReviveCost}/${blind.chips}` : "—/—"}</em>
            </button>;
          })}</div>
        </section>

        <section className={styles.controlSection}>
          <div className={styles.controlSectionTitle}><strong>计分名次</strong></div>
          <div className={styles.controlRanks}>{Array.from({ length: paidPlaces }, (_, index) => {
            const current = state.rankedPlayers[index] ?? "";
            return <div className={styles.controlRankRow} key={index}><span><i>{index + 1}</i><b>第 {index + 1} 名</b><small>＋{placementScore(state.playerCount, index + 1)} 分</small></span><RankPlayerSelect value={current} players={sortedPlayers} unavailableNames={new Set(selectedRanks.filter((name) => name !== current))} label={`选择第 ${index + 1} 名牌手`} remoteTarget="rank" remoteKey={`rank-${index + 1}`} disabled={busy || !state.players.length} onChange={(name) => changeRank(index, name)} /></div>;
          })}</div>
          <button data-tv-key="settle-ranks" className={styles.settleButton} type="button" disabled={busy || !state.players.length} onClick={settlePlacement}>确认结算名次积分 <span>→</span></button>
        </section>

        <section className={styles.controlSection}>
          <div className={styles.controlSectionTitle}><strong>即时记分</strong><small>操作前选择人员，确认后才会记分</small></div>
          <div className={styles.controlActions}>
            <button data-tv-key="action-knockout" className={actionMode === "knockout" ? styles.controlSelected : ""} type="button" disabled={!state.players.length} onClick={() => { setActionMode(actionMode === "knockout" ? null : "knockout"); setNotice(""); }}><i>✦</i><span><b>淘汰加分</b><small>基础 ＋{knockoutUnit} 分</small></span></button>
            <button data-tv-key="action-revive" className={actionMode === "revive" ? styles.controlSelected : ""} type="button" disabled={!state.players.length || !unitReviveCost} onClick={() => { setActionMode(actionMode === "revive" ? null : "revive"); setNotice(""); }}><i>↻</i><span><b>复活扣分</b><small>{unitReviveCost ? `单次 −${unitReviveCost} 分` : "当前不可复活"}</small></span></button>
          </div>

          {actionMode === "knockout" && <div className={styles.actionEditor}><p>选择一位或多位得分人员；多人共同淘汰时，每人获得 ＋{knockoutPoints} 分。</p><div className={styles.playerChips}>{sortedPlayers.map((player, index) => <button data-tv-key={`knockout-player-${index + 1}`} className={knockoutWinners.includes(player.name) ? styles.controlSelected : ""} type="button" disabled={busy} key={player.name} onClick={() => toggleKnockoutWinner(player.name)}><span>{player.name}</span><small>{knockoutWinners.includes(player.name) ? `＋${knockoutPoints}` : "选择"}</small></button>)}</div><button data-tv-key="confirm-knockout" className={styles.actionConfirm} type="button" disabled={busy || !knockoutWinners.length} onClick={applyKnockout}>确认淘汰加分</button></div>}
          {actionMode === "revive" && <div className={styles.actionEditor}><p>L{state.currentLevel} 单次复活扣除 {unitReviveCost} 分，并获得 {formatNumber(currentBlind.chips ?? 0)} 筹码。</p><RankPlayerSelect value={revivePlayer} players={sortedPlayers} unavailableNames={noUnavailablePlayers} label="选择复活人员" placeholder="选择复活人员" remoteTarget="revive" remoteKey="revive-player" disabled={busy} onChange={setRevivePlayer} /><button data-tv-key="confirm-revive" className={styles.actionConfirm} type="button" disabled={busy || !revivePlayer} onClick={applyRevive}>确认一次复活扣分</button></div>}
        </section>
      </div>
    </aside>
  </div>;
}
