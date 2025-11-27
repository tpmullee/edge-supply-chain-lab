import React, { useEffect, useMemo, useState } from "react";
import Card from "../components/shared/Card.jsx";
import StatTile from "../components/shared/StatTile.jsx";

const API = "http://127.0.0.1:8000"; // backend base for future OTM / ERP / LLM APIs

// ---------------------------------------------------------------------------
// Helpers & mock data
// ---------------------------------------------------------------------------

const HUBS = ["Chicago", "Dallas", "Atlanta", "Harrisburg", "Los Angeles", "Seattle"];
const MAKES = ["Freightliner", "Volvo", "Kenworth", "Peterbilt", "International"];
const MODELS = ["Cascadia", "VNL", "T680", "579", "LT"];
const TYPES = ["Tractor", "Trailer", "Container", "Chassis"];

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function choice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function dateWithin(daysBack, daysForward = 0) {
  const now = new Date();
  const offsetDays = Math.random() * (daysBack + daysForward) - daysBack;
  const d = new Date(now.getTime() - offsetDays * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

function healthBand(score) {
  if (score >= 85) return "Healthy";
  if (score >= 75) return "Watch";
  if (score >= 65) return "At Risk";
  return "Critical";
}

// Build a large mock fleet with asset health, usage and requirements
function buildMockFleet(count = 140) {
  const assets = [];
  const requirements = [];
  const workOrders = [];
  const history = [];

  // Assets
  for (let i = 0; i < count; i++) {
    const type = choice(TYPES);
    const healthScore = rand(55, 100);
    const utilizationPct = rand(40, 96);
    const regRisk = Math.min(100, 110 - healthScore + rand(0, 15));
    const faultCodes =
      healthScore > 80 ? [] : ["P0420", "P0301", "ABS-02"].slice(0, rand(0, 3));

    const asset = {
      id: `AST-${String(i + 1).padStart(3, "0")}`,
      type,
      make: choice(MAKES),
      model: choice(MODELS),
      year: rand(2016, 2024),
      hub: choice(HUBS),
      status: Math.random() < 0.08 ? "In Shop" : "Available",
      healthScore,
      utilizationPct,
      regRisk,
      miles: rand(140000, 820000),
      engineHours: rand(3000, 22000),
      lastServiceDate: dateWithin(180),
      nextInspectionDue: dateWithin(-20, 140),
      faultCodes,
      openAlerts: faultCodes.length + (regRisk > 80 ? 1 : 0),
    };
    assets.push(asset);
  }

  // Maintenance requirements derived from health / risk / inspections
  for (const asset of assets) {
    const dueSoon = new Date(asset.nextInspectionDue) < new Date();
    if (asset.healthScore >= 80 && asset.regRisk <= 60 && !dueSoon) continue;

    const tasks = [];

    if (asset.healthScore < 75) {
      tasks.push({
        code: "PM-A-SVC",
        description: "Perform A-level preventive maintenance service",
        laborHours: 3,
        costUsd: 480,
        deltaHealth: 12,
        deltaRegRisk: -8,
        parts: [
          {
            partNumber: "ENG-OIL-FLTR",
            description: "Engine oil filter",
            qty: 1,
            unitCostUsd: 28,
          },
          {
            partNumber: "AIR-FLTR",
            description: "Air filter",
            qty: 1,
            unitCostUsd: 40,
          },
        ],
      });
    }

    if (asset.faultCodes.length) {
      tasks.push({
        code: "DIAG-ENG-FAULT",
        description: `Diagnose and correct engine fault codes (${asset.faultCodes.join(
          ", "
        )})`,
        laborHours: 4,
        costUsd: 820,
        deltaHealth: 15,
        deltaRegRisk: -4,
        parts: [
          {
            partNumber: "ENG-DIAG-TIME",
            description: "Diagnostic time",
            qty: 1,
            unitCostUsd: 0,
          },
        ],
      });
    }

    if (dueSoon) {
      tasks.push({
        code: "DOT-ANNUAL",
        description: "Perform annual DOT inspection",
        laborHours: 2.5,
        costUsd: 360,
        deltaHealth: 5,
        deltaRegRisk: -25,
        parts: [],
      });
    }

    if (!tasks.length) continue;

    const severity =
      asset.healthScore < 60 || asset.regRisk > 80
        ? "Critical"
        : asset.healthScore < 70 || asset.regRisk > 70
        ? "High"
        : "Medium";

    requirements.push({
      id: `REQ-${asset.id}`,
      assetId: asset.id,
      severity,
      description: `Auto-detected requirement for ${asset.type} ${asset.id}`,
      dueBy: dueSoon ? new Date().toISOString() : dateWithin(-7, 30),
      tasks,
      estimatedDowntimeHours: tasks.reduce((s, t) => s + t.laborHours, 0),
    });
  }

  // Work orders seeded from requirements
  requirements.slice(0, 40).forEach((req, idx) => {
    const createdAt = dateWithin(45);
    const steps = req.tasks.map((t, i) => ({
      id: `STEP-${idx}-${i}`,
      label: t.description,
      status: Math.random() < 0.4 ? "Done" : "Open",
      completedBy: null,
      completedAt: null,
    }));

    const totalLabor = req.tasks.reduce((s, t) => s + t.laborHours, 0);
    const partsCost = req.tasks.reduce(
      (s, t) => s + t.parts.reduce((pSum, p) => pSum + p.qty * p.unitCostUsd, 0),
      0
    );
    const totalCost = req.tasks.reduce((s, t) => s + t.costUsd, 0) + partsCost;

    workOrders.push({
      id: `WO-${idx + 1}`,
      assetId: req.assetId,
      requirementId: req.id,
      status: Math.random() < 0.5 ? "In Progress" : "Completed",
      createdAt,
      shopLocation: "Chicago Fleet Shop 01",
      instructions: "",
      steps,
      parts: req.tasks.flatMap((t) => t.parts),
      estLaborHours: totalLabor,
      estTotalCostUsd: totalCost,
      notes: [],
    });
  });

  // Simple monthly history for leadership analytics
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    history.push({
      date: d.toISOString(),
      avgHealth: 72 + Math.random() * 16,
      downtimePct: 4 + Math.random() * 4,
      maintenanceCostUsd: 150000 + Math.random() * 60000,
    });
  }

  return { assets, requirements, workOrders, history };
}

// Minimum-cost combination of tasks that raises health >= 80 and regRisk <= 60
function optimizeRequirement(asset, requirement) {
  if (!requirement) return null;

  const tasks = requirement.tasks;
  const n = tasks.length;
  const subsets = 1 << n;
  let best = null;

  for (let mask = 1; mask < subsets; mask++) {
    let health = asset.healthScore;
    let reg = asset.regRisk;
    let cost = 0;
    let downtime = 0;
    const chosen = [];

    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        const t = tasks[i];
        chosen.push(t);
        health += t.deltaHealth;
        reg += t.deltaRegRisk;
        downtime += t.laborHours;
        cost +=
          t.costUsd +
          t.parts.reduce((s, p) => s + p.qty * p.unitCostUsd, 0);
      }
    }

    if (health < 80 || reg > 60) continue;
    if (!best || cost < best.totalCostUsd) {
      best = {
        assetId: asset.id,
        currentHealth: asset.healthScore,
        projectedHealth: health,
        currentReg: asset.regRisk,
        projectedReg: reg,
        tasks: chosen,
        totalCostUsd: cost,
        totalDowntimeHours: downtime,
      };
    }
  }

  // If no subset meets thresholds, take all tasks
  if (!best) {
    const t = tasks;
    const health =
      asset.healthScore + t.reduce((s, tt) => s + tt.deltaHealth, 0);
    const reg =
      asset.regRisk + t.reduce((s, tt) => s + tt.deltaRegRisk, 0);
    const downtime = t.reduce((s, tt) => s + tt.laborHours, 0);
    const cost =
      t.reduce((s, tt) => s + tt.costUsd, 0) +
      t.reduce(
        (s, tt) => s + tt.parts.reduce((pSum, p) => pSum + p.qty * p.unitCostUsd, 0),
        0
      );

    best = {
      assetId: asset.id,
      currentHealth: asset.healthScore,
      projectedHealth: health,
      currentReg: asset.regRisk,
      projectedReg: reg,
      tasks: t,
      totalCostUsd: cost,
      totalDowntimeHours: downtime,
    };
  }

  return best;
}

function computeFleetKpis(assets, workOrders, history) {
  if (!assets.length) return null;

  const fleetSize = assets.length;
  const avgHealth = assets.reduce((s, a) => s + a.healthScore, 0) / fleetSize;
  const criticalCount = assets.filter(
    (a) => healthBand(a.healthScore) === "Critical"
  ).length;
  const utilization =
    assets.reduce((s, a) => s + a.utilizationPct, 0) / fleetSize;
  const downtime = history.length ? history[history.length - 1].downtimePct : 0;
  const compliant = assets.filter(
    (a) => new Date(a.nextInspectionDue) >= new Date()
  ).length;
  const pmCompliance = (compliant / fleetSize) * 100;
  const lastCost = history.length ? history[history.length - 1].maintenanceCostUsd : 0;
  const avgCostPerAssetMonth = fleetSize ? lastCost / fleetSize : 0;

  const openWorkOrders = workOrders.filter((w) =>
    ["Draft", "Released", "In Progress"].includes(w.status)
  ).length;

  return {
    fleetSize,
    avgHealth,
    criticalPct: (criticalCount / fleetSize) * 100,
    utilization,
    downtime,
    pmCompliance,
    avgCostPerAssetMonth,
    openWorkOrders,
  };
}

// Try to call backend LLM; fall back to templated text so lab works offline
async function generateInstructionsWithLlm(asset, requirement) {
  try {
    const res = await fetch(`${API}/fleet/work-order-text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset, requirement }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.text) return data.text;
    }
  } catch (err) {
    console.warn("LLM backend not reachable, falling back to local template.");
  }

  const lines = [];
  lines.push(`Work instructions for ${asset.type} ${asset.id} at ${asset.hub}.`);
  lines.push(
    "Objective: perform the minimum scope of work required to restore asset health and maintain compliance."
  );
  lines.push("");
  requirement.tasks.forEach((t, idx) => {
    lines.push(
      `${idx + 1}. ${t.description} (${t.laborHours}h, approx $${t.costUsd.toFixed(
        0
      )}).`
    );
  });
  lines.push("");
  lines.push("After each step, update status in EDGE and sign off with your employee ID.");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main module
// ---------------------------------------------------------------------------

export default function FleetMaintenanceLab() {
  const [assets, setAssets] = useState([]);
  const [requirements, setRequirements] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [history, setHistory] = useState([]);

  const [selectedAssetId, setSelectedAssetId] = useState(null);
  const [selectedWoId, setSelectedWoId] = useState(null);

  const [techName, setTechName] = useState("");
  const [noteText, setNoteText] = useState("");
  const [alertChannel, setAlertChannel] = useState("email");
  const [alertTarget, setAlertTarget] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const [llmBusy, setLlmBusy] = useState(false);

  useEffect(() => {
    const { assets, requirements, workOrders, history } = buildMockFleet();
    setAssets(assets);
    setRequirements(requirements);
    setWorkOrders(workOrders);
    setHistory(history);
    if (assets.length) setSelectedAssetId(assets[0].id);
    if (workOrders.length) setSelectedWoId(workOrders[0].id);
  }, []);

  const kpis = useMemo(
    () => computeFleetKpis(assets, workOrders, history),
    [assets, workOrders, history]
  );

  const selectedAsset = useMemo(
    () => assets.find((a) => a.id === selectedAssetId) || null,
    [assets, selectedAssetId]
  );

  const selectedRequirement = useMemo(
    () =>
      selectedAsset
        ? requirements.find((r) => r.assetId === selectedAsset.id) || null
        : null,
    [requirements, selectedAsset]
  );

  const selectedPlan = useMemo(
    () =>
      selectedAsset && selectedRequirement
        ? optimizeRequirement(selectedAsset, selectedRequirement)
        : null,
    [selectedAsset, selectedRequirement]
  );

  const selectedWo = useMemo(
    () => workOrders.find((w) => w.id === selectedWoId) || null,
    [workOrders, selectedWoId]
  );

  const assetForSelectedWo = useMemo(
    () =>
      selectedWo ? assets.find((a) => a.id === selectedWo.assetId) || null : null,
    [assets, selectedWo]
  );

  const onSubscribe = async () => {
    if (!selectedAsset || !alertTarget) return;
    try {
      await fetch(`${API}/fleet/alerts/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId: selectedAsset.id,
          channel: alertChannel,
          target: alertTarget,
        }),
      });
      setAlertMessage(
        `Subscribed ${alertTarget} for ${alertChannel.toUpperCase()} alerts on ${selectedAsset.id}.`
      );
    } catch (err) {
      console.warn("Alerts API not reachable, running in mock mode.");
      setAlertMessage(
        `(mock) Subscribed ${alertTarget} for ${alertChannel.toUpperCase()} alerts on ${selectedAsset.id}.`
      );
    }
    setAlertTarget("");
  };

  const onUpdateWoStatus = (status) => {
    if (!selectedWo) return;
    if (!techName) {
      setAlertMessage("Enter technician name/ID before changing status.");
      return;
    }
    const updated = workOrders.map((w) =>
      w.id === selectedWo.id ? { ...w, status } : w
    );
    setWorkOrders(updated);
    setAlertMessage(`Status updated to ${status} by ${techName}.`);
  };

  const onSaveNote = () => {
    if (!selectedWo || !noteText.trim() || !techName) return;
    const note = {
      id: `N-${Date.now()}`,
      author: techName,
      createdAt: new Date().toISOString(),
      text: noteText.trim(),
    };
    const updated = workOrders.map((w) =>
      w.id === selectedWo.id ? { ...w, notes: [note, ...(w.notes || [])] } : w
    );
    setWorkOrders(updated);
    setNoteText("");
    setAlertMessage("Note saved to work order (voice transcript compatible).");
  };

  const onGenerateInstructions = async () => {
    if (!selectedWo || !assetForSelectedWo) return;
    const requirement =
      requirements.find((r) => r.id === selectedWo.requirementId) ||
      requirements.find((r) => r.assetId === selectedWo.assetId);
    if (!requirement) {
      setAlertMessage("No requirement context found for this work order.");
      return;
    }

    setLlmBusy(true);
    const text = await generateInstructionsWithLlm(assetForSelectedWo, requirement);
    const updated = workOrders.map((w) =>
      w.id === selectedWo.id ? { ...w, instructions: text } : w
    );
    setWorkOrders(updated);
    setLlmBusy(false);
    setAlertMessage("LLM instructions attached to work order.");
  };

  if (!kpis) {
    return (
      <div className="edge-module">
        <Card title="Fleet Maintenance" subtitle="Loading mock fleet...">
          <p>Loading…</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="edge-module">
      <Card
        title="Fleet Maintenance"
        subtitle="Hub Group internal truck repair system · mock OTM / ERP / telematics integration."
        right={
          <div className="edge-stat-row">
            <StatTile label="Fleet Size" value={kpis.fleetSize} />
            <StatTile
              label="Avg Health"
              value={kpis.avgHealth.toFixed(1)}
              hint={healthBand(kpis.avgHealth)}
            />
            <StatTile
              label="Critical Assets"
              value={`${kpis.criticalPct.toFixed(1)}%`}
              hint="Below health threshold"
            />
            <StatTile
              label="PM Compliance"
              value={`${kpis.pmCompliance.toFixed(0)}%`}
              hint="Inspection schedules"
            />
          </div>
        }
      >
        {/* top grid: assets + work orders */}
        <div className="edge-fleet-grid">
          {/* Asset health + optimization */}
          <section>
            <h3 className="edge-section-label">Asset health & optimization</h3>

            <div className="edge-form-grid">
              <div>
                <label className="edge-field-label">Alert channel</label>
                <select
                  value={alertChannel}
                  onChange={(e) => setAlertChannel(e.target.value)}
                  className="edge-input"
                >
                  <option value="email">Email</option>
                  <option value="sms">Text</option>
                </select>
              </div>
              <div>
                <label className="edge-field-label">
                  {alertChannel === "email" ? "Email" : "Phone"}
                </label>
                <input
                  type="text"
                  value={alertTarget}
                  onChange={(e) => setAlertTarget(e.target.value)}
                  placeholder={
                    alertChannel === "email"
                      ? "name@hubgroup.com"
                      : "+1 555 555 1234"
                  }
                  className="edge-input"
                />
              </div>
              <div style={{ alignSelf: "flex-end" }}>
                <button
                  className="edge-btn"
                  type="button"
                  onClick={onSubscribe}
                >
                  Subscribe for this asset
                </button>
              </div>
            </div>

            <AssetTable
              assets={assets}
              requirements={requirements}
              selectedAssetId={selectedAssetId}
              onSelectAsset={setSelectedAssetId}
            />

            {selectedAsset && selectedPlan && (
              <div className="edge-fleet-analytics">
                <div className="edge-fleet-analytics-title">
                  Optimized work scope for {selectedAsset.id}
                </div>
                <div className="edge-fleet-chip-row">
                  <span className="edge-fleet-chip">
                    Health {selectedPlan.currentHealth.toFixed(0)} →{" "}
                    {selectedPlan.projectedHealth.toFixed(0)}
                  </span>
                  <span className="edge-fleet-chip">
                    Reg risk {selectedPlan.currentReg.toFixed(0)} →{" "}
                    {selectedPlan.projectedReg.toFixed(0)}
                  </span>
                  <span className="edge-fleet-chip">
                    Est cost ${selectedPlan.totalCostUsd.toFixed(0)}
                  </span>
                  <span className="edge-fleet-chip">
                    Est downtime {selectedPlan.totalDowntimeHours.toFixed(1)} hrs
                  </span>
                </div>
                <ul className="edge-list">
                  {selectedPlan.tasks.map((t) => (
                    <li key={t.code}>
                      {t.description} · {t.laborHours.toFixed(1)}h labor
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* Work order + LLM console */}
          <section>
            <h3 className="edge-section-label">
              LLM work orders & technician console
            </h3>

            <div className="edge-fleet-wo-header">
              <div>
                <div className="edge-field-label">Technician</div>
                <input
                  type="text"
                  value={techName}
                  onChange={(e) => setTechName(e.target.value)}
                  placeholder="Name / employee ID"
                  className="edge-input"
                />
              </div>
              <div>
                <div className="edge-field-label">Work order</div>
                <select
                  value={selectedWoId || ""}
                  onChange={(e) => setSelectedWoId(e.target.value || null)}
                  className="edge-input"
                >
                  {workOrders.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.id} · {w.assetId}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectedWo && (
              <>
                <div className="edge-fleet-chip-row" style={{ marginBottom: 8 }}>
                  <span className="edge-fleet-chip">
                    Status: {selectedWo.status}
                  </span>
                  <span className="edge-fleet-chip">
                    Asset: {selectedWo.assetId}
                  </span>
                  <span className="edge-fleet-chip">
                    Est cost ${selectedWo.estTotalCostUsd.toFixed(0)}
                  </span>
                  <span className="edge-fleet-chip">
                    Est labor {selectedWo.estLaborHours.toFixed(1)} hrs
                  </span>
                </div>

                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  {["Draft", "Released", "In Progress", "Completed"].map(
                    (s) => (
                      <button
                        key={s}
                        type="button"
                        className={`edge-btn ghost ${
                          selectedWo.status === s ? "active" : ""
                        }`}
                        onClick={() => onUpdateWoStatus(s)}
                      >
                        {s}
                      </button>
                    )
                  )}
                </div>

                <div style={{ marginBottom: 8 }}>
                  <div className="edge-field-label">Operator instructions</div>
                  <pre
                    style={{
                      maxHeight: 140,
                      overflow: "auto",
                      fontSize: 12,
                      whiteSpace: "pre-wrap",
                      background: "rgba(7,10,18,0.9)",
                      borderRadius: 10,
                      padding: 8,
                      border: "1px solid rgba(148,163,184,0.4)",
                    }}
                  >
                    {selectedWo.instructions ||
                      "Use the LLM generator to attach friendly instructions for this work scope."}
                  </pre>
                  <button
                    className="edge-btn"
                    type="button"
                    onClick={onGenerateInstructions}
                    disabled={llmBusy}
                    style={{ marginTop: 6 }}
                  >
                    {llmBusy ? "Calling LLM..." : "Generate instructions with LLM"}
                  </button>
                </div>

                <div style={{ marginBottom: 8 }}>
                  <div className="edge-field-label">Parts needed</div>
                  <ul className="edge-list">
                    {selectedWo.parts.map((p, idx) => (
                      <li key={idx}>
                        {p.partNumber} · {p.description} — Qty {p.qty} · $
                        {p.unitCostUsd.toFixed(0)} each
                      </li>
                    ))}
                  </ul>
                  <button
                    className="edge-btn ghost"
                    type="button"
                    style={{ marginTop: 4 }}
                    onClick={() =>
                      setAlertMessage("Parts order pushed to ERP (mock).")
                    }
                  >
                    Place parts order (ERP mock)
                  </button>
                </div>

                <div>
                  <div className="edge-field-label">
                    Voice / typed notes (AWS Transcribe ready)
                  </div>
                  <textarea
                    className="edge-fleet-textarea"
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Paste an AWS Transcribe transcript here or type a diagnostic / road test note."
                  />
                  <button
                    className="edge-btn"
                    type="button"
                    onClick={onSaveNote}
                    style={{ marginTop: 6 }}
                  >
                    Save note to work order
                  </button>

                  {selectedWo.notes && selectedWo.notes.length > 0 && (
                    <ul className="edge-list">
                      {selectedWo.notes.map((n) => (
                        <li key={n.id}>
                          {n.text} — {n.author},{" "}
                          {new Date(n.createdAt).toLocaleString()}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}

            {alertMessage && (
              <p className="edge-error" style={{ marginTop: 10 }}>
                {alertMessage}
              </p>
            )}
          </section>
        </div>

        {/* Leadership analytics */}
        <FleetAnalytics history={history} />
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub‑components
// ---------------------------------------------------------------------------

function AssetTable({ assets, requirements, selectedAssetId, onSelectAsset }) {
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    return assets
      .filter((a) => {
        if (!q) return true;
        return (
          a.id.toLowerCase().includes(q) ||
          a.hub.toLowerCase().includes(q) ||
          a.type.toLowerCase().includes(q)
        );
      })
      .slice(0, 60);
  }, [assets, filter]);

  const requirementByAsset = useMemo(() => {
    const map = {};
    requirements.forEach((r) => {
      map[r.assetId] = r;
    });
    return map;
  }, [requirements]);

  return (
    <div>
      <div className="edge-fleet-wo-header">
        <div className="edge-field-label">Fleet assets</div>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by asset, hub, or type..."
          className="edge-input"
          style={{ maxWidth: 260 }}
        />
      </div>
      <div
        style={{
          maxHeight: 260,
          overflow: "auto",
          borderRadius: 10,
          border: "1px solid rgba(148,163,184,0.35)",
        }}
      >
        <table className="edge-fleet-table">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Type</th>
              <th>Hub</th>
              <th>Health</th>
              <th>Util.</th>
              <th>Alerts</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => {
              const band = healthBand(a.healthScore);
              const req = requirementByAsset[a.id];
              const isSelected = selectedAssetId === a.id;
              return (
                <tr
                  key={a.id}
                  className={isSelected ? "is-selected" : ""}
                  onClick={() => onSelectAsset(isSelected ? null : a.id)}
                >
                  <td>{a.id}</td>
                  <td>{a.type}</td>
                  <td>{a.hub}</td>
                  <td>
                    {a.healthScore.toFixed(0)}{" "}
                    <span className="edge-fleet-badge">{band}</span>
                  </td>
                  <td>{a.utilizationPct.toFixed(0)}%</td>
                  <td>
                    {a.openAlerts}
                    {req && (
                      <span className="edge-fleet-badge" style={{ marginLeft: 6 }}>
                        {req.severity}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FleetAnalytics({ history }) {
  if (!history.length) return null;

  const width = 760;
  const height = 180;
  const padding = 30;

  const xs = history.map((_, i) =>
    padding + ((width - 2 * padding) * i) / (history.length - 1 || 1)
  );

  const maxHealth = 100;
  const maxDowntime = Math.max(...history.map((h) => h.downtimePct), 10);
  const maxCost = Math.max(...history.map((h) => h.maintenanceCostUsd));

  const healthPoints = history
    .map((p, i) => {
      const x = xs[i];
      const y =
        height -
        padding -
        ((height - 2 * padding) * p.avgHealth) / maxHealth;
      return `${x},${y}`;
    })
    .join(" ");

  const downtimePoints = history
    .map((p, i) => {
      const x = xs[i];
      const y =
        height -
        padding -
        ((height - 2 * padding) * p.downtimePct) / maxDowntime;
      return `${x},${y}`;
    })
    .join(" ");

  const costPoints = history
    .map((p, i) => {
      const x = xs[i];
      const y =
        height -
        padding -
        ((height - 2 * padding) * p.maintenanceCostUsd) / maxCost;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div style={{ marginTop: 20 }}>
      <div className="edge-fleet-analytics-title">
        Fleet health, downtime, and maintenance spend (mock, monthly)
      </div>
      <svg width={width} height={height}>
        {/* axes */}
        <line
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          stroke="rgba(148,163,184,0.7)"
          strokeWidth={0.8}
        />
        <line
          x1={padding}
          y1={padding}
          x2={padding}
          y2={height - padding}
          stroke="rgba(148,163,184,0.7)"
          strokeWidth={0.8}
        />
        {/* series */}
        <polyline
          points={healthPoints}
          fill="none"
          stroke="#22c55e"
          strokeWidth={1.6}
        />
        <polyline
          points={downtimePoints}
          fill="none"
          stroke="#38bdf8"
          strokeWidth={1.4}
        />
        <polyline
          points={costPoints}
          fill="none"
          stroke="#f97316"
          strokeWidth={1.4}
          strokeDasharray="4 4"
        />
        {/* legend */}
        <g>
          <circle cx={padding + 4} cy={padding - 12} r={3} fill="#22c55e" />
          <text
            x={padding + 10}
            y={padding - 9}
            fontSize={10}
            fill="#e5e7eb"
          >
            Health score
          </text>
          <circle cx={padding + 110} cy={padding - 12} r={3} fill="#38bdf8" />
          <text
            x={padding + 116}
            y={padding - 9}
            fontSize={10}
            fill="#e5e7eb"
          >
            Downtime %
          </text>
          <circle cx={padding + 200} cy={padding - 12} r={3} fill="#f97316" />
          <text
            x={padding + 206}
            y={padding - 9}
            fontSize={10}
            fill="#e5e7eb"
          >
            Maintenance cost (indexed)
          </text>
        </g>
        {/* month labels */}
        {history.map((p, i) => (
          <text
            key={p.date}
            x={xs[i]}
            y={height - padding + 12}
            fontSize={9}
            fill="rgba(148,163,184,0.8)"
            textAnchor="middle"
          >
            {new Date(p.date).toLocaleDateString(undefined, { month: "short" })}
          </text>
        ))}
      </svg>
    </div>
  );
}
