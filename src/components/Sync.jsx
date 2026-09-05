import { useState, useEffect } from "react";
import {
  generateSyncCode, getSavedSyncCode, saveSyncCode, pullBundle, pushBundle, gatherBundle, applyBundle,
  getCompareCodes, saveCompareCodes, pullCompareStats,
} from "../lib/progressSync.js";

/* ============================================================
   SYNC
   Optional, and off by default: personal progress and recordings
   stay purely local (see README "Persistence") unless you set up
   a code here. No account, no email — the code itself is the only
   credential, generated on-device.
   ============================================================ */

export function SyncPanel() {
  const [code, setCode] = useState(() => getSavedSyncCode());
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [msgIsError, setMsgIsError] = useState(false);
  const [confirmLink, setConfirmLink] = useState(false);

  const createCode = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const bundle = await gatherBundle();
      const newCode = generateSyncCode();
      await pushBundle(newCode, bundle);
      saveSyncCode(newCode);
      setCode(newCode);
      setMsgIsError(false);
      setMsg("Synced. Enter this code on your other device to bring this over.");
    } catch (e) {
      setMsgIsError(true);
      setMsg(e.message || "Couldn't sync right now.");
    }
    setBusy(false);
  };

  const linkCode = async () => {
    const typed = input.trim().toUpperCase();
    if (!typed) return;
    if (!confirmLink) {
      setConfirmLink(true);
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const bundle = await pullBundle(typed);
      if (!bundle) {
        setMsgIsError(true);
        setMsg("No synced progress found for that code.");
      } else {
        await applyBundle(bundle);
        saveSyncCode(typed);
        setCode(typed);
        setInput("");
        setMsgIsError(false);
        setMsg("Linked — reloading…");
        setTimeout(() => window.location.reload(), 900);
      }
    } catch (e) {
      setMsgIsError(true);
      setMsg(e.message || "Couldn't sync right now.");
    }
    setConfirmLink(false);
    setBusy(false);
  };

  const forget = () => {
    saveSyncCode(null);
    setCode(null);
    setMsg(null);
  };

  return (
    <div>
      <p className="note" style={{ marginBottom: 10, fontSize: 11.5 }}>
        Optional, and off unless you set it up. No account, no email — a random code is the only key,
        and it's the only thing that can reach this data (see the README for how). Follow-up changes on
        a linked device sync automatically from then on.
      </p>

      {code ? (
        <div style={{ marginBottom: 12 }}>
          <div className="note" style={{ fontSize: 11 }}>This device's sync code</div>
          <div className="disp" style={{ fontSize: 22, letterSpacing: "0.06em", margin: "3px 0 8px" }}>{code}</div>
          <button className="speaker" onClick={forget}>stop syncing on this device</button>
        </div>
      ) : (
        <div style={{ marginBottom: 12 }}>
          <button className="speaker" disabled={busy} onClick={createCode}>
            {busy ? "working…" : "create a sync code"}
          </button>
        </div>
      )}

      <div className="rule" style={{ margin: "12px 0" }} />
      <div className="note" style={{ fontSize: 11, marginBottom: 6 }}>Have a code from another device?</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          value={input}
          onChange={(e) => { setInput(e.target.value); setConfirmLink(false); }}
          onKeyDown={(e) => e.key === "Enter" && linkCode()}
          placeholder="enter code"
          style={{
            flex: 1, minWidth: 140, background: "var(--ink)", border: "1px solid var(--line)",
            borderRadius: 20, padding: "6px 14px", color: "var(--bone)", fontSize: 12,
          }}
        />
        <button
          className="speaker"
          style={confirmLink ? { borderColor: "var(--rubric)", color: "var(--rubric)" } : undefined}
          disabled={busy || !input.trim()}
          onClick={linkCode}
        >
          {confirmLink ? "tap again to replace this device's progress" : "load this code"}
        </button>
      </div>

      {msg && (
        <div className="note" style={{ marginTop: 8, color: msgIsError ? "var(--rubric)" : "var(--verd)", fontSize: 11.5 }}>
          {msg}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   COMPARE
   Entirely separate from this device's own sync code (SyncPanel
   above) — this only ever reads someone else's aggregate stats via
   pullCompareStats (get_compare_stats, a dedicated read-only RPC),
   never their full bundle and never applyBundle, so watching a code
   can't pull their recordings or raw progress map, let alone touch
   anyone's actual progress, yours or theirs. Off by default; nothing
   here is visible until a code is added. See
   getCompareCodes/saveCompareCodes in lib/progressSync.js.
   ============================================================ */

export function statsFromCompareResult(result) {
  if (!result) return null;
  return {
    level: Math.floor((result.xp || 0) / 250) + 1,
    xp: result.xp || 0,
    streakDays: result.streakDays || 0,
    masteredCount: result.masteredCount || 0,
  };
}

export function CompareRow({ label, stats }) {
  return (
    <div className="row-sp" style={{ padding: "8px 0", borderTop: "1px solid var(--line)" }}>
      <span className="note" style={{ fontSize: 12.5, color: "var(--bone)" }}>{label}</span>
      {stats.error ? (
        <span className="note" style={{ fontSize: 11, color: "var(--rubric)" }}>{stats.error}</span>
      ) : (
        <span className="note" style={{ fontSize: 11.5 }}>
          lv <b style={{ color: "var(--bone)" }}>{stats.level}</b> · {stats.masteredCount} mastered ·{" "}
          {stats.streakDays}d streak
        </span>
      )}
    </div>
  );
}

export function ComparePanel({ mine }) {
  const [codes, setCodes] = useState(() => getCompareCodes());
  const [input, setInput] = useState("");
  const [entries, setEntries] = useState({});
  const [busy, setBusy] = useState(false);

  const refresh = async (list) => {
    setBusy(true);
    const next = {};
    for (const code of list) {
      try {
        const result = await pullCompareStats(code);
        const stats = statsFromCompareResult(result);
        next[code] = stats || { error: "No synced progress found for that code." };
      } catch (e) {
        next[code] = { error: e.message || "Couldn't reach the server." };
      }
    }
    setEntries(next);
    setBusy(false);
  };

  useEffect(() => {
    if (codes.length) refresh(codes);
  }, []);

  const addCode = async () => {
    const typed = input.trim().toUpperCase();
    if (!typed || codes.includes(typed)) return;
    const next = [...codes, typed];
    setCodes(next);
    saveCompareCodes(next);
    setInput("");
    await refresh(next);
  };

  const removeCode = (code) => {
    const next = codes.filter((c) => c !== code);
    setCodes(next);
    saveCompareCodes(next);
    setEntries((e) => {
      const n = { ...e };
      delete n[code];
      return n;
    });
  };

  return (
    <div>
      <p className="note" style={{ marginBottom: 10, fontSize: 11.5 }}>
        Optional — studying with someone else? Add their sync code (from their Sync panel above) to see
        how you're both doing. Read-only: this can never change their progress, or yours.
      </p>

      <CompareRow label="You" stats={mine} />
      {codes.map((code) => (
        <div key={code} className="row-sp" style={{ alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <CompareRow label={code} stats={entries[code] || { error: "Loading…" }} />
          </div>
          <button onClick={() => removeCode(code)} style={{ color: "var(--dim)", fontSize: 15, padding: "0 0 0 8px" }}>
            ✕
          </button>
        </div>
      ))}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCode()}
          placeholder="their sync code"
          style={{
            flex: 1, minWidth: 140, background: "var(--ink)", border: "1px solid var(--line)",
            borderRadius: 20, padding: "6px 14px", color: "var(--bone)", fontSize: 12,
          }}
        />
        <button className="speaker" disabled={busy || !input.trim()} onClick={addCode}>
          {busy ? "working…" : "add"}
        </button>
      </div>
    </div>
  );
}
