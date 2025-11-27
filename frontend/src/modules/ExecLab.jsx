import React, { useEffect, useState } from "react";
import Card from "../components/shared/Card.jsx";
import StatTile from "../components/shared/StatTile.jsx";

const API = "http://127.0.0.1:8000";

async function getJson(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function ExecLab() {
  const [board, setBoard] = useState(null);
  const [health, setHealth] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [b, h] = await Promise.all([
          getJson("/ops/board-daily"),
          getJson("/ops/health"),
        ]);
        setBoard(b);
        setHealth(h);
      } catch (e) {
        setErr(e.message || String(e));
      }
    })();
  }, []);

  return (
    <div className="edge-lab">
      <h1 className="edge-lab-title">Exec Board View</h1>
      <p className="edge-lab-subtitle">
        A single pane of glass for ETA accuracy, dwell risk, inventory
        service, and emissions intensity.
      </p>

      {err && <p className="edge-error">{err}</p>}

      <div className="edge-lab-grid edge-lab-grid-2">
        <Card
          title="Daily board brief"
          subtitle={board ? board.date : "Sample"}
        >
          {board ? (
            <>
              <h2 className="edge-board-headline">{board.headline}</h2>
              <h3 className="edge-table-title">Highlights</h3>
              <ul className="edge-list">
                {board.highlights.map((h, idx) => (
                  <li key={idx}>{h}</li>
                ))}
              </ul>
              <h3 className="edge-table-title">Recommended actions</h3>
              <ul className="edge-list">
                {board.actions.map((a, idx) => (
                  <li key={idx}>{a}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="edge-muted">Loading brief…</p>
          )}
        </Card>

        <Card
          title="Ops health KPIs"
          subtitle="Core metrics that a COO / VP Supply Chain would look at daily."
        >
          {health ? (
            <div className="edge-stat-row edge-stat-row-wrap">
              <StatTile
                label="ETA MAE (minutes)"
                value={health.eta_mae_minutes.toFixed(1)}
              />
              <StatTile
                label="Dwell within SLA %"
                value={health.dwell_sla_pct.toFixed(1)}
              />
              <StatTile
                label="Inventory service level %"
                value={health.inventory_service_level_pct.toFixed(1)}
              />
              <StatTile
                label="Emissions kg / ton-km"
                value={health.emissions_intensity_kg_per_ton_km.toFixed(3)}
              />
              <StatTile
                label="Last updated"
                value={new Date(
                  health.last_updated
                ).toLocaleString()}
              />
            </div>
          ) : (
            <p className="edge-muted">Loading KPIs…</p>
          )}
        </Card>
      </div>
    </div>
  );
}
