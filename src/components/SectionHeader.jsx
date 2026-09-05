// A collapsible section's own header: a bordered band with a title and
// a chevron, optionally a done/total pill (used by Home's stage lists;
// omit total to get a plain collapsible section, used by More's longer
// reference/practice blocks). Collapsing is purely to save scroll room --
// a stage's own progress still stays visible even collapsed, and nothing
// here auto-collapses on its own; it's a purely local, user-driven toggle.
export function SectionHeader({ open, onToggle, title, done, total, style, dataTour }) {
  return (
    <button
      onClick={onToggle}
      data-tour={dataTour}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
        textAlign: "left", background: "var(--ink3)", border: "1px solid var(--line)",
        borderRadius: 12, padding: "13px 14px", ...style,
      }}
    >
      <span className="eyebrow" style={{ margin: 0, fontSize: 11.5 }}>{title}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: 10 }}>
        {total != null && <span className="pill">{done}/{total}</span>}
        <span style={{ color: "var(--dim)", fontSize: 15, lineHeight: 1 }}>{open ? "▾" : "▸"}</span>
      </span>
    </button>
  );
}
