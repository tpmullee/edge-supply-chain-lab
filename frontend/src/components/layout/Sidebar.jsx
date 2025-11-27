import React from "react";

export default function Sidebar({ tabs, active, onChange }) {
  return (
    <aside className="edge-sidebar">
      {tabs.map(t => (
        <button
          key={t.id}
          className={`edge-nav-item ${active === t.id ? "active" : ""}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </aside>
  );
}
