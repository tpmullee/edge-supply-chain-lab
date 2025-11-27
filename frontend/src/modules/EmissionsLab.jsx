import React, { useState } from "react";
import Card from "../components/shared/Card.jsx";
import StatTile from "../components/shared/StatTile.jsx";

const API = "http://127.0.0.1:8000";

async function postJson(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function EmissionsLab() {
  const [shipments, setShipments] = useState([
    { mode: "truck", distance_km: 800, weight_kg: 12000 },
    { mode: "ocean", distance_km: 6000, weight_kg: 150000 },
  ]);
  const [emissionsResult, setEmissionsResult] = useState(null);
  const [emErr, setEmErr] = useState("");

  const [usage, setUsage] = useState({
    eta: 50000,
    dwell: 20000,
    emissions: 5000,
  });
  const [econResult, setEconResult] = useState(null);
  const [econErr, setEconErr] = useState("");

  const handleShipmentField = (idx, field) => (e) => {
    const value =
      field === "mode" ? e.target.value : Number(e.target.value || 0);
    setShipments((rows) =>
      rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r))
    );
  };

  const addRow = () =>
    setShipments((rows) => [
      ...rows,
      { mode: "truck", distance_km: 500, weight_kg: 10000 },
    ]);

  const removeRow = (idx) =>
    setShipments((rows) => rows.filter((_, i) => i !== idx));

  async function handleEmissions(e) {
    e.preventDefault();
    setEmErr("");
    try {
      const res = await postJson("/emissions/shipments", { shipments });
      setEmissionsResult(res);
    } catch (err) {
      setEmErr(err.message || String(err));
    }
  }

  const handleUsageField = (field) => (e) => {
    setUsage((u) => ({ ...u, [field]: Number(e.target.value || 0) }));
  };

  async function handleEconomics(e) {
    e.preventDefault();
    setEconErr("");
    try {
      const payload = [
        { name: "eta", monthly_calls: usage.eta },
        { name: "dwell", monthly_calls: usage.dwell },
        { name: "emissions", monthly_calls: usage.emissions },
      ];
      const res = await postJson("/emissions/api-economics", payload);
      setEconResult(res);
    } catch (err) {
      setEconErr(err.message || String(err));
    }
  }

  const totalTonKm =
    emissionsResult?.shipments.reduce(
      (acc, s) => acc + (s.weight_kg / 1000) * s.distance_km,
      0
    ) ?? 0;

  return (
    <div className="edge-lab">
      <h1 className="edge-lab-title">Emissions & API Suite</h1>
      <p className="edge-lab-subtitle">
        Quantify shipment emissions and the business model of exposing those
        calculations as APIs.
      </p>

      <div className="edge-lab-grid edge-lab-grid-2">
        <Card
          title="Shipment emissions calculator"
          subtitle="Truck, rail, ocean, and air using fixed emissions factors."
        >
          <form className="edge-form" onSubmit={handleEmissions}>
            <table className="edge-table">
              <thead>
                <tr>
                  <th>Mode</th>
                  <th>Distance (km)</th>
                  <th>Weight (kg)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shipments.map((s, idx) => (
                  <tr key={idx}>
                    <td>
                      <select
                        value={s.mode}
                        onChange={handleShipmentField(idx, "mode")}
                        className="edge-select"
                      >
                        <option value="truck">Truck</option>
                        <option value="rail">Rail</option>
                        <option value="ocean">Ocean</option>
                        <option value="air">Air</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        className="edge-input edge-input-sm"
                        value={s.distance_km}
                        onChange={handleShipmentField(idx, "distance_km")}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        className="edge-input edge-input-sm"
                        value={s.weight_kg}
                        onChange={handleShipmentField(idx, "weight_kg")}
                      />
                    </td>
                    <td>
                      {shipments.length > 1 && (
                        <button
                          type="button"
                          className="edge-link-button"
                          onClick={() => removeRow(idx)}
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="edge-form-footer">
              <button
                type="button"
                className="edge-link-button"
                onClick={addRow}
              >
                + Add shipment
              </button>
              <button type="submit" className="edge-button">
                Calculate CO₂
              </button>
            </div>
          </form>
          {emErr && <p className="edge-error">{emErr}</p>}
          {emissionsResult && (
            <>
              <div className="edge-stat-row">
                <StatTile
                  label="Total CO₂ (kg)"
                  value={emissionsResult.total_co2_kg.toFixed(1)}
                />
                <StatTile
                  label="Shipments"
                  value={emissionsResult.shipments.length.toString()}
                />
                <StatTile
                  label="Avg gCO₂ / ton-km"
                  value={
                    totalTonKm
                      ? (
                          (emissionsResult.total_co2_kg * 1000) /
                          totalTonKm
                        ).toFixed(1)
                      : "–"
                  }
                />
              </div>
              <ul className="edge-list">
                {emissionsResult.shipments.map((s, idx) => (
                  <li key={idx}>
                    {s.mode.toUpperCase()} — {s.distance_km} km,{" "}
                    {s.weight_kg} kg →{" "}
                    <strong>{s.co2_kg.toFixed(2)} kg CO₂</strong>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card
          title="API economics"
          subtitle="Model revenue and margin from ETA, dwell, and emissions APIs."
        >
          <form className="edge-form" onSubmit={handleEconomics}>
            <div className="edge-field-row">
              <div className="edge-field">
                <label className="edge-field-label">
                  ETA calls / month
                </label>
                <input
                  type="number"
                  min="0"
                  className="edge-input"
                  value={usage.eta}
                  onChange={handleUsageField("eta")}
                />
              </div>
              <div className="edge-field">
                <label className="edge-field-label">
                  Dwell calls / month
                </label>
                <input
                  type="number"
                  min="0"
                  className="edge-input"
                  value={usage.dwell}
                  onChange={handleUsageField("dwell")}
                />
              </div>
              <div className="edge-field">
                <label className="edge-field-label">
                  Emissions calls / month
                </label>
                <input
                  type="number"
                  min="0"
                  className="edge-input"
                  value={usage.emissions}
                  onChange={handleUsageField("emissions")}
                />
              </div>
            </div>
            <button type="submit" className="edge-button">
              Calculate API P&L
            </button>
          </form>
          {econErr && <p className="edge-error">{econErr}</p>}
          {econResult && (
            <>
              <div className="edge-stat-row">
                <StatTile
                  label="Revenue / month"
                  value={`$${econResult.total_revenue_usd.toFixed(0)}`}
                />
                <StatTile
                  label="Cost / month"
                  value={`$${econResult.total_cost_usd.toFixed(0)}`}
                />
                <StatTile
                  label="Gross margin %"
                  value={econResult.total_gross_margin_pct.toFixed(1)}
                />
              </div>
              <table className="edge-table">
                <thead>
                  <tr>
                    <th>API</th>
                    <th>Calls</th>
                    <th>Revenue</th>
                    <th>Cost</th>
                    <th>GM %</th>
                  </tr>
                </thead>
                <tbody>
                  {econResult.items.map((i) => (
                    <tr key={i.name}>
                      <td>{i.name}</td>
                      <td>{i.monthly_calls.toLocaleString()}</td>
                      <td>${i.revenue_usd.toFixed(0)}</td>
                      <td>${i.cost_usd.toFixed(0)}</td>
                      <td>{i.gross_margin_pct.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
