import React, { useState } from "react";
import Card from "../components/shared/Card.jsx";
import StatTile from "../components/shared/StatTile.jsx";

const API = "http://127.0.0.1:8000";

async function j(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export default function InventoryLab() {
  const [params, setParams] = useState({
    s: 20,
    S: 50,
    days: 365,
    mu: 20,
    sigma: 4,
    lead: 2,
    hold: 1,
    stockout: 5,
    order_cost: 20,
  });

  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");

  const run = async () => {
    try {
      setErr("");
      let r = await j(`${API}/inventory/simulate`, params);
      setResult(r);
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div className="edge-module">
      <Card title="Inventory Policy Simulator" subtitle="Simulate (s, S) warehouse inventory operations.">
        <div className="edge-grid-2">
          <div>
            <h3 className="edge-section-label">Parameters</h3>
            <div className="edge-form-grid">
              {Object.keys(params).map((k) => (
                <label key={k}>
                  {k}
                  <input
                    type="number"
                    value={params[k]}
                    onChange={(e) =>
                      setParams({ ...params, [k]: Number(e.target.value) })
                    }
                  />
                </label>
              ))}
            </div>
            <button className="edge-btn ghost" onClick={run}>
              Simulate
            </button>
          </div>

          <div>
            {result && (
              <div className="edge-stat-row">
                <StatTile label="Avg Cost" value={result.avg_cost.toFixed(2)} />
                <StatTile label="Service %" value={(result.service_level * 100).toFixed(1)} />
                <StatTile label="Orders" value={result.orders} />
              </div>
            )}
          </div>
        </div>
        {err && <p className="edge-error">{err}</p>}
      </Card>
    </div>
  );
}
