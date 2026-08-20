"use client";

import { useMemo, useState } from "react";
import { cardParts, enumerateExact, HAND_NAMES, RANKS, SUITS, topBoardGroups, type ExactResult } from "./poker";

type PickerMode = "hole" | "board" | null;

function PlayingCard({ card, onClick, compact = false, label, disabled = false }: { card: string | null; onClick: () => void; compact?: boolean; label: string; disabled?: boolean }) {
  const parts = card ? cardParts(card) : null;
  return (
    <button type="button" disabled={disabled} aria-label={card ? `${label}：${parts!.name}${parts!.rank}` : `${label}：打开批量选牌`} className={`playing-card ${compact ? "compact" : ""} ${!card ? "ghost" : ""} ${parts?.code === "h" || parts?.code === "d" ? "red" : ""}`} onClick={onClick}>
      {parts ? <><span className="card-rank">{parts.rank}</span><span className="card-suit">{parts.symbol}</span></> : <><span className="plus">＋</span><small>选牌</small></>}
    </button>
  );
}

function RankPattern({ ranks, combos }: { ranks: [string, string]; combos: number }) {
  return <span className="rank-pattern"><span><b>{ranks[0]}</b><b>{ranks[1]}</b></span><small>{combos} 种花色组合</small></span>;
}

function Ring({ value }: { value: number }) {
  const safe = Math.max(0, Math.min(100, value));
  return <div className="equity-ring" style={{ background: `conic-gradient(var(--lime) ${safe * 3.6}deg, #34413b 0deg)` }}><div><strong>{safe.toFixed(1)}</strong><span>%</span></div></div>;
}

export default function Home() {
  const [hole, setHole] = useState<(string | null)[]>(["As", "Kh"]);
  const [board, setBoard] = useState<(string | null)[]>([null, null, null, null, null]);
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [draftCards, setDraftCards] = useState<string[]>([]);
  const [result, setResult] = useState<ExactResult | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [players, setPlayers] = useState(2);

  const validHole = hole.filter(Boolean) as string[];
  const validBoard = board.filter(Boolean) as string[];
  const ready = validHole.length === 2 && validBoard.length >= 3;
  const boardLeaders = useMemo(
    () => topBoardGroups(board.filter(Boolean) as string[], hole.filter(Boolean) as string[]),
    [board, hole],
  );

  const openPicker = (mode: Exclude<PickerMode, null>) => {
    if (running) return;
    setPickerMode(mode);
    setDraftCards(mode === "hole" ? validHole : validBoard);
  };

  const toggleDraft = (card: string) => {
    setDraftCards((cards) => {
      if (cards.includes(card)) return cards.filter((value) => value !== card);
      const limit = pickerMode === "hole" ? 2 : 5;
      return cards.length < limit ? [...cards, card] : cards;
    });
  };

  const confirmPicker = () => {
    if (pickerMode === "hole") setHole([...draftCards.slice(0, 2), ...Array(2).fill(null)].slice(0, 2));
    if (pickerMode === "board") setBoard([...draftCards.slice(0, 5), ...Array(5).fill(null)].slice(0, 5));
    setPickerMode(null);
    setResult(null);
  };

  const calculate = async () => {
    if (!ready || running) return;
    setRunning(true); setProgress(0); setResult(null);
    try { setResult(await enumerateExact(validHole, validBoard, players - 1, setProgress)); }
    finally { setRunning(false); setProgress(1); }
  };

  const reset = () => {
    if (running) return;
    setHole([null, null]); setBoard([null, null, null, null, null]); setResult(null); setPickerMode(null); setProgress(0); setPlayers(2);
  };

  const pickerLimit = pickerMode === "hole" ? 2 : 5;
  const cardsUsedElsewhere = new Set(pickerMode === "hole" ? validBoard : validHole);
  const buttonCopy = running ? `正在正向枚举 ${Math.round(progress * 100)}%` : !validHole.length ? "请先选择两张底牌" : validBoard.length < 3 ? "请至少选择三张公共牌" : "开始精确计算";

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#calculator" aria-label="Poker Lab 首页"><span className="brand-mark">♠</span><span>POKER LAB</span></a>
        <div className="top-actions"><div className="tagline"><span className="live-dot" />本地正向枚举 · 无随机采样</div><button className="icon-button" type="button" onClick={reset} title="重新开始" aria-label="重新开始">↻</button></div>
      </header>

      <section className="hero">
        <div><p className="eyebrow">EXACT HOLD&apos;EM CALCULATOR</p><h1>每一种可能，<br /><em>全部算进去。</em></h1></div>
        <p className="hero-copy">选择底牌、至少三张公共牌和玩家人数。计算器先完整遍历后续公共牌与随机对手手牌，再用确定性组合公式推算多人结果。</p>
      </section>

      <section className="workspace" id="calculator">
        <div className="input-area">
          <div className="card-panel hole-panel">
            <div className="section-head"><div><span className="step">01</span><h2>你的底牌</h2></div><button className="text-action" type="button" onClick={() => openPicker("hole")}>批量选择</button></div>
            <div className="cards-row">{hole.map((card, index) => <PlayingCard key={index} card={card} disabled={running} label={`底牌 ${index + 1}`} onClick={() => openPicker("hole")} />)}</div>
          </div>

          <div className="card-panel board-panel">
            <div className="section-head"><div><span className="step">02</span><h2>公共牌</h2></div><button className="text-action" type="button" onClick={() => openPicker("board")}>多选后确认</button></div>
            <div className="street-labels"><span>翻牌 FLOP</span><span>转牌 TURN</span><span>河牌 RIVER</span></div>
            <div className="cards-row board">{board.map((card, index) => <PlayingCard key={index} card={card} compact disabled={running} label={`公共牌 ${index + 1}`} onClick={() => openPicker("board")} />)}</div>
          </div>

          <div className="settings-panel exact-settings">
            <div className="setting exact-note"><div><span className="step">03</span><div><h3>正向精确枚举</h3><p>覆盖全部剩余公共牌 × 全部对手两张牌</p></div></div><span className="verified-mark">✓ 无随机数</span></div>
            <div className="setting exact-note"><div><span className="step">04</span><div><h3>总玩家人数</h3><p>包含你自己 · 支持 2–9 人</p></div></div><label className="player-input"><span>人数</span><input type="number" min="2" max="9" step="1" value={players} disabled={running} onChange={(event) => { const value = Number(event.target.value); setPlayers(Number.isFinite(value) ? Math.min(9, Math.max(2, Math.round(value))) : 2); setResult(null); }} /></label></div>
            <button className="calculate" type="button" onClick={calculate} disabled={!ready || running}><span>{buttonCopy}</span><b>{running ? "◌" : "→"}</b>{running && <i className="calculate-progress" style={{ width: `${progress * 100}%` }} />}</button>
            {!ready && <p className="calculation-hint">精确计算从翻牌圈开始；请选择完整的 2 张底牌和至少 3 张公共牌。</p>}
          </div>
        </div>

        <aside className={`result-panel ${result ? "has-result" : ""}`} aria-live="polite">
          {result ? <>
            <div className="result-top"><div><p className="eyebrow">DETERMINISTIC SHOWDOWN</p><h2>{result.method === "exact" ? "精确胜率" : `${result.opponents + 1} 人胜率`}</h2></div><span className="method-badge">{result.method === "exact" ? `${result.samples.toLocaleString()} 种全量牌局` : `${result.samples.toLocaleString()} 种基础牌局 · 组合推算`}</span></div>
            <Ring value={result.equity} />
            <p className="result-label">底池权益 · 已计入多人平局分池</p>
            <div className="outcome-list">
              <div><span><i className="dot win" />获胜</span><strong>{result.win.toFixed(2)}%</strong></div>
              <div><span><i className="dot tie" />平局</span><strong>{result.tie.toFixed(2)}%</strong></div>
              <div><span><i className="dot lose" />落败</span><strong>{result.lose.toFixed(2)}%</strong></div>
            </div>
            <div className="distribution"><div className="distribution-head"><h3>最终牌型分布</h3><span>最常见：{result.bestHand}</span></div>{HAND_NAMES.map((name, index) => result.categories[index] > .004 && <div className="hand-row" key={name}><span>{name}</span><div><i style={{ width: `${Math.max(result.categories[index], .8)}%` }} /></div><strong>{result.categories[index].toFixed(1)}%</strong></div>)}</div>
          </> : <div className="empty-result"><div className="orbit"><span>♠</span></div><p className="eyebrow">EXACT MODE READY</p><h2>{validBoard.length >= 3 ? "牌桌已就绪" : "先选出翻牌"}</h2><p>{validBoard.length >= 3 ? "点击开始后，将完整遍历所有剩余牌局，不做随机抽样。" : "公共牌支持一次多选；选中后再点一次即可取消，最后统一确认。"}</p><div className="mini-guide"><span>1</span> 批量选牌 <b>→</b><span>2</span> 全量枚举 <b>→</b><span>3</span> 精确结果</div></div>}
        </aside>
      </section>

      <section className="leaders-section">
        <div className="leaders-intro"><p className="eyebrow">BOARD LEADERS</p><h2>当前公共牌的<br />前 10 个牌力档位</h2><p>牌力完全相同的手牌会合并在同一行；相同点数的不同花色不再重复占位，而是汇总显示组合数量。</p></div>
        {boardLeaders.length ? <ol className="leaders-list grouped">{boardLeaders.map((group, index) => <li key={group.score.join("-")}><span className="leader-rank">{String(index + 1).padStart(2, "0")}</span><div className="leader-patterns">{group.patterns.slice(0, 3).map((pattern) => <RankPattern key={pattern.ranks.join("-")} ranks={pattern.ranks} combos={pattern.comboCount} />)}{group.patterns.length > 3 && <span className="more-patterns">另有 {group.patterns.length - 3} 种点数组合</span>}</div><strong>{group.handName}<small>{group.comboCount} 组并列</small></strong></li>)}</ol> : <div className="leaders-empty"><span>3+</span><p>选出至少三张公共牌后，十强牌形会在这里自动出现。</p></div>}
      </section>

      <section className="method-section">
        <div><p className="eyebrow">HOW IT WORKS</p><h2>不是模拟，<br />是穷尽所有可能。</h2></div>
        <div className="method-copy"><p>程序固定已知牌，从剩余牌堆正向生成每一种合法的转牌、河牌与单个对手两张牌，并逐局比较最佳五张。多人桌再由这张完整概率表通过封闭组合公式推导，过程不调用随机数，因此重复计算完全一致。</p><p className="fine-print">两人桌为无放回全量精确枚举；多人桌为确定性组合推算，忽略不同对手手牌之间很小的阻断相关性。所有对手均按任意两张未出现的牌等概率持牌，不包含位置和下注范围。</p></div>
      </section>

      {pickerMode && <div className="picker-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPickerMode(null); }}>
        <section className="picker" role="dialog" aria-modal="true" aria-labelledby="picker-title">
          <div className="picker-head"><div><p className="eyebrow">MULTI SELECT</p><h2 id="picker-title">{pickerMode === "hole" ? "批量选择底牌" : "批量选择公共牌"}</h2><p>点击选中，再点一次取消 · 已选 {draftCards.length}/{pickerLimit}</p></div><button className="close-button" type="button" onClick={() => setPickerMode(null)} aria-label="关闭选牌">×</button></div>
          <div className="deck-grid">{SUITS.map((suit) => <div className={`suit-row ${suit.code === "h" || suit.code === "d" ? "red" : ""}`} key={suit.code}><div className="suit-name"><b>{suit.symbol}</b><span>{suit.name}</span></div>{[...RANKS].reverse().map((rank) => { const code = `${rank}${suit.code}`; const isSelected = draftCards.includes(code); const unavailable = cardsUsedElsewhere.has(code) || (!isSelected && draftCards.length >= pickerLimit); return <button type="button" key={code} disabled={unavailable} className={isSelected ? "selected" : ""} aria-pressed={isSelected} onClick={() => toggleDraft(code)}><strong>{rank}</strong><span>{suit.symbol}</span></button>; })}</div>)}</div>
          <div className="picker-foot"><button type="button" className="clear-card" onClick={() => setDraftCards([])}>清空已选</button><span>已用牌自动禁用</span><button type="button" className="confirm-cards" onClick={confirmPicker}>确认 {draftCards.length} 张 <b>→</b></button></div>
        </section>
      </div>}
    </main>
  );
}
