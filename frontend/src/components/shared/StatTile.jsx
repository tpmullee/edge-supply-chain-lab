import React from "react";

export default function StatTile({ label, value, hint }) {
  return (
    <div className="edge-stat-tile">
      <div className="edge-stat-value">{value}</div>
      <div className="edge-stat-label">
        {label}
        {hint && <span className="edge-stat-hint">{hint}</span>}
      </div>
    </div>
  );
}
