"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { BLIND_LEVELS, knockoutBase, knockoutShare, placementScore, reviveCost, scoringPlaceCount } from "./rules";
import styles from "./score.module.css";

type Player = { name: string; score: number };
type ModalType = "revive" | "knockout" | null;

const STORAGE_KEY = "poker-scorekeeper-players-json-v1";
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
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setPlayers(readStoredPlayers()); setHydrated(true); }, []);
  useEffect(() => { if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(players)); }, [hydrated, players]);

  const sortedPlayers = useMemo(() => [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "zh-CN")), [players]);
  const paidPlaces = scoringPlaceCount(playerCount);
  const currentBlind = BLIND_LEVELS[currentLevel - 1];
  const unitReviveCost = reviveCost(playerCount, currentLevel);
  const knockoutUnit = knockoutBase(playerCount);
  const selectedRanked = rankedPlayers.filter(Boolean);
  const knockoutShareValue = knockoutWinners.length ? knockoutShare(playerCount, knockoutWinners.length) : knockoutUnit;

  const showMessage = (text: string) => { setNotice(text); setError(""); };
  const showError = (text: string) => { setError(text); setNotice(""); };

  const changePlayerCount = (count: number) => {
    const places = scoringPlaceCount(count);
    setPlayerCount(count); setRankedPlayers(Array(places).fill("")); closeModal(); setNotice(""); setError("");
  };

  const addPlayer = (event: FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    if (players.some((player) => player.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return showError("该人员已经存在");
    setPlayers((current) => [...current, { name, score: 0 }]); setNewName(""); showMessage(`已添加 ${name}`);
  };

  const deletePlayer = (name: string) => {
    if (!window.confirm(`确定删除“${name}”吗？该人员的积分也会一并删除。`)) return;
    setPlayers((current) => current.filter((player) => player.name !== name));
    setRankedPlayers((current) => current.map((value) => value === name ? "" : value));
    setKnockoutWinners((current) => current.filter((value) => value !== name));
    if (actionPlayer === name) setActionPlayer("");
    showMessage(`已删除 ${name}`);
  };

  const addScores = (changes: Map<string, number>) => {
    setPlayers((current) => current.map((player) => ({ ...player, score: player.score + (changes.get(player.name) ?? 0) })));
  };

  const settlePlacement = () => {
    if (players.length < paidPlaces) return showError(`请先添加至少 ${paidPlaces} 位人员`);
    if (selectedRanked.length !== paidPlaces || new Set(selectedRanked).size !== paidPlaces) return showError("请为每个计分名次选择不同的人员");
    addScores(new Map(rankedPlayers.map((name, index) => [name, placementScore(playerCount, index + 1)])));
    setRankedPlayers(Array(paidPlaces).fill(""));
    showMessage(`已结算 ${playerCount} 人局前 ${paidPlaces} 名的名次积分`);
  };

  const openModal = (type: Exclude<ModalType, null>) => {
    setModal(type); setActionPlayer(""); setKnockoutWinners([]); setNotice(""); setError("");
  };
  const closeModal = () => { setModal(null); setActionPlayer(""); setKnockoutWinners([]); };

  const applyRevive = () => {
    if (!actionPlayer) return showError("请选择复活人员");
    if (!unitReviveCost) return showError("当前人数或等级不可复活");
    addScores(new Map([[actionPlayer, -unitReviveCost]]));
    closeModal(); showMessage(`${actionPlayer} 复活一次，扣除 ${unitReviveCost} 分`);
  };

  const toggleKnockoutWinner = (name: string) => setKnockoutWinners((current) => current.includes(name) ? current.filter((value) => value !== name) : [...current, name]);
  const applyKnockout = () => {
    if (!knockoutWinners.length) return showError("请至少选择一名得分人员");
    const share = knockoutShare(playerCount, knockoutWinners.length);
    addScores(new Map(knockoutWinners.map((name) => [name, share])));
    const names = knockoutWinners.join("、"); closeModal(); showMessage(`${names} 各获得 ${share} 点淘汰积分`);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(players, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `德州扑克积分-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url);
    showMessage("人员与积分 JSON 已导出");
  };

  const importJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    try {
      const value: unknown = JSON.parse(await file.text());
      if (!Array.isArray(value)) throw new Error();
      const imported = value.map((item) => ({ name: String((item as Player).name ?? "").trim(), score: Number((item as Player).score) })).filter((item) => item.name && Number.isFinite(item.score));
      if (!imported.length && value.length) throw new Error();
      const deduplicated = [...new Map(imported.map((item) => [item.name.toLocaleLowerCase(), item])).values()];
      setPlayers(deduplicated); setRankedPlayers(Array(paidPlaces).fill("")); showMessage(`已导入 ${deduplicated.length} 位人员`);
    } catch { showError("JSON 格式无效，只接受姓名和积分字段"); }
  };

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <a className={styles.brand} href="/score"><span>♠</span><strong>牌桌积分簿</strong></a>
        <nav><a href="/">胜率工具</a><a className={styles.activeNav} href="/score">积分系统</a></nav>
        <div className={styles.headerMeta}><span className={styles.liveDot} />本机 JSON 自动保存</div>
      </header>

      <section className={styles.hero}>
        <div><p className={styles.eyebrow}>TABLE SCOREKEEPER · 3–12 PLAYERS</p><h1>简单记分，长期排名。</h1><p>只保留姓名和积分。名次一键结算，复活即时扣分，淘汰即时加分；积分可以持续降到负数。</p></div>
        <div className={styles.heroStats}><div><span>登记人员</span><strong>{players.length}</strong></div><div><span>本局人数</span><strong>{playerCount}</strong></div><div><span>当前等级</span><strong>L{currentLevel}</strong><small>{currentBlind.small.toLocaleString()} / {currentBlind.big.toLocaleString()}</small></div></div>
      </section>

      <section className={styles.statusBoard} aria-label="当前牌桌状态">
        <div className={styles.statusLevel}><span>当前轮次</span><strong>L{currentLevel}</strong><small>{playerCount} 人局</small></div>
        <div><span>小盲</span><strong>{formatNumber(currentBlind.small)}</strong><small>SB</small></div>
        <div><span>大盲</span><strong>{formatNumber(currentBlind.big)}</strong><small>BB</small></div>
        <div><span>复活价格</span><strong>{unitReviveCost ? `−${unitReviveCost}` : "—"}</strong><small>{unitReviveCost ? "积分 / 次" : "不可复活"}</small></div>
        <div><span>复活筹码</span><strong>{currentBlind.chips ? formatNumber(currentBlind.chips) : "—"}</strong><small>{currentBlind.chips ? "筹码" : "不可复活"}</small></div>
      </section>

      {(notice || error) && <div className={`${styles.notice} ${error ? styles.errorNotice : ""}`} role="status">{error || notice}<button type="button" onClick={() => { setNotice(""); setError(""); }}>×</button></div>}

      <section className={styles.dashboard}>
        <aside className={styles.roster}>
          <div className={styles.panelHead}><div><span>01</span><h2>人员与积分</h2></div><small>{hydrated ? `${players.length} 人` : "读取中"}</small></div>
          <form className={styles.registerForm} onSubmit={addPlayer}><label><span>添加人员</span><input value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={20} placeholder="输入姓名或昵称" /></label><button disabled={!newName.trim()}>＋ 添加</button></form>
          <div className={styles.jsonActions}><button type="button" onClick={exportJson} disabled={!players.length}>导出 JSON</button><button type="button" onClick={() => importRef.current?.click()}>导入 JSON</button><input ref={importRef} type="file" accept="application/json,.json" onChange={importJson} /></div>
          <div className={styles.peopleList}>{hydrated && players.length === 0 && <div className={styles.empty}><b>还没有人员</b><span>添加姓名后即可开始记分。</span></div>}{sortedPlayers.map((player, index) => <div className={styles.person} key={player.name}><i>{index + 1}</i><span className={styles.avatar}>{player.name.slice(0, 2).toUpperCase()}</span><p><strong>{player.name}</strong><small>{player.score < 0 ? "负积分" : index === 0 ? "当前领先" : "积分账户"}</small></p><b className={player.score < 0 ? styles.negative : ""}>{player.score}<small>分</small></b><button className={styles.deletePerson} type="button" onClick={() => deletePlayer(player.name)} aria-label={`删除 ${player.name}`}>×</button></div>)}</div>
        </aside>

        <section className={styles.gameWorkspace}>
          <div className={styles.panelHead}><div><span>02</span><h2>本局设置</h2></div><small>决定所有自动分值</small></div>
          <div className={styles.settingsGrid}>
            <div><div className={styles.blockTitle}><span><strong>本局开始人数</strong><small>决定名次分与淘汰分</small></span><em>{paidPlaces} 个计分名次</em></div><div className={styles.countPicker}>{Array.from({ length: 10 }, (_, index) => index + 3).map((count) => <button className={count === playerCount ? styles.selectedCount : ""} type="button" key={count} onClick={() => changePlayerCount(count)}>{count}<small>人</small></button>)}</div></div>
            <div><div className={styles.blockTitle}><span><strong>当前盲注等级</strong><small>决定本次复活花费</small></span><em>{unitReviveCost ? `单次 −${unitReviveCost} 分` : "不可复活"}</em></div><div className={styles.levelPicker}>{BLIND_LEVELS.map((blind) => <button className={blind.level === currentLevel ? styles.selectedLevel : ""} type="button" key={blind.level} onClick={() => setCurrentLevel(blind.level)}><b>L{blind.level}</b><span>{formatNumber(blind.small)} / {formatNumber(blind.big)}</span><small>{reviveCost(playerCount, blind.level) ? `复活 −${reviveCost(playerCount, blind.level)}` : "禁止复活"}</small></button>)}</div></div>
          </div>

          <section className={styles.placementPanel}>
            <div className={styles.blockTitle}><span><strong>输入计分名次</strong><small>只显示有名次积分的前半数，最多6名</small></span><em>选择 {paidPlaces} 人</em></div>
            <div className={styles.rankList}>{Array.from({ length: paidPlaces }, (_, index) => <label key={index}><i>{index + 1}</i><span><strong>第 {index + 1} 名</strong><small>＋{placementScore(playerCount, index + 1)} 分</small></span><select value={rankedPlayers[index] ?? ""} onChange={(event) => setRankedPlayers((current) => current.map((value, rank) => rank === index ? event.target.value : value))}><option value="">选择人员</option>{players.map((player) => <option disabled={selectedRanked.includes(player.name) && rankedPlayers[index] !== player.name} key={player.name}>{player.name}</option>)}</select></label>)}</div>
            <button className={styles.settlePlacement} type="button" onClick={settlePlacement}>结算名次积分 →</button>
          </section>

          <section className={styles.quickActions}>
            <button type="button" onClick={() => openModal("revive")} disabled={!players.length || !unitReviveCost}><span>↻</span><div><strong>复活扣分</strong><small>{unitReviveCost ? `每次确认记录一次，扣 ${unitReviveCost} 分` : "当前设置不可复活"}</small></div><b>打开 →</b></button>
            <button type="button" onClick={() => openModal("knockout")} disabled={!players.length}><span>✦</span><div><strong>淘汰加分</strong><small>选择得分人员，系统按人数直接加分</small></div><b>打开 →</b></button>
          </section>
        </section>
      </section>

      <footer className={styles.footer}><span>数据格式</span><code>{`[{ "name": "玩家", "score": 0 }]`}</code><p>数据仅保存在当前浏览器；更换设备前请导出 JSON 备份。</p></footer>

      {modal && <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeModal()}><section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="action-title">
        <header><div><p className={styles.eyebrow}>{modal === "revive" ? "REVIVAL COST" : "KNOCKOUT BONUS"}</p><h2 id="action-title">{modal === "revive" ? "复活扣分" : "淘汰加分"}</h2></div><button type="button" onClick={closeModal}>×</button></header>
        {modal === "revive" ? <div className={styles.modalBody}><div className={styles.actionSummary}><span>L{currentLevel} · {formatNumber(currentBlind.small)} / {formatNumber(currentBlind.big)}</span><strong>单次 −{unitReviveCost} 分</strong></div><label><span>复活人员</span><select value={actionPlayer} onChange={(event) => setActionPlayer(event.target.value)}><option value="">选择人员</option>{players.map((player) => <option key={player.name}>{player.name}</option>)}</select></label><div className={styles.actionTotal}><span>本次扣除</span><strong className={styles.negative}>−{unitReviveCost}</strong></div><button className={styles.modalPrimary} type="button" onClick={applyRevive}>确认一次复活扣分</button></div> : <div className={styles.modalBody}><div className={styles.actionSummary}><span>{playerCount} 人局 · 淘汰基础分</span><strong>{knockoutUnit} 分</strong></div><p className={styles.modalHint}>选择一名或多名得分人员。多人共同淘汰时，每人获得基础分除以人数后向上取整的整数。</p><div className={styles.modalPeople}>{players.map((player) => <button className={knockoutWinners.includes(player.name) ? styles.modalPersonSelected : ""} type="button" key={player.name} onClick={() => toggleKnockoutWinner(player.name)}><span>{player.name}</span><small>{knockoutWinners.includes(player.name) ? `＋${knockoutShareValue}` : "选择"}</small></button>)}</div><div className={styles.actionTotal}><span>每位获得</span><strong>＋{knockoutWinners.length ? knockoutShareValue : 0}</strong></div><button className={styles.modalPrimary} type="button" onClick={applyKnockout}>确认加分</button></div>}
      </section></div>}
    </main>
  );
}
