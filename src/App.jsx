import { useState, useEffect, useRef } from "react";

const CLAUDE_MODEL = "claude-sonnet-4-20250514";

// ── Simulated market data ──────────────────────────
function generateMockData() {
  const base = 521;
  const prices = [];
  for (let i = 60; i >= 0; i--) {
    const noise = (Math.random() - 0.48) * 3;
    prices.push(+(base + noise * i * 0.1 + Math.sin(i * 0.3) * 4).toFixed(2));
  }
  return prices;
}

function calcSMA(prices, window) {
  if (prices.length < window) return null;
  const slice = prices.slice(-window);
  return +(slice.reduce((a, b) => a + b, 0) / window).toFixed(2);
}

function calcRSI(prices, period = 14) {
  if (prices.length < period + 1) return 50;
  const changes = prices
    .slice(-period - 1)
    .map((p, i, arr) => (i === 0 ? 0 : p - arr[i - 1]))
    .slice(1);
  const gains = changes.filter((c) => c > 0);
  const losses = changes.filter((c) => c < 0).map(Math.abs);
  const avgGain = gains.reduce((a, b) => a + b, 0) / period;
  const avgLoss = losses.reduce((a, b) => a + b, 0) / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return +(100 - 100 / (1 + rs)).toFixed(1);
}

function getRuleSignal(price, sma20, sma50, rsi) {
  if (!sma20 || !sma50) return "HOLD";
  if (price > sma20 && sma20 > sma50 && rsi > 40 && rsi < 60) return "BUY";
  if (price < sma20 || rsi > 70) return "SELL";
  return "HOLD";
}

const SIG_COLOR = { BUY: "#00ff9d", SELL: "#ff4d6d", HOLD: "#ffd166" };
const CONF_COLOR = { HIGH: "#00ff9d", MEDIUM: "#ffd166", LOW: "#888" };

export default function App() {
  const [prices, setPrices] = useState(generateMockData());
  const [logs, setLogs] = useState([]);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef(null);
  const logsEndRef = useRef(null);

  const currentPrice = prices[prices.length - 1];
  const sma20 = calcSMA(prices, 20);
  const sma50 = calcSMA(prices, 50);
  const rsi = calcRSI(prices, 14);
  const ruleSignal = getRuleSignal(currentPrice, sma20, sma50, rsi);
  const lastLog = logs[logs.length - 1];

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  async function getClaudeSignal(price, sma20, sma50, rsi, ruleSignal) {
    const prompt = `You are a day trading analyst for SPY (S&P 500 ETF).

Current Market Data:
- SPY Price: $${price}
- SMA 20: $${sma20}
- SMA 50: $${sma50}
- RSI (14): ${rsi}
- Rule-based Signal: ${ruleSignal}
- Take Profit Target: 2%
- Stop Loss: 1%

Respond ONLY with a JSON object, no markdown, no backticks:
{
  "signal": "BUY" or "SELL" or "HOLD",
  "confidence": "HIGH" or "MEDIUM" or "LOW",
  "reason": "one sentence max 20 words"
}`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await res.json();
      const text =
        data.content?.find((b) => b.type === "text")?.text || "{}";
      return JSON.parse(text.replace(/```json|```/g, "").trim());
    } catch {
      return {
        signal: ruleSignal,
        confidence: "LOW",
        reason: "Claude unavailable — using rule-based signal.",
      };
    }
  }

  async function runOnce() {
    setLoading(true);
    const newPrice = +(currentPrice + (Math.random() - 0.48) * 1.5).toFixed(2);
    const newPrices = [...prices.slice(1), newPrice];
    setPrices(newPrices);

    const ns20 = calcSMA(newPrices, 20);
    const ns50 = calcSMA(newPrices, 50);
    const nRsi = calcRSI(newPrices, 14);
    const nRule = getRuleSignal(newPrice, ns20, ns50, nRsi);
    const claude = await getClaudeSignal(newPrice, ns20, ns50, nRsi, nRule);

    setLogs((prev) => [
      ...prev.slice(-49),
      {
        time: new Date().toLocaleTimeString(),
        price: newPrice,
        sma20: ns20,
        sma50: ns50,
        rsi: nRsi,
        ruleSignal: nRule,
        claudeSignal: claude.signal,
        confidence: claude.confidence,
        reason: claude.reason,
      },
    ]);
    setLoading(false);
  }

  function toggleAgent() {
    if (running) {
      clearInterval(intervalRef.current);
      setRunning(false);
    } else {
      setRunning(true);
      runOnce();
      intervalRef.current = setInterval(runOnce, 8000);
    }
  }

  useEffect(() => () => clearInterval(intervalRef.current), []);

  return (
    <div style={{
      background: "#0a0a0f", minHeight: "100vh",
      fontFamily: "'Courier New', monospace",
      color: "#e0e0e0", padding: "24px",
    }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 10, color: "#444", letterSpacing: 4, marginBottom: 4 }}>
            POWERED BY CLAUDE AI
          </div>
          <h1 style={{ margin: 0, fontSize: 26, color: "#fff", fontWeight: 700, letterSpacing: 1 }}>
            SPY Trading Bot
          </h1>
        </div>
        <button
          onClick={toggleAgent}
          style={{
            background: running ? "#ff4d6d22" : "#00ff9d22",
            border: `1px solid ${running ? "#ff4d6d" : "#00ff9d"}`,
            color: running ? "#ff4d6d" : "#00ff9d",
            padding: "10px 24px", borderRadius: 6,
            cursor: "pointer", fontFamily: "inherit",
            fontSize: 13, letterSpacing: 2, fontWeight: 700,
          }}
        >
          {running ? "⏹ STOP AGENT" : "▶ START AGENT"}
        </button>
      </div>

      {/* ── Stat Cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "SPY PRICE", value: `$${currentPrice}`, color: "#fff" },
          { label: "RSI (14)", value: rsi, color: rsi > 70 ? "#ff4d6d" : rsi < 30 ? "#00ff9d" : "#ffd166" },
          { label: "SMA 20", value: sma20 ? `$${sma20}` : "—", color: "#7eb8f7" },
          { label: "SMA 50", value: sma50 ? `$${sma50}` : "—", color: "#c77dff" },
        ].map((c) => (
          <div key={c.label} style={{
            background: "#111118", border: "1px solid #222",
            borderRadius: 8, padding: "14px 16px",
          }}>
            <div style={{ fontSize: 10, color: "#555", letterSpacing: 3, marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* ── Signal Panel ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        <div style={{ background: "#111118", border: "1px solid #222", borderRadius: 8, padding: "16px 20px" }}>
          <div style={{ fontSize: 10, color: "#555", letterSpacing: 3, marginBottom: 8 }}>RULE-BASED SIGNAL</div>
          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: 4, color: SIG_COLOR[ruleSignal] }}>
            {ruleSignal}
          </div>
          <div style={{ fontSize: 11, color: "#444", marginTop: 6 }}>SMA crossover + RSI logic</div>
        </div>

        <div style={{
          background: "#111118",
          border: `1px solid ${lastLog ? SIG_COLOR[lastLog.claudeSignal] + "55" : "#222"}`,
          borderRadius: 8, padding: "16px 20px", position: "relative",
        }}>
          {loading && (
            <div style={{ position: "absolute", top: 10, right: 14, fontSize: 10, color: "#555", letterSpacing: 2 }}>
              THINKING...
            </div>
          )}
          <div style={{ fontSize: 10, color: "#555", letterSpacing: 3, marginBottom: 8 }}>CLAUDE AI SIGNAL</div>
          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: 4, color: lastLog ? SIG_COLOR[lastLog.claudeSignal] : "#333" }}>
            {lastLog ? lastLog.claudeSignal : "—"}
          </div>
          {lastLog && (
            <>
              <div style={{ fontSize: 11, color: CONF_COLOR[lastLog.confidence], marginTop: 6 }}>
                Confidence: {lastLog.confidence}
              </div>
              <div style={{ fontSize: 11, color: "#555", marginTop: 4, fontStyle: "italic" }}>
                "{lastLog.reason}"
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Price Chart ── */}
      <div style={{ background: "#111118", border: "1px solid #222", borderRadius: 8, padding: "16px 20px", marginBottom: 20 }}>
        <div style={{ fontSize: 10, color: "#555", letterSpacing: 3, marginBottom: 12 }}>PRICE HISTORY</div>
        <svg viewBox="0 0 600 80" style={{ width: "100%", height: 80 }}>
          {(() => {
            const min = Math.min(...prices);
            const max = Math.max(...prices);
            const range = max - min || 1;
            const pts = prices
              .map((p, i) => `${(i / (prices.length - 1)) * 600},${80 - ((p - min) / range) * 70}`)
              .join(" ");
            const lastX = 600;
            const lastY = 80 - ((prices[prices.length - 1] - min) / range) * 70;
            return (
              <>
                <polyline points={pts} fill="none" stroke="#7eb8f7" strokeWidth="1.5" />
                <circle cx={lastX} cy={lastY} r="3" fill="#00ff9d" />
              </>
            );
          })()}
        </svg>
      </div>

      {/* ── Log Table ── */}
      <div style={{ background: "#111118", border: "1px solid #222", borderRadius: 8, padding: "16px 20px" }}>
        <div style={{ fontSize: 10, color: "#555", letterSpacing: 3, marginBottom: 12 }}>
          SIGNAL LOG {logs.length > 0 ? `(${logs.length} checks)` : ""}
        </div>
        <div style={{ maxHeight: 220, overflowY: "auto" }}>
          {logs.length === 0 ? (
            <div style={{ color: "#333", fontSize: 13, textAlign: "center", padding: 20 }}>
              Press START AGENT to begin monitoring
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: "#444", borderBottom: "1px solid #1e1e2e" }}>
                  {["TIME", "PRICE", "RSI", "RULE", "CLAUDE", "CONF", "REASON"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "4px 8px", fontSize: 10, letterSpacing: 2 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...logs].reverse().map((log, i) => (
                  <tr key={i} style={{
                    borderBottom: "1px solid #1a1a22",
                    background: i === 0 ? "#ffffff08" : "transparent",
                  }}>
                    <td style={{ padding: "6px 8px", color: "#555" }}>{log.time}</td>
                    <td style={{ padding: "6px 8px", color: "#fff" }}>${log.price}</td>
                    <td style={{ padding: "6px 8px", color: log.rsi > 70 ? "#ff4d6d" : log.rsi < 30 ? "#00ff9d" : "#ffd166" }}>
                      {log.rsi}
                    </td>
                    <td style={{ padding: "6px 8px", color: SIG_COLOR[log.ruleSignal], fontWeight: 700 }}>{log.ruleSignal}</td>
                    <td style={{ padding: "6px 8px", color: SIG_COLOR[log.claudeSignal], fontWeight: 700 }}>{log.claudeSignal}</td>
                    <td style={{ padding: "6px 8px", color: CONF_COLOR[log.confidence] }}>{log.confidence}</td>
                    <td style={{ padding: "6px 8px", color: "#555", fontStyle: "italic" }}>{log.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div ref={logsEndRef} />
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{ marginTop: 16, fontSize: 10, color: "#2a2a2a", textAlign: "center", letterSpacing: 2 }}>
        ⚠ FOR EDUCATIONAL USE ONLY — NOT FINANCIAL ADVICE — PAPER TRADE FIRST
      </div>
    </div>
  );
}
