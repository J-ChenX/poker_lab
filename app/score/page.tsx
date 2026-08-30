"use client";

import { CSSProperties, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BLIND_LEVELS, knockoutBase, knockoutShare, placementScore, reviveCost, scoringPlaceCount } from "./rules";
import styles from "./score.module.css";

type Player = { name: string; score: number };
type GameState = { playerCount: number; currentLevel: number; rankedPlayers: string[] };
type SharedState = GameState & { players: Player[]; version: number; initialized: boolean };
type ScoreAction =
  | { type: "replaceState"; players: Player[]; playerCount: number; currentLevel: number; rankedPlayers: string[] }
  | { type: "addPlayer"; name: string }
  | { type: "deletePlayer"; name: string }
  | { type: "resetScores" }
  | { type: "setGame"; playerCount: number; currentLevel: number; rankedPlayers: string[] }
  | { type: "addScores"; changes: { name: string; amount: number }[]; clearRanks?: boolean };
type ModalType = "revive" | "knockout" | null;

const STORAGE_KEY = "poker-scorekeeper-players-json-v1";
const GAME_STATE_KEY = "poker-scorekeeper-game-state-v1";
const signed = (value: number) => `${value > 0 ? "+" : ""}${value}`;
const formatNumber = (value: number) => value.toLocaleString("zh-CN");

function readStoredPlayers(): Player[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value
      .filter((item): item is Player => Boolean(item) && typeof item === "object" && typeof (item as Player).name === "string" && Number.isFinite(Number((item as Player).score)))
      .map((item) => ({ name: item.name.trim(), score: Number(item.score) }))
      .filter((item) => item.name);
  } catch { return []; }
}

function readStoredGameState(): GameState {
  const fallback = { playerCount: 5, currentLevel: 1, rankedPlayers: ["", "", ""] };
  try {
    const value = JSON.parse(localStorage.getItem(GAME_STATE_KEY) ?? "null") as Partial<GameState> | null;
    if (!value) return fallback;
    const playerCount = Math.min(12, Math.max(3, Math.round(Number(value.playerCount) || fallback.playerCount)));
    const currentLevel = Math.min(10, Math.max(1, Math.round(Number(value.currentLevel) || fallback.currentLevel)));
    const places = scoringPlaceCount(playerCount);
    const storedRanks = Array.isArray(value.rankedPlayers) ? value.rankedPlayers : [];
    const rankedPlayers = Array.from({ length: places }, (_, index) => typeof storedRanks[index] === "string" ? storedRanks[index] : "");
    return { playerCount, currentLevel, rankedPlayers };
  } catch { return fallback; }
}

function PlayerSelect({ value, players, unavailableNames = new Set<string>(), label, onChange }: {
  value: string;
  players: Player[];
  unavailableNames?: Set<string>;
  label: string;
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

  return <div className={styles.playerSelect} ref={rootRef}>
    <button className={`${styles.selectTrigger} ${open ? styles.selectTriggerOpen : ""} ${value ? styles.selectTriggerFilled : ""}`} type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={open} disabled={!players.length} onClick={() => setOpen((current) => !current)} onKeyDown={(event) => event.key === "Escape" && setOpen(false)}>
      <span>{value ? <><i>{value.slice(0, 2).toUpperCase()}</i><b>{value}</b></> : <b>{players.length ? "选择人员" : "请先添加人员"}</b>}</span>
      <em aria-hidden="true">⌄</em>
    </button>
    {open && <div className={styles.selectMenu} role="listbox" aria-label={label} tabIndex={-1} onKeyDown={(event) => event.key === "Escape" && setOpen(false)}>
      {value && <button className={styles.clearOption} type="button" onClick={() => { onChange(""); setOpen(false); }}><span>清除选择</span><small>×</small></button>}
      {players.map((player) => {
        const unavailable = unavailableNames.has(player.name);
        const selected = player.name === value;
        return <button className={selected ? styles.selectOptionSelected : ""} type="button" role="option" aria-selected={selected} disabled={unavailable} key={player.name} onClick={() => { onChange(player.name); setOpen(false); }}>
          <i>{player.name.slice(0, 2).toUpperCase()}</i><span><strong>{player.name}</strong><small>{unavailable ? "已用于其他名次" : selected ? "当前选择" : `${signed(player.score)} 分`}</small></span><b>{selected ? "✓" : ""}</b>
        </button>;
      })}
    </div>}
  </div>;
}

export default function Scorekeeper() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [newName, setNewName] = useState("");
  const [playerCount, setPlayerCount] = useState(5);
  const [currentLevel, setCurrentLevel] = useState(1);
  const [rankedPlayers, setRankedPlayers] = useState<string[]>(["", "", ""]);
  const [modal, setModal] = useState<ModalType>(null);
  const [actionPlayer, setActionPlayer] = useState("");
  const [knockoutWinners, setKnockoutWinners] = useState<string[]>([]);
  const versionRef = useRef(-1);
  const pendingMutationsRef = useRef(0);

  const applySharedState = useCallback((state: SharedState) => {
    if (state.version < versionRef.current) return;
    versionRef.current = state.version;
    setPlayers(state.players);
    setPlayerCount(state.playerCount);
    setCurrentLevel(state.currentLevel);
    setRankedPlayers(state.rankedPlayers);
  }, []);

  const fetchSharedState = useCallback(async () => {
    const response = await fetch("/api/score-state", { cache: "no-store" });
    if (!response.ok) throw new Error("共享数据读取失败");
    return response.json() as Promise<SharedState>;
  }, []);

  const mutateSharedState = useCallback(async (action: ScoreAction) => {
    pendingMutationsRef.current += 1;
    try {
      const response = await fetch("/api/score-state", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action),
      });
      const result = await response.json() as SharedState & { error?: string };
      if (!response.ok) throw new Error(result.error || "数据保存失败");
      applySharedState(result);
      return true;
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "数据保存失败，请重试");
      try { applySharedState(await fetchSharedState()); } catch { /* 保留当前画面，等待下一次同步 */ }
      return false;
    } finally {
      pendingMutationsRef.current -= 1;
    }
  }, [applySharedState, fetchSharedState]);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      try {
        let state = await fetchSharedState();
        if (!state.initialized) {
          const legacyPlayers = readStoredPlayers();
          const legacyGame = readStoredGameState();
          const hasLegacyData = legacyPlayers.length > 0 || legacyGame.playerCount !== 5 || legacyGame.currentLevel !== 1 || legacyGame.rankedPlayers.some(Boolean);
          if (hasLegacyData) {
            const response = await fetch("/api/score-state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "replaceState", players: legacyPlayers, ...legacyGame }) });
            if (response.ok) state = await response.json() as SharedState;
          }
        }
        if (!active) return;
        applySharedState(state);
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(GAME_STATE_KEY);
      } catch {
        if (active) window.alert("无法连接这台电脑上的共享记分数据，请确认服务仍在运行。");
      } finally {
        if (active) setHydrated(true);
      }
    };
    void initialize();
    return () => { active = false; };
  }, [applySharedState, fetchSharedState]);

  useEffect(() => {
    if (!hydrated) return;
    const refresh = async () => {
      if (pendingMutationsRef.current) return;
      try {
        const state = await fetchSharedState();
        if (!pendingMutationsRef.current) applySharedState(state);
      } catch { /* 网络恢复后自动继续同步 */ }
    };
    const timer = window.setInterval(() => { void refresh(); }, 2000);
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); };
  }, [applySharedState, fetchSharedState, hydrated]);

  const sortedPlayers = useMemo(() => [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "zh-CN")), [players]);
  const paidPlaces = scoringPlaceCount(playerCount);
  const currentBlind = BLIND_LEVELS[currentLevel - 1];
  const unitReviveCost = reviveCost(playerCount, currentLevel);
  const reviveUnavailableText = "当前等级不可复活";
  const knockoutUnit = knockoutBase(playerCount);
  const selectedRanked = rankedPlayers.filter(Boolean);
  const knockoutShareValue = knockoutWinners.length ? knockoutShare(playerCount, knockoutWinners.length) : knockoutUnit;

  const showError = (text: string) => window.alert(text);

  const changePlayerCount = (count: number) => {
    const places = scoringPlaceCount(count);
    const nextRanks = Array(places).fill("");
    setPlayerCount(count); setRankedPlayers(nextRanks); closeModal();
    void mutateSharedState({ type: "setGame", playerCount: count, currentLevel, rankedPlayers: nextRanks });
  };

  const changeLevel = (level: number) => {
    setCurrentLevel(level);
    void mutateSharedState({ type: "setGame", playerCount, currentLevel: level, rankedPlayers });
  };

  const changeRankedPlayer = (index: number, name: string) => {
    const nextRanks = rankedPlayers.map((value, rank) => rank === index ? name : value);
    setRankedPlayers(nextRanks);
    void mutateSharedState({ type: "setGame", playerCount, currentLevel, rankedPlayers: nextRanks });
  };

  const addPlayer = async (event: FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    if (players.some((player) => player.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return showError("该人员已经存在");
    if (await mutateSharedState({ type: "addPlayer", name })) setNewName("");
  };

  const deletePlayer = async (name: string) => {
    if (!window.confirm(`确定删除“${name}”吗？该人员的积分也会一并删除。`)) return;
    if (await mutateSharedState({ type: "deletePlayer", name })) {
      setKnockoutWinners((current) => current.filter((value) => value !== name));
      if (actionPlayer === name) setActionPlayer("");
    }
  };

  const resetAllScores = async () => {
    if (!players.length) return;
    if (!window.confirm("确定将所有人员的积分清零吗？人员名单会保留。")) return;
    await mutateSharedState({ type: "resetScores" });
  };

  const addScores = async (changes: Map<string, number>, clearRanks = false) => {
    return mutateSharedState({ type: "addScores", changes: Array.from(changes, ([name, amount]) => ({ name, amount })), clearRanks });
  };

  const settlePlacement = async () => {
    if (players.length < paidPlaces) return showError(`请先添加至少 ${paidPlaces} 位人员`);
    if (selectedRanked.length !== paidPlaces || new Set(selectedRanked).size !== paidPlaces) return showError("请为每个计分名次选择不同的人员");
    await addScores(new Map(rankedPlayers.map((name, index) => [name, placementScore(playerCount, index + 1)])), true);
  };

  const openModal = (type: Exclude<ModalType, null>) => {
    setModal(type); setActionPlayer(""); setKnockoutWinners([]);
  };
  const closeModal = () => { setModal(null); setActionPlayer(""); setKnockoutWinners([]); };

  const applyRevive = async () => {
    if (!actionPlayer) return showError("请选择复活人员");
    if (!unitReviveCost) return showError("当前人数或等级不可复活");
    if (await addScores(new Map([[actionPlayer, -unitReviveCost]]))) closeModal();
  };

  const toggleKnockoutWinner = (name: string) => setKnockoutWinners((current) => current.includes(name) ? current.filter((value) => value !== name) : [...current, name]);
  const applyKnockout = async () => {
    if (!knockoutWinners.length) return showError("请至少选择一名得分人员");
    const share = knockoutShare(playerCount, knockoutWinners.length);
    if (await addScores(new Map(knockoutWinners.map((name) => [name, share])))) closeModal();
  };

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <a className={styles.brand} href="/score"><span>♠</span><strong>牌桌积分簿</strong></a>
        <div className={styles.headerMeta}><span className={styles.liveDot} />所有设备自动同步</div>
      </header>

      <section className={styles.statusBoard} aria-label="当前牌桌状态">
        <div className={styles.statusLevel}><span>当前轮次</span><strong>L{currentLevel}</strong><small>{playerCount} 人开局</small></div>
        <div><span>小盲</span><strong>{formatNumber(currentBlind.small)}</strong><small>SB</small></div>
        <div><span>大盲</span><strong>{formatNumber(currentBlind.big)}</strong><small>BB</small></div>
        <div><span>复活价格</span><strong>{unitReviveCost ? `−${unitReviveCost}` : "—"}</strong><small>{unitReviveCost ? "积分 / 次" : "不可复活"}</small></div>
        <div><span>复活筹码</span><strong>{unitReviveCost && currentBlind.chips ? formatNumber(currentBlind.chips) : "—"}</strong><small>{unitReviveCost && currentBlind.chips ? "筹码" : "不可复活"}</small></div>
      </section>

      <section className={styles.dashboard}>
        <aside className={styles.roster}>
          <div className={styles.panelHead}><div><span>01</span><h2>人员与积分</h2></div><div className={styles.panelTools}><small>{hydrated ? `${players.length} 人` : "读取中"}</small><button className={styles.resetScores} type="button" onClick={resetAllScores} disabled={!players.length}>积分清零</button></div></div>
          <form className={styles.registerForm} onSubmit={addPlayer}><label><span>添加人员</span><input value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={20} placeholder="输入姓名或昵称" /></label><button disabled={!newName.trim()}>＋ 添加</button></form>
          <div className={styles.peopleList}>{hydrated && players.length === 0 && <div className={styles.empty}><b>还没有人员</b><span>添加姓名后即可开始记分。</span></div>}{sortedPlayers.map((player, index) => <div className={styles.person} key={player.name}><i>{index + 1}</i><span className={styles.avatar}>{player.name.slice(0, 2).toUpperCase()}</span><p><strong>{player.name}</strong><small>{player.score < 0 ? "负积分" : index === 0 ? "当前领先" : "积分账户"}</small></p><b className={player.score < 0 ? styles.negative : ""}>{player.score}<small>分</small></b><button className={styles.deletePerson} type="button" onClick={() => deletePlayer(player.name)} aria-label={`删除 ${player.name}`}>×</button></div>)}</div>
        </aside>

        <section className={styles.gameWorkspace}>
          <div className={styles.panelHead}><div><span>02</span><h2>本局设置</h2></div></div>
          <div className={styles.settingsGrid}>
            <div><div className={styles.blockTitle}><span><strong>本局开始人数</strong><small>决定名次分与淘汰分</small></span></div><div className={styles.countPicker}>{Array.from({ length: 10 }, (_, index) => index + 3).map((count) => <button className={count === playerCount ? styles.selectedCount : ""} type="button" key={count} onClick={() => changePlayerCount(count)}>{count}<small>人</small></button>)}</div></div>
            <div><div className={styles.blockTitle}><span><strong>当前盲注等级</strong><small>决定本次复活花费，是否执行由操作人员判断</small></span></div><div className={styles.levelPicker}>{BLIND_LEVELS.map((blind) => { const cost = reviveCost(playerCount, blind.level); return <button className={blind.level === currentLevel ? styles.selectedLevel : ""} type="button" key={blind.level} onClick={() => changeLevel(blind.level)}><b>L{blind.level}</b><span>{formatNumber(blind.small)} / {formatNumber(blind.big)}</span><small>{cost ? `复活 −${cost}` : "禁止复活"}</small><em aria-hidden={!blind.exchange}>{blind.exchange ?? "\u00a0"}</em></button>; })}</div></div>
          </div>

          <section className={styles.placementPanel}>
            <div className={styles.blockTitle}><span><strong>输入计分名次</strong><small>只显示有名次积分的前半数，最多6名</small></span></div>
            <div className={styles.rankList} style={{ "--rank-count": paidPlaces } as CSSProperties}>{Array.from({ length: paidPlaces }, (_, index) => <div className={styles.rankRow} key={index}><div className={styles.rankMeta}><i>{index + 1}</i><span><strong>第 {index + 1} 名</strong><small>＋{placementScore(playerCount, index + 1)} 分</small></span></div><PlayerSelect value={rankedPlayers[index] ?? ""} players={players} unavailableNames={new Set(selectedRanked.filter((name) => name !== rankedPlayers[index]))} label={`选择第 ${index + 1} 名人员`} onChange={(name) => changeRankedPlayer(index, name)} /></div>)}</div>
            <button className={styles.settlePlacement} type="button" onClick={settlePlacement}>结算名次积分 →</button>
          </section>

          <section className={styles.quickActions}>
            <button type="button" onClick={() => openModal("knockout")} disabled={!players.length}><span>✦</span><div><strong>淘汰加分</strong><small>选择得分人员，系统按人数直接加分</small></div><b>打开 →</b></button>
            <button type="button" onClick={() => openModal("revive")} disabled={!players.length || !unitReviveCost}><span>↻</span><div><strong>复活扣分</strong><small>{unitReviveCost ? `每次确认记录一次，扣 ${unitReviveCost} 分` : reviveUnavailableText}</small></div><b>打开 →</b></button>
          </section>
        </section>
      </section>

      {modal && <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeModal()}><section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="action-title">
        <header><div><p className={styles.eyebrow}>{modal === "revive" ? "REVIVAL COST" : "KNOCKOUT BONUS"}</p><h2 id="action-title">{modal === "revive" ? "复活扣分" : "淘汰加分"}</h2></div><button type="button" onClick={closeModal}>×</button></header>
        {modal === "revive" ? <div className={styles.modalBody}><div className={styles.actionSummary}><span>L{currentLevel} · {formatNumber(currentBlind.small)} / {formatNumber(currentBlind.big)}</span><strong>单次 −{unitReviveCost} 分</strong></div><div className={styles.modalField}><span>复活人员</span><PlayerSelect value={actionPlayer} players={players} label="选择复活人员" onChange={setActionPlayer} /></div><div className={styles.actionTotal}><span>本次扣除</span><strong className={styles.negative}>−{unitReviveCost}</strong></div><button className={styles.modalPrimary} type="button" onClick={applyRevive}>确认一次复活扣分</button></div> : <div className={styles.modalBody}><div className={styles.actionSummary}><span>{playerCount} 人局 · 淘汰基础分</span><strong>{knockoutUnit} 分</strong></div><p className={styles.modalHint}>选择一名或多名得分人员。多人共同淘汰时，每人获得基础分除以人数后向上取整的整数。</p><div className={styles.modalPeople}>{players.map((player) => <button className={knockoutWinners.includes(player.name) ? styles.modalPersonSelected : ""} type="button" key={player.name} onClick={() => toggleKnockoutWinner(player.name)}><span>{player.name}</span><small>{knockoutWinners.includes(player.name) ? `＋${knockoutShareValue}` : "选择"}</small></button>)}</div><div className={styles.actionTotal}><span>每位获得</span><strong>＋{knockoutWinners.length ? knockoutShareValue : 0}</strong></div><button className={styles.modalPrimary} type="button" onClick={applyKnockout}>确认加分</button></div>}
      </section></div>}
    </main>
  );
}
