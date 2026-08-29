"use client";

import { useMemo, useRef, useState } from "react";
import { boardCategoryCatalogue, boardCombinationDistribution, cardParts, compareScores, estimateConditionalMultiway, estimateMultiway, evaluate, HAND_NAMES, monteCarloConditionalMultiway, monteCarloHope, MULTIWAY_MONTE_CARLO_SAMPLES, RANKS, simulateMultiway, SUITS, type ExactResult, type Score } from "./poker";

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
  const [players, setPlayers] = useState(5);
  const [potSize, setPotSize] = useState(100);
  const [callAmount, setCallAmount] = useState(20);
  const calculationToken = useRef(0);
  const abortController = useRef<AbortController | null>(null);

  const validHole = hole.filter(Boolean) as string[];
  const validBoard = board.filter(Boolean) as string[];
  const ready = validHole.length === 2 && (validBoard.length === 0 || validBoard.length >= 3);
  const liveDistribution = useMemo(() => {
    const selectedHole = hole.filter(Boolean) as string[];
    const selectedBoard = board.filter(Boolean) as string[];
    return boardCombinationDistribution(selectedHole, selectedBoard);
  }, [board, hole]);
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
    abortController.current?.abort();
    abortController.current = null;
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

  const calculate = async () => {
    if (!ready || running) return;
    const token = ++calculationToken.current;
    const controller = new AbortController();
    abortController.current = controller;
    const selectedHole = [...validHole];
    const selectedBoard = [...validBoard];
    const opponents = players - 1;
    setRunning(true); setPhase("estimating"); setProgress(0);
    try {
      const estimate = estimateMultiway(selectedHole, selectedBoard, opponents);
      setResult(estimate);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (controller.signal.aborted || calculationToken.current !== token) return;
      const modelConditionalWin = estimateConditionalMultiway(selectedHole, selectedBoard, opponents);
      setResult({ ...estimate, conditionalWin: modelConditionalWin });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (controller.signal.aborted || calculationToken.current !== token) return;
      setPhase("simulating");
      const simulation = await simulateMultiway(
        selectedHole,
        selectedBoard,
        opponents,
        MULTIWAY_MONTE_CARLO_SAMPLES,
        (value) => { if (calculationToken.current === token) setProgress(value); },
        controller.signal,
      );
      if (controller.signal.aborted || calculationToken.current !== token) return;
      const { runouts, headsUp, categories, bestHand, ...table } = simulation;
      const hope = selectedBoard.length >= 3 && selectedBoard.length < 5
        ? monteCarloHope(runouts, evaluate([...selectedHole, ...selectedBoard]), [...selectedHole, ...selectedBoard])
        : undefined;
      const conditionalWin = selectedBoard.length >= 3 && selectedBoard.length < 5
        ? monteCarloConditionalMultiway(runouts, [...selectedHole, ...selectedBoard])
        : undefined;
      setResult({ ...estimate, ...headsUp, categories, bestHand, table, hope, conditionalWin });
    }
    catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) console.error(error);
    }
    finally {
      if (calculationToken.current === token) {
        abortController.current = null;
        setRunning(false); setPhase("done"); setProgress(1);
      }
    }
  };

  const reset = () => {
    cancelCalculation();
    setHole([null, null]); setBoard([null, null, null, null, null]); setResult(null); setPickerMode(null); setProgress(0); setPlayers(5); setPotSize(100); setCallAmount(20);
  };

  const pickerLimit = pickerMode === "hole" ? 2 : 5;
  const cardsUsedElsewhere = new Set(pickerMode === "hole" ? validBoard : validHole);
  const buttonCopy = running ? phase === "estimating" ? "正在生成即时估算" : `正在蒙特卡洛校正 ${Math.round(progress * 100)}%` : validHole.length !== 2 ? "请先选择两张底牌" : validBoard.length === 1 || validBoard.length === 2 ? "公共牌请选择 0、3、4 或 5 张" : "立即估算并开始精准计算";
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
  const futureCards = Math.max(0, 5 - validBoard.length);
  const calculation = result?.table ?? result;
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
              <label className="control-field"><span>总玩家人数</span><div><b>人数</b><input type="number" min="2" max="9" step="1" value={players} onChange={(event) => { cancelCalculation(); const value = Number(event.target.value); setPlayers(Number.isFinite(value) ? Math.min(9, Math.max(2, Math.round(value))) : 5); setResult(null); }} /></div></label>
              <label className="control-field"><span>当前底池</span><div><b>◎</b><input type="number" min="0" step="1" value={potSize} onChange={(event) => setPotSize(Math.max(0, Number(event.target.value) || 0))} /></div></label>
              <label className="control-field"><span>需要投入 / 跟注</span><div><b>＋</b><input type="number" min="0" step="1" value={callAmount} onChange={(event) => setCallAmount(Math.max(0, Number(event.target.value) || 0))} /></div></label>
            </div>
            <button className="calculate" type="button" onClick={calculate} disabled={!ready || running}><span>{buttonCopy}</span><b>{running ? "◌" : "→"}</b>{running && <i className="calculate-progress" style={{ width: `${progress * 100}%` }} />}</button>
            {!ready && <p className="calculation-hint">请选择完整的 2 张底牌；公共牌可以为 0、3、4 或 5 张。</p>}
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
            {decision && <div className={`decision-card ${decision.tone}`}><div><p>决策辅助</p><h3>{decision.label}</h3></div><div className="decision-metrics"><span>{result.table ? "多人桌权益" : "手牌权益"} <b>{decisionEquity.toFixed(1)}%</b></span><span>底池赔率 <b>{potOdds.toFixed(1)}%</b></span><span>跟注 EV <b className={callEv >= 0 ? "positive" : "negative"}>{callEv >= 0 ? "+" : ""}{callEv.toFixed(1)}</b></span></div>{decision.tone === "raise" && potSize > 0 && <p>价值下注参考：约 {Math.round(potSize * .5)}–{Math.round(potSize * .75)}；实际尺寸仍需结合对手范围与弃牌率。</p>}</div>}
          </> : <div className="empty-result"><div className="orbit"><span>♠</span></div><p className="eyebrow">TWO-STAGE ENGINE READY</p><h2>{validBoard.length >= 3 ? "牌桌已就绪" : "翻牌前也可计算"}</h2><p>点击后立即显示数学模型估算，并在后台以 50 万次无放回蒙特卡洛更新为最终概率。</p><div className="mini-guide"><span>1</span> 选择底牌 <b>→</b><span>2</span> 即时估算 <b>→</b><span>3</span> 精准校正</div></div>}
        </aside>
      </section>

      <section className="leaders-section catalogue-section">
        <div className="leaders-intro live-distribution-intro"><p className="eyebrow">LIVE HAND DISTRIBUTION</p>{liveDistribution ? <><div className="live-mini-head"><div><span>公共牌 + {liveDistribution.drawCount} 张组合</span><strong>最常见：{liveDistribution.bestHand === "一对" ? "对子" : liveDistribution.bestHand}</strong></div><small>{liveDistribution.samples.toLocaleString()} 种组合结果</small></div><div className="live-probability-list">{HAND_NAMES.map((name, index) => ({ name, value: liveDistribution.categories[index] })).filter(({ value }) => value > 0).reverse().map(({ name, value }) => <div className="live-probability-row" key={name}><span>{name === "一对" ? "对子" : name}</span><div><i style={{ width: `${value}%` }} /></div><strong>{value.toFixed(1)}%</strong></div>)}</div><p className="live-note">从剩余牌中组合补足到 7 张，已排除你的两张底牌；每次选牌后自动更新。</p></> : <div className="live-intro-empty"><span>3+</span><h2>九类牌型概率</h2><p>选择两张底牌与至少三张公共牌后实时出现。</p></div>}</div>
        {validBoard.length >= 3 ? <div className="category-catalogue">{boardCatalogue.filter((section) => section.variants.length > 0 || madeHand?.category === section.category).map((section, index) => { const isMyHand = madeHand?.category === section.category; const variants = isMyHand ? section.variants.filter((variant) => compactRequirementLabel(variant.label) !== compactRequirementLabel(madeHand.label)) : section.variants; const items = [...variants.map((variant) => ({ type: "variant" as const, strength: variant.strength, variant })), ...(isMyHand ? [{ type: "hero" as const, strength: madeHand.strength }] : [])].sort((first, second) => compareScores(second.strength, first.strength)); return <article className="catalogue-row" key={section.category}><div className="catalogue-title"><span>{String(index + 1).padStart(2, "0")}</span><h3>{section.name === "一对" ? "对子" : section.name}</h3><small>{`${items.length} 种牌力`}</small></div><div className="variant-list">{items.map((item) => item.type === "hero" ? <div className="variant-chip hero-made-chip" key="hero-made-hand"><strong>{madeHand!.label}</strong><span>我的牌</span></div> : <div className={`variant-chip ${item.variant.suitCode === "h" || item.variant.suitCode === "d" ? "red" : ""}`} key={item.variant.key}><strong>{item.variant.label}</strong><span>{item.variant.comboCount} 组底牌</span></div>)}</div></article>; })}</div> : <div className="leaders-empty"><span>3+</span><p>选出至少三张公共牌后，八类牌型及其全部可能档位会在这里自动出现。</p></div>}
      </section>

      {result && validBoard.length >= 3 && <section className="turnaround-section" aria-label="转机与弃牌分析">
        <div className="turnaround-head">
          <div><p className="eyebrow">MULTIWAY WIN BUCKETS</p><span className={`turnaround-status ${futureCards ? "is-positive" : "is-caution"}`}>{futureCards ? !result.conditionalWin ? "正在建模" : result.conditionalWin.source === "monte_carlo" ? "蒙特卡洛精算值" : "数学模型即时值" : "最终牌面"}</span><h2>{futureCards ? "未来牌后的多人胜率区间" : "公共牌已发完，没有后续转机"}</h2><p>{futureCards ? <>每张未来公共牌都会按当前 <strong>{result.opponents + 1} 人桌</strong>重新建模；区域互斥显示 40–60%、60–80%、&gt;80%，顶部数量累计显示 &gt;40%、&gt;60%、&gt;80%。</> : <>当前最终牌型为 <strong>{displayHandName(HAND_NAMES[evaluate([...validHole, ...validBoard])[0]])}</strong>，行动只依据最终权益、底池赔率与 EV。</>}</p></div>
          <div className={`turnaround-action ${equityEdge >= 0 || callAmount <= 0 ? "is-positive" : "is-negative"}`}><span>多人桌行动建议</span><strong>{decision?.label ?? "等待计算"}</strong><small>{decisionEquity.toFixed(1)}% 多人桌权益 / {potOdds.toFixed(1)}% 底池赔率</small></div>
        </div>
        {futureCards > 0 && !result.conditionalWin && <div className="tier-loading"><strong>正在生成多人胜率数学模型</strong><span>即时模型完成后先显示，再由 50 万次蒙特卡洛更新细节。</span></div>}
        {futureCards > 0 && result.conditionalWin && <div className="percentile-grid">{result.conditionalWin.ranges.map((range) => <article className="percentile-tier" key={range.min}>
          <div className="percentile-tier-head"><span>区域：{range.label}</span><strong>&gt;{range.min}%：{range.cumulativeOuts} 张</strong><small>{range.cumulativeOuts}/{result.conditionalWin!.availableCards} · {range.cumulativeProbability.toFixed(1)}%；最终牌面 &gt;{range.min}%：{range.cumulativeRunouts}/{result.conditionalWin!.totalRunouts}</small></div>
          <div className={`tier-route-metrics ${result.conditionalWin.cardsRemaining === 1 ? "single" : ""}`}>
            <div><span>下一张落在 {range.label}</span><strong>{(range.oneCardOuts.length / result.conditionalWin.availableCards * 100).toFixed(1)}%</strong><small>{range.oneCardOuts.length} / {result.conditionalWin.availableCards} 张</small></div>
            {result.conditionalWin.cardsRemaining === 2 && <div><span>必须 2 张后落在本区间</span><strong>{range.twoCardProbability.toFixed(1)}%</strong><small>{range.twoCardCombos.length} / {result.conditionalWin.totalRunouts} 组组合</small></div>}
          </div>
          <div className="tier-outs"><span>{range.label} 的单张公共牌</span>{range.oneCardOuts.length ? <div className="out-card-list equity-out-list">{range.oneCardOuts.map(({ card, winRate }) => { const parts = cardParts(card); return <span className={parts.code === "h" || parts.code === "d" ? "red" : ""} key={card}><b>{displayCard(card)}</b><small>{winRate.toFixed(1)}%</small></span>; })}</div> : <small>没有单张公共牌落入 {range.label}</small>}</div>
          {result.conditionalWin.cardsRemaining === 2 && <div className="tier-combos"><span>仅两张组合后落入 {range.label}</span>{range.twoCardCombos.length ? <div>{range.twoCardCombos.slice(0, 12).map(({ cards: [first, second], winRate }) => <b key={`${first}|${second}`}>{displayCard(first)} + {displayCard(second)} <small>{winRate.toFixed(1)}%</small></b>)}{range.twoCardCombos.length > 12 && <em>另有 {range.twoCardCombos.length - 12} 组</em>}</div> : <small>没有额外的两张组合</small>}</div>}
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
