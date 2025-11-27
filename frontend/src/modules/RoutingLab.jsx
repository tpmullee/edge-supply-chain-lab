import React, { useState } from "react";
import Card from "../components/shared/Card.jsx";
import StatTile from "../components/shared/StatTile.jsx";

const API = "http://127.0.0.1:8000";

const defaultConfig = {
  distance_matrix: [
    [0, 2, 9, 10, 7, 3],
    [2, 0, 6, 4, 3, 8],
    [9, 6, 0, 8, 5, 7],
    [10, 4, 8, 0, 6, 4],
    [7, 3, 5, 6, 0, 3],
    [3, 8, 7, 4, 3, 0],
  ],
  vehicle_count: 2,
  depot_index: 0,
};

export default function RoutingLab() {
  const [demoSolution, setDemoSolution] = useState(null);
  const [demoErr, setDemoErr] = useState("");

  const [configText, setConfigText] = useState(
    JSON.stringify(defaultConfig, null, 2)
  );
  const [customSolution, setCustomSolution] = useState(null);
  const [customErr, setCustomErr] = useState("");

  async function runDemo() {
    setDemoErr("");
    setDemoSolution(null);
    try {
      const res = await fetch(`${API}/vrp/demo`);
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setDemoSolution(json);
    } catch (err) {
      setDemoErr(err.message || String(err));
    }
  }

  async function runCustom(e) {
    e.preventDefault();
    setCustomErr("");
    setCustomSolution(null);
    try {
      const cfg = JSON.parse(configText);
      const res = await fetch(`${API}/vrp/solve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setCustomSolution(json);
    } catch (err) {
      setCustomErr(err.message || String(err));
    }
  }

  const renderSolution = (solution) => {
    if (!solution) return null;
    return (
      <>
        <div className="edge-stat-row">
          <StatTile
            label="Total distance"
            value={solution.total_distance.toString()}
          />
          <StatTile
            label="Vehicles used"
            value={solution.routes.length.toString()}
          />
        </div>
        <h3 className="edge-table-title">Routes</h3>
        <ul className="edge-list">
          {solution.routes.map((r) => (
            <li key={r.vehicle}>
              <strong>Vehicle {r.vehicle}</strong> — distance {r.distance} — route{" "}
              {r.nodes.join(" → ")}
            </li>
          ))}
        </ul>
      </>
    );
  };

  return (
    <div className="edge-lab">
      <h1 className="edge-lab-title">Routing & Fleet Optimization</h1>
      <p className="edge-lab-subtitle">
        OR-Tools-backed routing sandbox for simple capacitated VRP style
        problems. Great for talking fleet mix, territory design, and route
        efficiencies.
      </p>

      <div className="edge-lab-grid edge-lab-grid-2">
        <Card
          title="Demo scenario"
          subtitle="6 stops, 2 vehicles — original or-cvrp demo wrapped in an API."
        >
          <p className="edge-muted">
            This uses Google OR-Tools under the hood. Make sure you've run{" "}
            <code>pip install ortools</code> in your backend environment.
          </p>
          <button className="edge-button" type="button" onClick={runDemo}>
            Run demo optimization
          </button>
          {demoErr && <p className="edge-error">{demoErr}</p>}
          {renderSolution(demoSolution)}
        </Card>

        <Card
          title="Custom configuration"
          subtitle="Edit the JSON distance matrix and vehicle count, then solve."
        >
          <form className="edge-form" onSubmit={runCustom}>
            <label className="edge-field-label">
              Problem JSON
              <textarea
                className="edge-input"
                style={{ minHeight: "180px", fontFamily: "monospace" }}
                value={configText}
                onChange={(e) => setConfigText(e.target.value)}
              />
            </label>
            <button type="submit" className="edge-button">
              Solve routing problem
            </button>
          </form>
          {customErr && <p className="edge-error">{customErr}</p>}
          {renderSolution(customSolution)}
        </Card>
      </div>
    </div>
  );
}
