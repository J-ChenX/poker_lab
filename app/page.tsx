"use client";

import { useMemo, useState } from "react";
import { cardParts, HAND_NAMES, RANKS, simulate, SUITS, type SimulationResult } from "./poker";

type Slot = { zone: "hole" | "board"; index: number } | null;
function PlayingCard({ card, onClick, compact = false, label }: { card: string | null; onClick: () => void; compact?: boolean; label: string }) {
  const parts = card ? cardParts(card) : null;
  return (
    <button type="button" aria-label={card ? `${label}：${parts!.name}${parts!.rank}` : `${label}：选择一张牌`} className={`playing-card ${compact ? "compact" : ""} ${!card ? "ghost" : ""} ${parts?.code === "h" || parts?.code === "d" ? "red" : ""}`} onClick={onClick}>
      {parts ? <><span className="card-rank">{parts.rank}</span><span className="card-suit">{parts.symbol}</span></> : <><span className="plus">＋</span><small>选牌</small></>}
    </button>
  );
}

function Ring({ value }: { value: number }) {
  const safe = Math.max(0, Math.min(100, value));
  return <div className="equity-ring" style={{ background: `conic-gradient(var(--lime) ${safe * 3.6}deg, #34413b 0deg)` }}><div><strong>{safe.toFixed(1)}</strong><span>%</span></div></div>;
}

export default function Home() {
  const [hole, setHole] = useState<(string | null)[]>(["As", "Kh"]);
  const [board, setBoard] = useState<(string | null)[]>([null, null, null, null, null]);
  const [activeSlot, setActiveSlot] = useState<Slot>(null);
  const [opponents, setOpponents] = useState(1);
  const [iterations, setIterations] = useState(20000);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [running, setRunning] = useState(false);

  const selected = useMemo(() => new Set([...hole, ...board].filter(Boolean) as string[]), [hole, board]);
  const validBoard = board.filter(Boolean) as string[];
  const ready = hole.every(Boolean);

  const chooseCard = (card: string) => {
    if (!activeSlot) return;
    if (activeSlot.zone === "hole") setHole((cards) => cards.map((value, index) => index === activeSlot.index ? card : value));
    else setBoard((cards) => cards.map((value, index) => index === activeSlot.index ? card : value));
    setActiveSlot(null);
    setResult(null);
  };

  const clearActive = () => {
    if (!activeSlot) return;
    if (activeSlot.zone === "hole") setHole((cards) => cards.map((value, index) => index === activeSlot.index ? null : value));
    else setBoard((cards) => cards.map((value, index) => index === activeSlot.index ? null : value));
    setActiveSlot(null);
    setResult(null);
  };

  const calculate = () => {
    if (!ready || running) return;
    setRunning(true);
    window.setTimeout(() => {
      setResult(simulate(hole as string[], validBoard, opponents, iterations));
      setRunning(false);
    }, 30);
  };

  const reset = () => {
    setHole([null, null]); setBoard([null, null, null, null, null]); setResult(null); setActiveSlot(null); setOpponents(1);
  };

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#calculator" aria-label="Poker Lab 首页"><span className="brand-mark">♠</span><span>POKER LAB</span></a>
        <div className="top-actions"><div className="tagline"><span className="live-dot" />本地计算 · 数据不上传</div><button className="icon-button" type="button" onClick={reset} title="重新开始" aria-label="重新开始">↻</button></div>
      </header>

      <section className="hero">
        <div><p className="eyebrow">TEXAS HOLD&apos;EM CALCULATOR</p><h1>读懂每一手牌的<br /><em>真实胜率。</em></h1></div>
        <p className="hero-copy">选择你的底牌和牌桌情况，即刻计算对抗随机手牌的胜率、平局率和最终牌型分布。</p>
      </section>

      <section className="workspace" id="calculator">
        <div className="input-area">
          <div className="card-panel hole-panel">
            <div className="section-head"><div><span className="step">01</span><h2>你的底牌</h2></div><span className="helper">必选 · 2 张</span></div>
            <div className="cards-row">{hole.map((card, index) => <PlayingCard key={index} card={card} label={`底牌 ${index + 1}`} onClick={() => setActiveSlot({ zone: "hole", index })} />)}</div>
          </div>

          <div className="card-panel board-panel">
            <div className="section-head"><div><span className="step">02</span><h2>公共牌</h2></div><span className="helper">可选 · 0–5 张</span></div>
            <div className="street-labels"><span>翻牌 FLOP</span><span>转牌 TURN</span><span>河牌 RIVER</span></div>
            <div className="cards-row board">{board.map((card, index) => <PlayingCard key={index} card={card} compact label={`公共牌 ${index + 1}`} onClick={() => setActiveSlot({ zone: "board", index })} />)}</div>
          </div>

          <div className="settings-panel">
            <div className="setting"><div><span className="step">03</span><div><h3>对手人数</h3><p>随机手牌范围</p></div></div><div className="stepper"><button type="button" onClick={() => { setOpponents(Math.max(1, opponents - 1)); setResult(null); }} aria-label="减少对手">−</button><strong>{opponents}</strong><button type="button" onClick={() => { setOpponents(Math.min(8, opponents + 1)); setResult(null); }} aria-label="增加对手">＋</button></div></div>
            <div className="setting accuracy"><div><span className="step">04</span><div><h3>计算精度</h3><p>模拟次数越多，结果越稳定</p></div></div><div className="segmented">{[[5000,"极速"],[20000,"标准"],[50000,"精细"]].map(([value,label]) => <button type="button" key={value} className={iterations === value ? "active" : ""} onClick={() => { setIterations(value as number); setResult(null); }}>{label}</button>)}</div></div>
            <button className="calculate" type="button" onClick={calculate} disabled={!ready || running}><span>{running ? "正在模拟牌局…" : ready ? "开始计算" : "请先选择两张底牌"}</span><b>{running ? "◌" : "→"}</b></button>
          </div>
        </div>

        <aside className={`result-panel ${result ? "has-result" : ""}`} aria-live="polite">
          {result ? <>
            <div className="result-top"><div><p className="eyebrow">SHOWDOWN RESULT</p><h2>胜率分析</h2></div><span className="method-badge">{result.exact ? "精确枚举" : `${result.samples.toLocaleString()} 次模拟`}</span></div>
            <Ring value={result.equity} />
            <p className="result-label">底池权益 · 已计入平局分池</p>
            <div className="outcome-list">
              <div><span><i className="dot win" />获胜</span><strong>{result.win.toFixed(1)}%</strong></div>
              <div><span><i className="dot tie" />平局</span><strong>{result.tie.toFixed(1)}%</strong></div>
              <div><span><i className="dot lose" />落败</span><strong>{result.lose.toFixed(1)}%</strong></div>
            </div>
            <div className="distribution"><div className="distribution-head"><h3>最终牌型分布</h3><span>最常见：{result.bestHand}</span></div>{HAND_NAMES.map((name, index) => result.categories[index] > .04 && <div className="hand-row" key={name}><span>{name}</span><div><i style={{ width: `${Math.max(result.categories[index], .8)}%` }} /></div><strong>{result.categories[index].toFixed(1)}%</strong></div>)}</div>
          </> : <div className="empty-result"><div className="orbit"><span>♠</span></div><p className="eyebrow">READY TO CALCULATE</p><h2>牌桌已就绪</h2><p>确认牌面与对手人数，点击“开始计算”查看胜率、底池权益和牌型分布。</p><div className="mini-guide"><span>1</span> 选择牌面 <b>→</b><span>2</span> 设置人数 <b>→</b><span>3</span> 查看结果</div></div>}
        </aside>
      </section>

      <section className="method-section">
        <div><p className="eyebrow">HOW IT WORKS</p><h2>不是猜测，是把牌局<br />跑上数万遍。</h2></div>
        <div className="method-copy"><p>计算器从剩余牌堆中随机发出未知公共牌和对手手牌，通过蒙特卡洛模拟统计每种结果。单挑且只剩转牌或河牌时，会自动切换为精确枚举。</p><p className="fine-print">结果基于对手持有完全随机手牌，不包含位置、下注行为或特定手牌范围。它适合辅助决策，但不构成任何盈利承诺。</p></div>
      </section>

      {activeSlot && <div className="picker-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveSlot(null); }}>
        <section className="picker" role="dialog" aria-modal="true" aria-labelledby="picker-title">
          <div className="picker-head"><div><p className="eyebrow">CHOOSE A CARD</p><h2 id="picker-title">选择一张牌</h2></div><button className="close-button" type="button" onClick={() => setActiveSlot(null)} aria-label="关闭选牌">×</button></div>
          <div className="deck-grid">{SUITS.map((suit) => <div className={`suit-row ${suit.code === "h" || suit.code === "d" ? "red" : ""}`} key={suit.code}><div className="suit-name"><b>{suit.symbol}</b><span>{suit.name}</span></div>{[...RANKS].reverse().map((rank) => { const code = `${rank}${suit.code}`; const current = activeSlot.zone === "hole" ? hole[activeSlot.index] : board[activeSlot.index]; const unavailable = selected.has(code) && current !== code; return <button type="button" key={code} disabled={unavailable} className={current === code ? "selected" : ""} onClick={() => chooseCard(code)}><strong>{rank}</strong><span>{suit.symbol}</span></button>; })}</div>)}</div>
          <div className="picker-foot"><button type="button" className="clear-card" onClick={clearActive}>清空这个位置</button><span>已用牌会自动禁用</span></div>
        </section>
      </div>}
    </main>
  );
}
