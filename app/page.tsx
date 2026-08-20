"use client";

import { useMemo, useState } from "react";
import { cardParts, enumerateExact, HAND_NAMES, RANKS, SUITS, topBoardHands, type ExactResult } from "./poker";

type PickerMode = "hole" | "board" | null;

function PlayingCard({ card, onClick, compact = false, label, disabled = false }: { card: string | null; onClick: () => void; compact?: boolean; label: string; disabled?: boolean }) {
  const parts = card ? cardParts(card) : null;
  return (
    <button type="button" disabled={disabled} aria-label={card ? `${label}：${parts!.name}${parts!.rank}` : `${label}：打开批量选牌`} className={`playing-card ${compact ? "compact" : ""} ${!card ? "ghost" : ""} ${parts?.code === "h" || parts?.code === "d" ? "red" : ""}`} onClick={onClick}>
      {parts ? <><span className="card-rank">{parts.rank}</span><span className="card-suit">{parts.symbol}</span></> : <><span className="plus">＋</span><small>选牌</small></>}
    </button>
  );
}

function CardToken({ card }: { card: string }) {
  const parts = cardParts(card);
  return <span className={`card-token ${parts.code === "h" || parts.code === "d" ? "red" : ""}`}><b>{parts.rank}</b>{parts.symbol}</span>;
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

  const validHole = hole.filter(Boolean) as string[];
  const validBoard = board.filter(Boolean) as string[];
  const ready = validHole.length === 2 && validBoard.length >= 3;
  const boardLeaders = useMemo(
    () => topBoardHands(board.filter(Boolean) as string[], hole.filter(Boolean) as string[]),
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
    try { setResult(await enumerateExact(validHole, validBoard, setProgress)); }
    finally { setRunning(false); setProgress(1); }
  };

  const reset = () => {
    if (running) return;
    setHole([null, null]); setBoard([null, null, null, null, null]); setResult(null); setPickerMode(null); setProgress(0);
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
        <p className="hero-copy">选择底牌和至少三张公共牌，计算器逐一遍历所有后续公共牌与对手手牌，给出没有抽样误差的单挑结果。</p>
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
            <div className="setting exact-note"><div><span className="step">04</span><div><h3>单挑 · 随机范围</h3><p>对手可能持有任意两张未出现的牌</p></div></div><span className="verified-mark neutral">1 VS 1</span></div>
            <button className="calculate" type="button" onClick={calculate} disabled={!ready || running}><span>{buttonCopy}</span><b>{running ? "◌" : "→"}</b>{running && <i className="calculate-progress" style={{ width: `${progress * 100}%` }} />}</button>
            {!ready && <p className="calculation-hint">精确计算从翻牌圈开始；请选择完整的 2 张底牌和至少 3 张公共牌。</p>}
          </div>
        </div>

        <aside className={`result-panel ${result ? "has-result" : ""}`} aria-live="polite">
          {result ? <>
            <div className="result-top"><div><p className="eyebrow">EXACT SHOWDOWN</p><h2>精确胜率</h2></div><span className="method-badge">{result.samples.toLocaleString()} 种牌局</span></div>
            <Ring value={result.equity} />
            <p className="result-label">底池权益 · 已计入平局分池</p>
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
        <div className="leaders-intro"><p className="eyebrow">BOARD LEADERS</p><h2>当前公共牌的<br />最强 10 组手牌</h2><p>从所有尚未出现的两张手牌中，按当前已成牌力由强到弱排列。已知的你的底牌不会出现在榜单中。</p></div>
        {boardLeaders.length ? <ol className="leaders-list">{boardLeaders.map((hand, index) => <li key={hand.cards.join("")}><span className="leader-rank">{String(index + 1).padStart(2, "0")}</span><div className="leader-cards"><CardToken card={hand.cards[0]} /><CardToken card={hand.cards[1]} /></div><strong>{hand.handName}</strong></li>)}</ol> : <div className="leaders-empty"><span>3+</span><p>选出至少三张公共牌后，十强牌形会在这里自动出现。</p></div>}
      </section>

      <section className="method-section">
        <div><p className="eyebrow">HOW IT WORKS</p><h2>不是模拟，<br />是穷尽所有可能。</h2></div>
        <div className="method-copy"><p>程序固定已知牌，从剩余牌堆正向生成每一种合法的转牌、河牌与对手两张牌，并逐局比较七张牌中的最佳五张。每一种结果都被计数一次，因此重复计算会得到完全相同的答案。</p><p className="fine-print">为了保持浏览器内可完成的精确计算，本模式限定为单挑并从翻牌圈开始。结果假设对手在所有未出现的两张牌中等概率持牌，不包含位置和下注范围。</p></div>
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
