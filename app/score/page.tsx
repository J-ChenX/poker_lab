"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { BLIND_LEVELS, knockoutBase, knockoutShare, placementScore, reviveCost } from "./rules";
import styles from "./score.module.css";

type Player = { id: string; name: string; score: number; gamesPlayed: number };
type GameEntry = { playerId: string; name: string; rank: number; placementScore: number; revivalCost: number; knockoutScore: number; totalDelta: number };
type Game = { id: string; playerCount: number; createdAt: string; entries: GameEntry[] };
type Seat = { playerId: string; revivals: number[] };
type KnockoutEvent = { id: string; victimPlayerId: string; winnerPlayerIds: string[] };

const blankSeats = (count: number): Seat[] => Array.from({ length: count }, () => ({ playerId: "", revivals: [] }));
const signed = (value: number) => `${value > 0 ? "+" : ""}${value}`;

export default function Scorekeeper() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [playerCount, setPlayerCount] = useState(5);
  const [seats, setSeats] = useState<Seat[]>(() => blankSeats(5));
  const [knockouts, setKnockouts] = useState<KnockoutEvent[]>([]);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const applySnapshot = (data: { players: Player[]; games: Game[] }) => {
    setPlayers(data.players ?? []);
    setGames(data.games ?? []);
  };

  useEffect(() => {
    fetch("/api/score")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "读取失败");
        applySnapshot(data);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "读取失败"))
      .finally(() => setLoading(false));
  }, []);

  const playerById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);
  const selectedIds = seats.map((seat) => seat.playerId).filter(Boolean);

  const knockoutPoints = useMemo(() => {
    const points = new Map<string, number>();
    for (const event of knockouts) {
      const winners = [...new Set(event.winnerPlayerIds.filter(Boolean))];
      if (!event.victimPlayerId || !winners.length) continue;
      const share = knockoutShare(playerCount, winners.length);
      for (const id of winners) points.set(id, (points.get(id) ?? 0) + share);
    }
    return points;
  }, [knockouts, playerCount]);

  const previews = seats.map((seat, index) => {
    const placement = placementScore(playerCount, index + 1);
    const revival = seat.revivals.reduce((sum, level) => sum + reviveCost(playerCount, level), 0);
    const knockout = knockoutPoints.get(seat.playerId) ?? 0;
    return { placement, revival, knockout, total: placement + knockout - revival };
  });

  const changeCount = (count: number) => {
    setPlayerCount(count); setSeats(blankSeats(count)); setKnockouts([]); setMessage(""); setError("");
  };

  const createPlayer = async (event: FormEvent) => {
    event.preventDefault();
    if (!newName.trim()) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/score", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "createPlayer", name: newName }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "登记失败");
      applySnapshot(data); setNewName(""); setMessage(`已登记 ${newName.trim()}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "登记失败"); }
    finally { setSaving(false); }
  };

  const setSeatPlayer = (index: number, playerId: string) => setSeats((current) => current.map((seat, seatIndex) => seatIndex === index ? { ...seat, playerId } : seat));
  const setRevival = (seatIndex: number, revivalIndex: number, level: number) => setSeats((current) => current.map((seat, index) => {
    if (index !== seatIndex) return seat;
    const next = [...seat.revivals];
    if (!level) next.splice(revivalIndex, 1); else next[revivalIndex] = level;
    return { ...seat, revivals: next.filter(Boolean).slice(0, 2) };
  }));
  const addKnockout = () => setKnockouts((current) => [...current, { id: crypto.randomUUID(), victimPlayerId: "", winnerPlayerIds: [] }]);
  const toggleWinner = (eventId: string, playerId: string) => setKnockouts((current) => current.map((event) => event.id !== eventId ? event : { ...event, winnerPlayerIds: event.winnerPlayerIds.includes(playerId) ? event.winnerPlayerIds.filter((id) => id !== playerId) : [...event.winnerPlayerIds, playerId] }));

  const saveGame = async () => {
    setError(""); setMessage("");
    if (players.length < playerCount) return setError(`请先登记至少 ${playerCount} 位人员`);
    if (selectedIds.length !== playerCount || new Set(selectedIds).size !== playerCount) return setError("请为每个名次选择不同的参与者");
    if (knockouts.some((event) => !event.victimPlayerId || !event.winnerPlayerIds.length)) return setError("请补全或删除未完成的淘汰记录");
    setSaving(true);
    try {
      const response = await fetch("/api/score", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "recordGame", playerCount, results: seats.map((seat, index) => ({ playerId: seat.playerId, rank: index + 1, revivals: seat.revivals })), knockoutEvents: knockouts.map(({ victimPlayerId, winnerPlayerIds }) => ({ victimPlayerId, winnerPlayerIds })) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "保存失败");
      applySnapshot(data); setSeats(blankSeats(playerCount)); setKnockouts([]); setMessage("本局积分已结算并写入排行榜");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "保存失败"); }
    finally { setSaving(false); }
  };

  const leader = players[0];
  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <a className={styles.brand} href="/score"><span>♠</span><strong>牌桌积分簿</strong></a>
        <nav><a href="/">胜率工具</a><a className={styles.activeNav} href="/score">积分系统</a></nav>
        <div className={styles.headerMeta}><span className={styles.liveDot} />数据自动保存</div>
      </header>

      <section className={styles.hero}>
        <div><p className={styles.eyebrow}>TABLE SCOREKEEPER · 3–12 PLAYERS</p><h1>每一局，都算得清楚。</h1><p>名次自动加分、复活自动扣分、淘汰自动奖励；长期排名不再取决于一晚的筹码起伏。</p></div>
        <div className={styles.heroStats}><div><span>登记人员</span><strong>{players.length}</strong></div><div><span>已记牌局</span><strong>{games.length}</strong></div><div><span>当前榜首</span><strong className={styles.leaderName}>{leader?.name ?? "—"}</strong><small>{leader ? `${leader.score} 分` : "等待首局"}</small></div></div>
      </section>

      {(message || error) && <div className={`${styles.notice} ${error ? styles.errorNotice : ""}`} role="status">{error || message}<button type="button" onClick={() => { setMessage(""); setError(""); }}>×</button></div>}

      <section className={styles.dashboard}>
        <aside className={styles.roster}>
          <div className={styles.panelHead}><div><span>01</span><h2>人员与积分榜</h2></div><small>{loading ? "正在读取…" : `${players.length} 人`}</small></div>
          <form className={styles.registerForm} onSubmit={createPlayer}><label><span>登记新人员</span><input value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={20} placeholder="输入姓名或昵称" aria-label="输入姓名或昵称" /></label><button disabled={saving || !newName.trim()}>＋ 登记</button></form>
          <div className={styles.peopleList}>{!loading && players.length === 0 && <div className={styles.empty}><b>还没有人员</b><span>先登记牌友，再开始记录牌局。</span></div>}{players.map((player, index) => <div className={styles.person} key={player.id}><i>{index + 1}</i><span className={styles.avatar}>{player.name.slice(0, 2).toUpperCase()}</span><p><strong>{player.name}</strong><small>{player.gamesPlayed} 局</small></p><b>{player.score}<small>分</small></b></div>)}</div>
        </aside>

        <section className={styles.gameWorkspace}>
          <div className={styles.panelHead}><div><span>02</span><h2>记录新牌局</h2></div><small>按名次排列参与者</small></div>
          <div className={styles.sectionBlock}>
            <div className={styles.blockTitle}><div><b>A</b><span><strong>选择本局人数</strong><small>人数决定名次分、复活费和淘汰分</small></span></div><em>淘汰基础分 {knockoutBase(playerCount)}</em></div>
            <div className={styles.countPicker}>{Array.from({ length: 10 }, (_, index) => index + 3).map((count) => <button className={count === playerCount ? styles.selectedCount : ""} type="button" key={count} onClick={() => changeCount(count)}>{count}<small>人</small></button>)}</div>
          </div>
          <div className={styles.sectionBlock}>
            <div className={styles.blockTitle}><div><b>B</b><span><strong>按最终名次填写</strong><small>第 1 行即第 1 名，系统实时预览净积分</small></span></div><em>前 {Math.ceil(playerCount / 2)} 名获得名次分</em></div>
            <div className={styles.resultsHead}><span>名次 / 人员</span><span>复活等级（最多两次）</span><span>积分预览</span></div>
            <div className={styles.resultRows}>{seats.map((seat, index) => { const preview = previews[index]; return <div className={styles.resultRow} key={index}>
              <div className={styles.playerChoice}><i>{index + 1}</i><select aria-label={`第 ${index + 1} 名`} value={seat.playerId} onChange={(event) => setSeatPlayer(index, event.target.value)}><option value="">选择人员</option>{players.map((player) => <option disabled={selectedIds.includes(player.id) && seat.playerId !== player.id} value={player.id} key={player.id}>{player.name}</option>)}</select></div>
              <div className={styles.revivalChoices}>{playerCount < 5 ? <span className={styles.noRevive}>本局不可复活</span> : [0, 1].map((revivalIndex) => <label key={revivalIndex}><small>第{revivalIndex + 1}次</small><select value={seat.revivals[revivalIndex] ?? 0} onChange={(event) => setRevival(index, revivalIndex, Number(event.target.value))}><option value="0">无</option>{BLIND_LEVELS.map((blind) => <option value={blind.level} key={blind.level}>L{blind.level} · −{reviveCost(playerCount, blind.level)}</option>)}</select></label>)}</div>
              <div className={styles.previewScore}><strong className={preview.total < 0 ? styles.negative : styles.positive}>{signed(preview.total)}</strong><small>名次 {signed(preview.placement)} · 淘汰 {signed(preview.knockout)} · 复活 −{preview.revival}</small></div>
            </div>; })}</div>
          </div>
          <div className={styles.sectionBlock}>
            <div className={styles.blockTitle}><div><b>C</b><span><strong>记录淘汰</strong><small>每淘汰一个生命记一条；多人共同淘汰时向上取整</small></span></div><button className={styles.secondaryButton} type="button" onClick={addKnockout} disabled={!selectedIds.length}>＋ 添加淘汰</button></div>
            {knockouts.length === 0 ? <div className={styles.knockoutEmpty}>没有淘汰奖励记录，可直接结算名次与复活积分。</div> : <div className={styles.knockoutList}>{knockouts.map((event, eventIndex) => { const validWinners = event.winnerPlayerIds.filter((id) => id !== event.victimPlayerId); const share = validWinners.length ? knockoutShare(playerCount, validWinners.length) : knockoutBase(playerCount); return <article className={styles.knockoutCard} key={event.id}>
              <div className={styles.knockoutTop}><strong>淘汰记录 {eventIndex + 1}</strong><span>每位得分 {validWinners.length ? share : "—"}</span><button type="button" onClick={() => setKnockouts((current) => current.filter((item) => item.id !== event.id))}>删除</button></div>
              <label className={styles.victimChoice}><span>被淘汰生命</span><select value={event.victimPlayerId} onChange={(change) => setKnockouts((current) => current.map((item) => item.id === event.id ? { ...item, victimPlayerId: change.target.value, winnerPlayerIds: item.winnerPlayerIds.filter((id) => id !== change.target.value) } : item))}><option value="">选择人员</option>{selectedIds.map((id) => <option value={id} key={id}>{playerById.get(id)?.name}</option>)}</select></label>
              <div className={styles.winnerChoices}><span>得分玩家（可多选）</span><div>{selectedIds.filter((id) => id !== event.victimPlayerId).map((id) => <button className={event.winnerPlayerIds.includes(id) ? styles.winnerSelected : ""} type="button" key={id} onClick={() => toggleWinner(event.id, id)}>{playerById.get(id)?.name}<small>{event.winnerPlayerIds.includes(id) ? `＋${share}` : "选择"}</small></button>)}</div></div>
            </article>; })}</div>}
          </div>
          <div className={styles.settleBar}><div><span>本局积分变化合计</span><strong>{signed(previews.reduce((sum, preview) => sum + preview.total, 0))}</strong><small>淘汰多人分摊向上取整可能产生少量额外积分</small></div><button type="button" onClick={saveGame} disabled={saving}>{saving ? "正在保存…" : "确认结算本局 →"}</button></div>
        </section>
      </section>

      <section className={styles.historySection}>
        <div className={styles.historyHead}><div><p className={styles.eyebrow}>RECENT GAMES</p><h2>最近牌局</h2></div><span>显示最近 12 局</span></div>
        {games.length === 0 ? <div className={styles.historyEmpty}>结算第一局后，这里会保留每位玩家的详细积分流水。</div> : <div className={styles.gameHistory}>{games.map((game, index) => <article key={game.id}><header><div><b>牌局 {games.length - index}</b><span>{game.playerCount} 人桌</span></div><time>{new Date(game.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></header><div>{game.entries.map((entry) => <p key={entry.playerId}><i>{entry.rank}</i><strong>{entry.name}</strong><span>名次 {signed(entry.placementScore)}</span><span>淘汰 {signed(entry.knockoutScore)}</span><span>复活 −{entry.revivalCost}</span><b className={entry.totalDelta < 0 ? styles.negative : styles.positive}>{signed(entry.totalDelta)}</b></p>)}</div></article>)}</div>}
      </section>
    </main>
  );
}
