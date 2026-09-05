/* ============================================================
   CALLOUT
   A small, dismissible, one-time tip anchored in place next to
   the feature it explains — pointing things out as they're
   encountered rather than all at once up front. Tracked in
   state.seenIntro alongside the app-tour flag.
   ============================================================ */

export function Callout({ id, seenIntro, onSeen, children }) {
  if (seenIntro.includes(id)) return null;
  return (
    <div className="card" style={{ borderColor: "var(--gold)", padding: "12px 14px" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div className="eyebrow" style={{ color: "var(--gold)", marginBottom: 4 }}>Tip</div>
          <div className="note" style={{ color: "var(--bone)", fontSize: 12.5 }}>{children}</div>
        </div>
        <button onClick={() => onSeen(id)} style={{ color: "var(--dim)", fontSize: 16, lineHeight: 1, padding: 2 }}>
          ✕
        </button>
      </div>
    </div>
  );
}
