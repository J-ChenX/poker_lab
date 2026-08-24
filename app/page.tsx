"use client";

import { useMemo, useState } from "react";
import { boardCategoryCatalogue, cardParts, enumerateExact, HAND_NAMES, RANKS, SUITS, type ExactResult } from "./poker";
import { preflopResult } from "./preflop";

type PickerMode = "hole" | "board" | null;

function PlayingCard({ card, onClick, compact = false, label, disabled = false }: { card: string | null; onClick: () => void; compact?: boolean; label: string; disabled?: boolean }) {
  const parts = card ? cardParts(card) : null;
  return (
    <button type="button" disabled={disabled} aria-label={card ? `${label}：${parts!.name}${parts!.rank}` : `${label}：打开批量选牌`} className={`playing-card ${compact ? "compact" : ""} ${!card ? "ghost" : ""} ${parts?.code === "h" || parts?.code === "d" ? "red" : ""}`} onClick={onClick}>
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
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [draftCards, setDraftCards] = useState<string[]>([]);
  const [result, setResult] = useState<ExactResult | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [players, setPlayers] = useState(5);
  const [potSize, setPotSize] = useState(100);
  const [callAmount, setCallAmount] = useState(20);

  const validHole = hole.filter(Boolean) as string[];
  const validBoard = board.filter(Boolean) as string[];
  const ready = validHole.length === 2 && (validBoard.length === 0 || validBoard.length >= 3);
  const boardCatalogue = useMemo(
    () => boardCategoryCatalogue(board.filter(Boolean) as string[], hole.filter(Boolean) as string[]),
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
    try {
      if (validBoard.length === 0) { setResult(preflopResult(validHole, players - 1)); setProgress(1); }
      else setResult(await enumerateExact(validHole, validBoard, players - 1, setProgress));
    }
    finally { setRunning(false); setProgress(1); }
  };

  const reset = () => {
    if (running) return;
    setHole([null, null]); setBoard([null, null, null, null, null]); setResult(null); setPickerMode(null); setProgress(0); setPlayers(5); setPotSize(100); setCallAmount(20);
  };

  const pickerLimit = pickerMode === "hole" ? 2 : 5;
  const cardsUsedElsewhere = new Set(pickerMode === "hole" ? validBoard : validHole);
  const exactMultiwayState = players === 3 && validBoard.length >= 4;
  const buttonCopy = running ? `正在无放回枚举 ${Math.round(progress * 100)}%` : validHole.length !== 2 ? "请先选择两张底牌" : validBoard.length === 1 || validBoard.length === 2 ? "公共牌请选择 0、3、4 或 5 张" : validBoard.length === 0 ? "查询翻牌前逐手牌胜率" : exactMultiwayState ? "开始三人桌无放回精确计算" : "开始逐手牌精确计算";
  const potOdds = callAmount > 0 ? callAmount / (potSize + callAmount) * 100 : 0;
  const decisionEquity = result?.table?.equity ?? result?.equity ?? 0;
  const equityEdge = result ? decisionEquity - potOdds : 0;
  const callEv = result ? decisionEquity / 100 * (potSize + callAmount) - callAmount : 0;
  const decision = !result ? null : callAmount <= 0
    ? { label: decisionEquity >= 55 ? "可以主动下注或加注" : "可以过牌观察", tone: decisionEquity >= 55 ? "raise" : "check" }
    : equityEdge < 0
      ? { label: "不建议跟注", tone: "fold" }
      : decisionEquity >= 55 && equityEdge >= 10
        ? { label: "优先考虑加注", tone: "raise" }
        : { label: "可以跟注", tone: "call" };

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#calculator" aria-label="Poker Lab 首页"><span className="brand-mark">♠</span><span>POKER LAB</span></a>
        <div className="top-actions"><div className="tagline"><span className="live-dot" />本地正向枚举 · 无随机采样</div><button className="icon-button" type="button" onClick={reset} title="重新开始" aria-label="重新开始">↻</button></div>
      </header>

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
            <div className="setting exact-note"><div><span className="step">03</span><div><h3>相关性补偿</h3><p>无放回组合 · 多人校准曲线</p></div></div><span className="verified-mark">✓ 页面无抽样</span></div>
            <div className="setting exact-note"><div><span className="step">04</span><div><h3>总玩家人数</h3><p>包含你自己 · 支持 2–9 人</p></div></div><label className="player-input"><span>人数</span><input type="number" min="2" max="9" step="1" value={players} disabled={running} onChange={(event) => { const value = Number(event.target.value); setPlayers(Number.isFinite(value) ? Math.min(9, Math.max(2, Math.round(value))) : 5); setResult(null); }} /></label></div>
            <button className="calculate" type="button" onClick={calculate} disabled={!ready || running}><span>{buttonCopy}</span><b>{running ? "◌" : "→"}</b>{running && <i className="calculate-progress" style={{ width: `${progress * 100}%` }} />}</button>
            {!ready && <p className="calculation-hint">请选择完整的 2 张底牌；公共牌可以为 0、3、4 或 5 张。</p>}
          </div>
          <div className="funding-panel">
            <div className="funding-head"><div><span className="step">05</span><div><h3>底池与投入</h3><p>用于计算底池赔率和跟注 EV</p></div></div><span>金额单位保持一致即可</span></div>
            <label><span>当前底池</span><div><b>◎</b><input type="number" min="0" step="1" value={potSize} onChange={(event) => setPotSize(Math.max(0, Number(event.target.value) || 0))} /></div></label>
            <label><span>需要投入 / 跟注</span><div><b>＋</b><input type="number" min="0" step="1" value={callAmount} onChange={(event) => setCallAmount(Math.max(0, Number(event.target.value) || 0))} /></div></label>
            <div className="odds-preview"><span>所需底池赔率</span><strong>{potOdds.toFixed(1)}%</strong></div>
          </div>
        </div>

        <aside className={`result-panel ${result ? "has-result" : ""}`} aria-live="polite">
          {result ? <>
            <div className="result-top"><div><p className="eyebrow">HAND-BY-HAND COMPARISON</p><h2>单个随机对手</h2></div><span className="method-badge">{result.method === "preflop" ? "169 类逐手牌查表" : `${result.samples.toLocaleString()} 种牌局逐一比较`}</span></div>
            <Ring value={result.win} />
            <p className="result-label">胜率 = 比你小的牌 ÷ 全部可用牌</p>
            <div className="outcome-list">
              <div><span><i className="dot win" />比你小 · 胜</span><strong>{result.win.toFixed(2)}%</strong>{result.winHands !== undefined && <small>{result.winHands.toLocaleString()} 手</small>}</div>
              <div><span><i className="dot tie" />完全相同 · 平</span><strong>{result.tie.toFixed(2)}%</strong>{result.tieHands !== undefined && <small>{result.tieHands.toLocaleString()} 手</small>}</div>
              <div><span><i className="dot lose" />比你大 · 败</span><strong>{result.lose.toFixed(2)}%</strong>{result.loseHands !== undefined && <small>{result.loseHands.toLocaleString()} 手</small>}</div>
            </div>
            {result.table && result.table.method === "exact" && <div className="table-projection exact"><div><span>{result.opponents + 1} 人桌无放回精确胜率</span><strong>{result.table.win.toFixed(2)}%</strong></div><p>{result.table.samples!.toLocaleString()} 个合法牌局全部完成 · 平 {result.table.tie.toFixed(2)}% · 败 {result.table.lose.toFixed(2)}% · 权益 {result.table.equity.toFixed(2)}%</p></div>}
            {result.table && result.table.method !== "exact" && <div className="table-projection approximation"><div><span>{result.opponents + 1} 人桌相关性补偿胜率</span><strong>{result.table.win.toFixed(2)}%</strong></div><p>平 {result.table.tie.toFixed(2)}% · 败 {result.table.lose.toFixed(2)}% · 权益 {result.table.equity.toFixed(2)}%</p><span>{result.table.method === "preflop_compensation" ? "翻牌前：169类起手牌 × 当前人数校准曲线" : "翻牌后：逐牌面的一、二、三手无放回匹配矩"}</span></div>}
            {decision && <div className={`decision-card ${decision.tone}`}><div><p>决策辅助</p><h3>{decision.label}</h3></div><div className="decision-metrics"><span>{result.table ? "多人桌权益" : "手牌权益"} <b>{decisionEquity.toFixed(1)}%</b></span><span>底池赔率 <b>{potOdds.toFixed(1)}%</b></span><span>跟注 EV <b className={callEv >= 0 ? "positive" : "negative"}>{callEv >= 0 ? "+" : ""}{callEv.toFixed(1)}</b></span></div>{decision.tone === "raise" && potSize > 0 && <p>价值下注参考：约 {Math.round(potSize * .5)}–{Math.round(potSize * .75)}；实际尺寸仍需结合对手范围与弃牌率。</p>}</div>}
            {result.categories.some((value) => value > 0) ? <div className="distribution"><div className="distribution-head"><h3>最终牌型分布</h3><span>最常见：{result.bestHand}</span></div>{HAND_NAMES.map((name, index) => result.categories[index] > .004 && <div className="hand-row" key={name}><span>{name}</span><div><i style={{ width: `${Math.max(result.categories[index], .8)}%` }} /></div><strong>{result.categories[index].toFixed(1)}%</strong></div>)}</div> : <div className="preflop-note"><span>{result.bestHand}</span><p>翻牌前结果来自 169 类起手牌穷举表；发出翻牌后可查看最终牌型分布。</p></div>}
          </> : <div className="empty-result"><div className="orbit"><span>♠</span></div><p className="eyebrow">EXACT MODE READY</p><h2>{validBoard.length >= 3 ? "牌桌已就绪" : "翻牌前也可计算"}</h2><p>{validBoard.length >= 3 ? "点击开始后，将完整遍历所有剩余牌局，不做随机抽样。" : "只选择两张底牌即可计算；公共牌仍支持一次多选、再次点击取消。"}</p><div className="mini-guide"><span>1</span> 选择底牌 <b>→</b><span>2</span> 输入资金 <b>→</b><span>3</span> 决策辅助</div></div>}
        </aside>
      </section>

      <section className="leaders-section catalogue-section">
        <div className="leaders-intro"><p className="eyebrow">BOARD CATALOGUE</p><h2>当前公共牌的<br />完整牌型目录</h2><p>固定按同花顺、四条、葫芦、同花、顺子、三条、两对、对子排列；每一类显示实际所需底牌并由大到小排序。</p></div>
        {validBoard.length >= 3 ? <div className="category-catalogue">{boardCatalogue.map((section, index) => <article className={`catalogue-row ${section.variants.length ? "" : "empty"}`} key={section.category}><div className="catalogue-title"><span>{String(index + 1).padStart(2, "0")}</span><h3>{section.name === "一对" ? "对子" : section.name}</h3><small>{section.variants.length ? `${section.variants.length} 种牌力` : "当前无此牌型"}</small></div><div className="variant-list">{section.variants.length ? section.variants.map((variant) => <div className={`variant-chip ${variant.suitCode === "h" || variant.suitCode === "d" ? "red" : ""}`} key={variant.key}><strong>{variant.label}</strong><span>{variant.comboCount} 组底牌</span></div>) : <span className="unavailable">—</span>}</div></article>)}</div> : <div className="leaders-empty"><span>3+</span><p>选出至少三张公共牌后，八类牌型及其全部可能档位会在这里自动出现。</p></div>}
      </section>

      {result?.hope && <section className="hope-card board-hope-section"><div className="hope-head"><div><p>剩余希望</p><h3>{result.hope.competitive.toFixed(1)}% <span>胜算过半牌面</span></h3></div><span>当前：{result.hope.currentHand === "一对" ? "对子" : result.hope.currentHand}</span></div><div className="hope-metrics"><div><span>成牌提升率</span><strong>{result.hope.improve.toFixed(1)}%</strong></div><div><span>提升后平均权益</span><strong>{result.hope.improvedEquity.toFixed(1)}%</strong></div><div><span>未提升平均权益</span><strong>{result.hope.blankEquity.toFixed(1)}%</strong></div></div><div className="hope-next"><span>最有利的下一张牌</span><div>{result.hope.nextCards.map(({ card, equity }) => { const parts = cardParts(card); return <div className={parts.code === "h" || parts.code === "d" ? "red" : ""} key={card}><b>{parts.rank}{parts.symbol}</b><small>{equity.toFixed(1)}% 权益</small></div>; })}</div></div><p className="hope-note">“成牌提升”只表示最终牌型变大，公共牌变化也会计入，并不等于获胜；真正的希望以胜算过半牌面为准，每个牌面均按当前 {result.opponents + 1} 人桌重新比较。</p></section>}

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
