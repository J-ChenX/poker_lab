"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { boardCategoryCatalogue, cardParts, compareScores, evaluate, HAND_NAMES, RANKS, SUITS, type ExactResult, type Score } from "../poker";

// Use Vite's emitted asset URL: vinext rewrites import.meta.url during RSC analysis.
import pokerWorkerUrl from "../poker.worker?worker&url";
import { breakEvenCallAmount } from "../pot-odds";
import type { PokerRequest, PokerResponse } from "../poker-worker-protocol";

const nonNegativeAmount = (input: string) => {
  const value = Number(input);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
};

type PickerMode = "hole" | "board" | null;
type CalculationPhase = "idle" | "estimating" | "simulating" | "done";

function PlayingCard({ card, onClick, label, disabled = false }: { card: string | null; onClick: () => void; label: string; disabled?: boolean }) {
  const parts = card ? cardParts(card) : null;
  return (
    <button type="button" disabled={disabled} aria-label={card ? `${label}：${parts!.name}${parts!.rank}` : `${label}：打开选牌`} className={`playing-card ${!card ? "ghost" : ""} ${parts?.code === "h" || parts?.code === "d" ? "red" : ""}`} onClick={onClick}>
      {parts ? <><span className="card-rank">{parts.rank}</span><span className="card-suit">{parts.symbol}</span></> : <><span className="plus">＋</span><small>选牌</small></>}
    </button>
  );
}

function Ring({ primary, players }: { primary: number; players: number }) {
  const safe = Math.max(0, Math.min(100, primary));
  const physical = 100 / players;
  const multiOnTop = safe <= physical;
  return <div className="equity-ring multi" aria-label={`${players}人胜率 ${safe.toFixed(1)}%，物理胜率 ${physical.toFixed(1)}%`}><span className="ring-track" /><span className="ring-arc ring-arc-multi" style={{ background: `conic-gradient(var(--lime) ${safe * 3.6}deg, transparent 0deg)`, zIndex: multiOnTop ? 3 : 2 }} /><span className="ring-arc ring-arc-physical" style={{ background: `conic-gradient(var(--green) ${physical * 3.6}deg, transparent 0deg)`, zIndex: multiOnTop ? 2 : 3 }} /><div className="ring-center"><span className="ring-label">{players}人胜率</span><div className="ring-primary"><strong>{safe.toFixed(1)}</strong><b>%</b></div><div className="ring-secondary"><strong>{physical.toFixed(1)}%</strong></div></div></div>;
}

const scoreRank = (value: number) => RANKS[value - 2] ?? String(value);
const compactRequirementLabel = (label: string) => label.replace(/\s/g, "");
const displayHandName = (name: string) => name === "一对" ? "对子" : name;
const displayCard = (card: string) => { const parts = cardParts(card); return `${parts.rank}${parts.symbol}`; };

function madeHandRequirement(score: Score, cards: string[], holeCards: string[]) {
  const flushSuit = SUITS.find((suit) => cards.filter((card) => card.endsWith(suit.code)).length >= 5);
  const holeRanks = holeCards.map((card) => cardParts(card).rank);
  const pair = holeRanks[0] === holeRanks[1];
  const label = pair
    ? `对${holeRanks[0]}`
    : score[0] === 1
      ? `对${scoreRank(score[1])}`
      : holeCards.map((card) => { const parts = cardParts(card); return score[0] === 5 || score[0] === 8 ? `${parts.rank}${parts.symbol}` : parts.rank; }).join(" ");
  const strength = score[0] === 8
    ? [score[1], -SUITS.findIndex((suit) => suit.code === flushSuit?.code)]
    : score[0] === 5
      ? [-SUITS.findIndex((suit) => suit.code === flushSuit?.code)]
      : score[0] === 6 || score[0] === 2
        ? [score[1], score[2]]
        : [score[1]];
  return { label, strength };
}

export default function Home() {
  const [hole, setHole] = useState<(string | null)[]>([null, null]);
  const [board, setBoard] = useState<(string | null)[]>([null, null, null, null, null]);
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [draftCards, setDraftCards] = useState<string[]>([]);
  const [result, setResult] = useState<ExactResult | null>(null);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<CalculationPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [playersInput, setPlayersInput] = useState("5");
  const players = Number(playersInput);
  const playersValid = playersInput.trim() !== "" && Number.isInteger(players) && players >= 2 && players <= 12;
  const [potInput, setPotInput] = useState("100");
  const [callInput, setCallInput] = useState("20");
  const potSize = nonNegativeAmount(potInput);
  const callAmount = nonNegativeAmount(callInput);
  const calculationToken = useRef(0);
  const calculationWorker = useRef<Worker | null>(null);
  const [calculationError, setCalculationError] = useState<string | null>(null);
  const [distribution, setDistribution] = useState<{ key: string; result: Extract<PokerResponse, { type: "distribution" }>["result"] } | null>(null);
  const [distributionError, setDistributionError] = useState<{ key: string; message: string } | null>(null);

  const validHole = hole.filter(Boolean) as string[];
  const validBoard = board.filter(Boolean) as string[];
  const cardsReady = validHole.length === 2 && (validBoard.length === 0 || validBoard.length >= 3);
  const ready = cardsReady && playersValid;
  const selectionKey = JSON.stringify([validHole, validBoard]);
  const liveDistribution = distribution?.key === selectionKey ? distribution.result : null;
  useEffect(() => {
    const [hero, selectedBoard] = JSON.parse(selectionKey) as [string[], string[]];
    if (hero.length !== 2 || selectedBoard.length < 3) return;
    let worker: Worker | undefined;
    let active = true;
    const fail = () => {
      if (active) setDistributionError({ key: selectionKey, message: "牌型分布计算失败，请重新选牌" });
      worker?.terminate();
    };
    try {
      worker = new Worker(pokerWorkerUrl, { type: "module" });
      worker.onmessage = ({ data }: MessageEvent<PokerResponse>) => {
        if (!active) return;
        if (data.type === "distribution") {
          setDistribution({ key: selectionKey, result: data.result });
          setDistributionError(null);
        } else if (data.type === "error") fail();
        worker?.terminate();
      };
      worker.onerror = fail;
      worker.onmessageerror = fail;
      worker.postMessage({ type: "distribution", hero, board: selectedBoard } satisfies PokerRequest);
    } catch {
      // Defer state publication just like the worker callbacks.
      queueMicrotask(fail);
    }
    return () => { active = false; worker?.terminate(); };
  }, [selectionKey]);
  useEffect(() => () => {
    calculationToken.current++;
    calculationWorker.current?.terminate();
  }, []);
  const boardCatalogue = useMemo(
    () => boardCategoryCatalogue(board.filter(Boolean) as string[], hole.filter(Boolean) as string[]),
    [board, hole],
  );
  const madeHand = useMemo(() => {
    const selectedHole = hole.filter(Boolean) as string[];
    const selectedBoard = board.filter(Boolean) as string[];
    if (selectedHole.length !== 2 || selectedBoard.length < 3) return null;
    const cards = [...selectedHole, ...selectedBoard];
    const score = evaluate(cards);
    return score[0] >= 1 ? { category: score[0], ...madeHandRequirement(score, cards, selectedHole) } : null;
  }, [board, hole]);

  const cancelCalculation = () => {
    calculationToken.current++;
    calculationWorker.current?.terminate();
    calculationWorker.current = null;
    setCalculationError(null);
    setRunning(false);
    setPhase("idle");
    setProgress(0);
  };

  const openPicker = (mode: Exclude<PickerMode, null>) => {
    setPickerMode(mode);
    setDraftCards(mode === "hole" ? validHole : validBoard);
  };

  const toggleDraft = (card: string) => {
    cancelCalculation();
    setDraftCards((cards) => {
      if (cards.includes(card)) return cards.filter((value) => value !== card);
      const limit = pickerMode === "hole" ? 2 : 5;
      return cards.length < limit ? [...cards, card] : cards;
    });
  };

  const confirmPicker = () => {
    cancelCalculation();
    if (pickerMode === "hole") setHole([...draftCards.slice(0, 2), ...Array(2).fill(null)].slice(0, 2));
    if (pickerMode === "board") setBoard([...draftCards.slice(0, 5), ...Array(5).fill(null)].slice(0, 5));
    setPickerMode(null);
    setResult(null);
  };

  const calculate = () => {
    if (!ready || running) return;
    const token = ++calculationToken.current;
    calculationWorker.current?.terminate();
    setCalculationError(null);
    setRunning(true); setPhase("estimating"); setProgress(0);
    const fail = () => {
      if (calculationToken.current !== token) return;
      calculationWorker.current?.terminate();
      calculationWorker.current = null;
      setRunning(false); setPhase("idle");
      setCalculationError("计算失败，请重试；若仍失败请刷新页面。");
    };
    try {
      const worker = new Worker(pokerWorkerUrl, { type: "module" });
      calculationWorker.current = worker;
      worker.onmessage = ({ data }: MessageEvent<PokerResponse>) => {
        if (calculationToken.current !== token) return;
        if (data.type === "error") { fail(); return; }
        if (data.type === "progress") { setProgress(data.progress); return; }
        if (data.type === "distribution") return;
        setResult(data.result);
        if (data.type === "model") setPhase("simulating");
        if (data.type === "done") {
          worker.terminate();
          calculationWorker.current = null;
          setRunning(false); setPhase("done"); setProgress(1);
        }
      };
      worker.onerror = fail;
      worker.onmessageerror = fail;
      worker.postMessage({ type: "calculate", hero: [...validHole], board: [...validBoard], opponents: players - 1 } satisfies PokerRequest);
    } catch { fail(); }
  };

  const reset = () => {
    cancelCalculation();
    setHole([null, null]); setBoard([null, null, null, null, null]); setResult(null); setPickerMode(null); setProgress(0); setPlayersInput("5"); setPotInput("100"); setCallInput("20");
  };

  const pickerLimit = pickerMode === "hole" ? 2 : 5;
  const cardsUsedElsewhere = new Set(pickerMode === "hole" ? validBoard : validHole);
  const buttonCopy = running ? phase === "estimating" ? "正在生成即时估算" : `正在蒙特卡洛校正 ${Math.round(progress * 100)}%` : !playersValid ? "请输入 2–12 人" : validHole.length !== 2 ? "请先选择两张底牌" : validBoard.length === 1 || validBoard.length === 2 ? "公共牌请选择 0、3、4 或 5 张" : "立即估算并开始精准计算";
  const potOdds = callAmount > 0 ? callAmount / (potSize + callAmount) * 100 : 0;
  const decisionEquity = result?.table?.equity ?? result?.equity ?? 0;
  const equityEdge = result ? decisionEquity - potOdds : 0;
  const callEv = result ? decisionEquity / 100 * (potSize + callAmount) - callAmount : 0;
  const breakEvenCall = breakEvenCallAmount(potSize, decisionEquity);
  const breakEvenLabel = breakEvenCall === null ? (potSize > 0 ? "无有限解（EV 始终为正）" : "任意金额") : breakEvenCall.toFixed(2);
  const decision = !result ? null : callAmount <= 0
    ? { label: decisionEquity >= 55 ? "可以主动下注或加注" : "可以过牌观察", tone: decisionEquity >= 55 ? "raise" : "check" }
    : equityEdge < 0
      ? { label: "不建议跟注", tone: "fold" }
      : decisionEquity >= 55 && equityEdge >= 10
        ? { label: "优先考虑加注", tone: "raise" }
        : { label: "可以跟注", tone: "call" };
  const futureCards = Math.max(0, 5 - validBoard.length);
  const calculation = result?.table ?? result;
  const conditionalWin = result?.conditionalWin;
  const calculationMeta = !calculation ? null : calculation.method === "model_estimate"
    ? running ? "即时共享牌堆模型（4,096 个低差异样本）· 后台蒙特卡洛正在校正" : "即时共享牌堆模型（4,096 个低差异样本）"
    : calculation.method === "monte_carlo"
    ? `${calculation.samples!.toLocaleString()} 次无放回模拟 · 权益 95% 误差 ±${calculation.margin95!.toFixed(2)}%`
    : calculation.method === "preflop_monte_carlo"
      ? `${calculation.samples!.toLocaleString()} 次翻牌前模拟校准`
      : `${calculation.samples?.toLocaleString() ?? "—"} 种无放回精确结果`;

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#calculator" aria-label="Poker Lab 首页"><span className="brand-mark">♠</span><span>POKER LAB</span></a>
        <div className="top-actions"><div className="tagline"><span className="live-dot" />即时估算 · 后台 50 万次精准校正</div><button className="icon-button" type="button" onClick={reset} title="重新开始" aria-label="重新开始">↻</button></div>
      </header>

      <section className="workspace" id="calculator">
        <div className="input-area">
          <div className="card-panel hole-panel">
            <div className="section-head"><div><span className="step">01</span><h2>你的底牌</h2></div></div>
            <div className="cards-row">{hole.map((card, index) => <PlayingCard key={index} card={card} label={`底牌 ${index + 1}`} onClick={() => openPicker("hole")} />)}</div>
          </div>

          <div className="card-panel board-panel">
            <div className="section-head"><div><span className="step">02</span><h2>公共牌</h2></div></div>
            <div className="board-streets">
              <div className="street-group"><span>翻牌 FLOP</span><div className="street-cards">{board.slice(0, 3).map((card, index) => <PlayingCard key={index} card={card} label={`公共牌 ${index + 1}`} onClick={() => openPicker("board")} />)}</div></div>
              <div className="street-group"><span>转牌 TURN</span><div className="street-cards"><PlayingCard card={board[3]} label="公共牌 4" onClick={() => openPicker("board")} /></div></div>
              <div className="street-group"><span>河牌 RIVER</span><div className="street-cards"><PlayingCard card={board[4]} label="公共牌 5" onClick={() => openPicker("board")} /></div></div>
            </div>
          </div>

          <div className="table-controls">
            <div className="controls-head"><div><span className="step">03</span><div><h3>牌桌参数</h3><p>人数包含你自己 · 金额单位保持一致即可</p></div></div><div className="odds-inline"><span>所需底池赔率</span><strong>{potOdds.toFixed(1)}%</strong></div></div>
            <div className="controls-row">
              <label className="control-field"><span>总玩家人数</span><div><b>人数</b><input type="number" min="2" max="12" step="1" value={playersInput} aria-invalid={!playersValid} aria-describedby={!playersValid ? "players-hint" : undefined} onChange={(event) => { cancelCalculation(); setPlayersInput(event.target.value); setResult(null); }} /></div></label>
              <label className="control-field"><span>当前底池</span><div><b>◎</b><input type="number" min="0" step="1" value={potInput} onChange={(event) => setPotInput(event.target.value)} onBlur={(event) => setPotInput(String(nonNegativeAmount(event.currentTarget.value)))} /></div></label>
              <label className="control-field"><span>需要投入 / 跟注</span><div><b>＋</b><input type="number" min="0" step="1" value={callInput} onChange={(event) => setCallInput(event.target.value)} onBlur={(event) => setCallInput(String(nonNegativeAmount(event.currentTarget.value)))} /></div></label>
            </div>
            <button className="calculate" type="button" onClick={calculate} disabled={!ready || running}><span>{buttonCopy}</span><b>{running ? "◌" : "→"}</b>{running && <i className="calculate-progress" style={{ width: `${progress * 100}%` }} />}</button>
            {calculationError && <p className="calculation-hint" role="alert">{calculationError}</p>}
            {!playersValid && <p id="players-hint" className="calculation-hint">请输入 2–12 之间的整数人数。</p>}
            {!cardsReady && <p className="calculation-hint">请选择完整的 2 张底牌；公共牌可以为 0、3、4 或 5 张。</p>}
          </div>
        </div>

        <aside className={`result-panel ${result ? "has-result" : ""}`} aria-live="polite">
          {result ? <>
            <div className="result-top"><p className="eyebrow">HAND-BY-HAND COMPARISON</p></div>
            <Ring primary={result.table?.win ?? result.win} players={result.opponents + 1} />
            <div className="outcome-list">
              <div><span><i className="dot win" />比你小 · 胜</span><strong>{result.win.toFixed(2)}%</strong>{result.winHands !== undefined && <small>{result.winHands.toLocaleString()} 手</small>}</div>
              <div><span><i className="dot tie" />完全相同 · 平</span><strong>{result.tie.toFixed(2)}%</strong>{result.tieHands !== undefined && <small>{result.tieHands.toLocaleString()} 手</small>}</div>
              <div><span><i className="dot lose" />比你大 · 败</span><strong>{result.lose.toFixed(2)}%</strong>{result.loseHands !== undefined && <small>{result.loseHands.toLocaleString()} 手</small>}</div>
            </div>
            {calculationMeta && <p className="calculation-meta">{calculationMeta}</p>}
            {decision && <div className={`decision-card ${decision.tone}`}><div><p>决策辅助</p><h3>{decision.label}</h3></div><div className="decision-metrics"><span>{result.table ? "多人桌权益" : "手牌权益"} <b>{decisionEquity.toFixed(1)}%</b></span><span>底池赔率 <b>{potOdds.toFixed(1)}%</b></span><span>跟注 EV <b className={callEv >= 0 ? "positive" : "negative"}>{callEv >= 0 ? "+" : ""}{callEv.toFixed(1)}</b></span><span className="breakeven-metric" title="按当前权益计算；当前底池包含对手已投入的筹码，不含本次跟注。金额单位与底池一致。">EV 为 0 的跟注金额 <b>{breakEvenLabel}</b></span></div>{decision.tone === "raise" && potSize > 0 && <p>价值下注参考：约 {Math.round(potSize * .5)}–{Math.round(potSize * .75)}；实际尺寸仍需结合对手范围与弃牌率。</p>}</div>}
          </> : <div className="empty-result"><div className="orbit"><span>♠</span></div><p className="eyebrow">TWO-STAGE ENGINE READY</p><h2>{validBoard.length >= 3 ? "牌桌已就绪" : "翻牌前也可计算"}</h2><p>点击后立即显示数学模型估算，并在后台以 50 万次无放回蒙特卡洛更新为最终概率。</p><div className="mini-guide"><span>1</span> 选择底牌 <b>→</b><span>2</span> 即时估算 <b>→</b><span>3</span> 精准校正</div></div>}
        </aside>
      </section>

      <section className="leaders-section catalogue-section">
        <div className="leaders-intro live-distribution-intro"><p className="eyebrow">LIVE HAND DISTRIBUTION</p>{liveDistribution ? <><div className="live-mini-head"><div><span>公共牌 + {liveDistribution.drawCount} 张组合</span><strong>最常见：{liveDistribution.bestHand === "一对" ? "对子" : liveDistribution.bestHand}</strong></div><small>{liveDistribution.samples.toLocaleString()} 种组合结果</small></div><div className="live-probability-list">{HAND_NAMES.map((name, index) => ({ name, value: liveDistribution.categories[index] })).filter(({ value }) => value > 0).reverse().map(({ name, value }) => <div className="live-probability-row" key={name}><span>{name === "一对" ? "对子" : name}</span><div><i style={{ width: `${value}%` }} /></div><strong>{value.toFixed(1)}%</strong></div>)}</div><p className="live-note">从剩余牌中组合补足到 7 张，已排除你的两张底牌；每次选牌后自动更新。</p></> : <div className="live-intro-empty"><span>3+</span><h2>九类牌型概率</h2><p>{validHole.length === 2 && validBoard.length >= 3 ? (distributionError?.key === selectionKey ? distributionError.message : "正在计算牌型分布…") : "选择两张底牌与至少三张公共牌后实时出现。"}</p></div>}</div>
        {validBoard.length >= 3 ? <div className="category-catalogue">{boardCatalogue.filter((section) => section.variants.length > 0 || madeHand?.category === section.category).map((section, index) => { const isMyHand = madeHand?.category === section.category; const variants = isMyHand ? section.variants.filter((variant) => compactRequirementLabel(variant.label) !== compactRequirementLabel(madeHand.label)) : section.variants; const items = [...variants.map((variant) => ({ type: "variant" as const, strength: variant.strength, variant })), ...(isMyHand ? [{ type: "hero" as const, strength: madeHand.strength }] : [])].sort((first, second) => compareScores(second.strength, first.strength)); return <article className="catalogue-row" key={section.category}><div className="catalogue-title"><span>{String(index + 1).padStart(2, "0")}</span><h3>{section.name === "一对" ? "对子" : section.name}</h3><small>{`${items.length} 种牌力`}</small></div><div className="variant-list">{items.map((item) => item.type === "hero" ? <div className="variant-chip hero-made-chip" key="hero-made-hand"><strong>{madeHand!.label}</strong><span>我的牌</span></div> : <div className={`variant-chip ${item.variant.suitCode === "h" || item.variant.suitCode === "d" ? "red" : ""}`} key={item.variant.key}><strong>{item.variant.label}</strong><span>{item.variant.comboCount} 组底牌</span></div>)}</div></article>; })}</div> : <div className="leaders-empty"><span>3+</span><p>选出至少三张公共牌后，八类牌型及其全部可能档位会在这里自动出现。</p></div>}
      </section>

      {result && validBoard.length >= 3 && <section className="turnaround-section" aria-label="转机与弃牌分析">
        <div className="turnaround-head">
          <div><p className="eyebrow">MULTIWAY WIN BUCKETS</p><span className={`turnaround-status ${futureCards ? "is-positive" : "is-caution"}`}>{futureCards ? !conditionalWin ? "正在建模" : conditionalWin.source === "monte_carlo" ? "蒙特卡洛精算值" : "数学模型即时值" : "最终牌面"}</span><h2>{futureCards ? "未来牌后的多人胜率区间" : "公共牌已发完，没有后续转机"}</h2><p>{futureCards ? <>每张未来公共牌都会按当前 <strong>{result.opponents + 1} 人桌</strong>重新建模；区域互斥显示 40–60%、60–80%、&gt;80%，顶部数量累计显示 &gt;40%、&gt;60%、&gt;80%。</> : <>当前最终牌型为 <strong>{displayHandName(HAND_NAMES[evaluate([...validHole, ...validBoard])[0]])}</strong>，行动只依据最终权益、底池赔率与 EV。</>}</p></div>
          <div className={`turnaround-action ${equityEdge >= 0 || callAmount <= 0 ? "is-positive" : "is-negative"}`}><span>多人桌行动建议</span><strong>{decision?.label ?? "等待计算"}</strong><small>{decisionEquity.toFixed(1)}% 多人桌权益 / {potOdds.toFixed(1)}% 底池赔率</small></div>
        </div>
        {futureCards > 0 && !conditionalWin && <div className="tier-loading"><strong>正在生成多人胜率数学模型</strong><span>即时模型完成后先显示，再由 50 万次蒙特卡洛更新细节。</span></div>}
        {futureCards > 0 && conditionalWin && <div className="percentile-grid">{conditionalWin.ranges.map((range) => <article className="percentile-tier" key={range.min}>
          <div className="percentile-tier-head"><span>区域：{range.label}</span><strong>&gt;{range.min}%：{range.cumulativeOuts} 张</strong><small>{range.cumulativeOuts}/{conditionalWin.availableCards} · {range.cumulativeProbability.toFixed(1)}%；最终牌面 &gt;{range.min}%：{range.cumulativeRunouts}/{conditionalWin.totalRunouts}</small></div>
          <div className={`tier-route-metrics ${conditionalWin.cardsRemaining === 1 ? "single" : ""}`}>
            <div><span>下一张落在 {range.label}</span><strong>{(range.oneCardOuts.length / conditionalWin.availableCards * 100).toFixed(1)}%</strong><small>{range.oneCardOuts.length} / {conditionalWin.availableCards} 张</small></div>
            {conditionalWin.cardsRemaining === 2 && <div><span>必须 2 张后落在本区间</span><strong>{range.twoCardProbability.toFixed(1)}%</strong><small>{range.twoCardCombos.length} / {conditionalWin.totalRunouts} 组组合</small></div>}
          </div>
          <div className="tier-outs"><span>{range.label} 的单张公共牌</span>{range.oneCardOuts.length ? <div className="out-card-list equity-out-list">{range.oneCardOuts.map(({ card, winRate }) => { const parts = cardParts(card); return <span className={parts.code === "h" || parts.code === "d" ? "red" : ""} key={card}><b>{displayCard(card)}</b><small>{winRate.toFixed(1)}%</small></span>; })}</div> : <small>没有单张公共牌落入 {range.label}</small>}</div>
          {conditionalWin.cardsRemaining === 2 && <div className="tier-combos"><span>仅两张组合后落入 {range.label}</span>{range.twoCardCombos.length ? <div>{range.twoCardCombos.slice(0, 12).map(({ cards: [first, second], winRate }) => <b key={`${first}|${second}`}>{displayCard(first)} + {displayCard(second)} <small>{winRate.toFixed(1)}%</small></b>)}{range.twoCardCombos.length > 12 && <em>另有 {range.twoCardCombos.length - 12} 组</em>}</div> : <small>没有额外的两张组合</small>}</div>}
        </article>)}</div>}
        <div className="turnaround-decision"><strong>{callAmount <= 0 ? futureCards ? "无需付费看下一张：" : "最终牌面可过牌：" : equityEdge >= 0 ? "当前价格可行：" : "当前价格不可行："}</strong><span>{callAmount <= 0 ? futureCards ? "可以过牌观察，并按上方三个档位评估后续牌。" : "无需投入额外筹码，按最终牌力决定是否价值下注。" : equityEdge >= 0 ? `权益高于底池赔率 ${Math.abs(equityEdge).toFixed(1)} 个百分点，跟注 EV 为 +${callEv.toFixed(1)}。` : futureCards ? `权益低于底池赔率 ${Math.abs(equityEdge).toFixed(1)} 个百分点，跟注 EV 为 ${callEv.toFixed(1)}；即使存在达标牌，也不值得按当前价格追牌。` : `最终权益低于底池赔率 ${Math.abs(equityEdge).toFixed(1)} 个百分点，跟注 EV 为 ${callEv.toFixed(1)}，不建议跟注。`}</span></div>
        <p className="turnaround-note">{futureCards ? "数学模型先精确枚举固定牌面的全部单个对手底牌；两名对手使用不相交组合精确计算，更多对手使用 4,096 个低差异共享牌堆样本。随后 50 万次共享牌堆蒙特卡洛按同一分区替换细节。平局不计为胜。剩 1 张时分母为 46；剩 2 张时，下一张分母为 47，最终牌面以 C(47,2)=1,081 组组合汇总。" : "公共牌已经发完，不再计算未来牌或转机概率。"} 结果未包含对手范围、位置与后续下注。</p>
      </section>}

      {pickerMode && <div className="picker-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPickerMode(null); }}>
        <section className="picker" role="dialog" aria-modal="true" aria-labelledby="picker-title">
          <div className="picker-head"><div><p className="eyebrow">SELECT CARDS</p><h2 id="picker-title">{pickerMode === "hole" ? "选择底牌" : "选择公共牌"}</h2><p>点击选中，再点一次取消 · 已选 {draftCards.length}/{pickerLimit}</p></div><button className="close-button" type="button" onClick={() => setPickerMode(null)} aria-label="关闭选牌">×</button></div>
          <div className="deck-grid">{SUITS.map((suit) => <div className={`suit-row ${suit.code === "h" || suit.code === "d" ? "red" : ""}`} key={suit.code}><div className="suit-name"><b>{suit.symbol}</b><span>{suit.name}</span></div>{[...RANKS].reverse().map((rank) => { const code = `${rank}${suit.code}`; const isSelected = draftCards.includes(code); const unavailable = cardsUsedElsewhere.has(code) || (!isSelected && draftCards.length >= pickerLimit); return <button type="button" key={code} disabled={unavailable} className={isSelected ? "selected" : ""} aria-pressed={isSelected} onClick={() => toggleDraft(code)}><strong>{rank}</strong><span>{suit.symbol}</span></button>; })}</div>)}</div>
          <div className="picker-foot"><button type="button" className="clear-card" onClick={() => { cancelCalculation(); setDraftCards([]); }}>清空已选</button><span>修改选牌会立即停止旧计算</span><button type="button" className="confirm-cards" onClick={confirmPicker}>确认 {draftCards.length} 张 <b>→</b></button></div>
        </section>
      </div>}
    </main>
  );
}
