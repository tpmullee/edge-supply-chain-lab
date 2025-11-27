import React, { useEffect, useState } from "react";
import Card from "../components/shared/Card.jsx";
import StatTile from "../components/shared/StatTile.jsx";

const API = "http://127.0.0.1:8000";

async function jsonFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
}

export default function EtaLab() {
  // training
  const [trainCfg, setTrainCfg] = useState({
    n_samples: 3000,
    test_size: 0.2,
    random_state: 42,
  });
  const [trainResult, setTrainResult] = useState(null);
  const [trainErr, setTrainErr] = useState("");

  // prediction
  const [predictInput, setPredictInput] = useState({
    distance_km: 800,
    hour_of_day: 9,
    day_of_week: 1,
  });
  const [prediction, setPrediction] = useState(null);
  const [predErr, setPredErr] = useState("");

  // lane list + compare
  const [lanes, setLanes] = useState([]);
  const [compareInput, setCompareInput] = useState({
    lane: "",
    distance_km: 800,
    hour_of_day: 9,
    day_of_week: 1,
  });
  const [compareResult, setCompareResult] = useState(null);
  const [compareErr, setCompareErr] = useState("");

  // door-to-door
  const [doorResult, setDoorResult] = useState(null);
  const [doorErr, setDoorErr] = useState("");

  useEffect(() => {
    loadLanes();
  }, []);

  async function loadLanes() {
    try {
      const data = await jsonFetch("/eta/lanes");
      setLanes(data);
      if (data.length && !compareInput.lane) {
        setCompareInput((c) => ({ ...c, lane: data[0].lane }));
      }
    } catch {
      // soft fail, still usable
    }
  }

  async function handleTrain(e) {
    e.preventDefault();
    setTrainErr("");
    try {
      const res = await jsonFetch("/eta/train", {
        method: "POST",
        body: JSON.stringify(trainCfg),
      });
      setTrainResult(res);
    } catch (err) {
      setTrainErr(err.message || String(err));
    }
  }

  async function handlePredict(e) {
    e.preventDefault();
    setPredErr("");
    try {
      const res = await jsonFetch("/eta/predict", {
        method: "POST",
        body: JSON.stringify(predictInput),
      });
      setPrediction(res);
    } catch (err) {
      setPredErr(err.message || String(err));
    }
  }

  async function handleCompare(e) {
    e.preventDefault();
    setCompareErr("");
    try {
      const res = await jsonFetch("/eta/compare", {
        method: "POST",
        body: JSON.stringify(compareInput),
      });
      setCompareResult(res);
    } catch (err) {
      setCompareErr(err.message || String(err));
    }
  }

  async function handleDoorToDoor(e) {
    e.preventDefault();
    setDoorErr("");
    try {
      const body = {
        lane: compareInput.lane,
        distance_km: compareInput.distance_km,
        hour_of_day: compareInput.hour_of_day,
        day_of_week: compareInput.day_of_week,
      };
      const res = await jsonFetch("/eta/door-to-door", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setDoorResult(res);
    } catch (err) {
      setDoorErr(err.message || String(err));
    }
  }

  const handleTrainField = (field) => (e) => {
    setTrainCfg((c) => ({ ...c, [field]: Number(e.target.value) }));
  };

  const handlePredictField = (field) => (e) => {
    setPredictInput((c) => ({ ...c, [field]: Number(e.target.value) }));
  };

  const handleCompareField = (field) => (e) => {
    const value =
      field === "lane" ? e.target.value : Number(e.target.value || 0);
    setCompareInput((c) => ({ ...c, [field]: value }));
  };

  return (
    <div className="edge-lab">
      <h1 className="edge-lab-title">On-Time & ETA Studio</h1>
      <p className="edge-lab-subtitle">
        Train an ETA model, compare against lane averages, and see
        dwell-adjusted, door-to-door lead times.
      </p>

      <div className="edge-lab-grid edge-lab-grid-3">
        <Card
          title="Train ETA model"
          subtitle="RandomForest on synthetic lanes to approximate linehaul transit."
        >
          <form className="edge-form" onSubmit={handleTrain}>
            <div className="edge-field-row">
              <div className="edge-field">
                <label className="edge-field-label">Samples</label>
                <input
                  type="number"
                  min="500"
                  max="20000"
                  value={trainCfg.n_samples}
                  onChange={handleTrainField("n_samples")}
                  className="edge-input"
                />
              </div>
              <div className="edge-field">
                <label className="edge-field-label">Test size</label>
                <input
                  type="number"
                  step="0.05"
                  min="0.1"
                  max="0.4"
                  value={trainCfg.test_size}
                  onChange={handleTrainField("test_size")}
                  className="edge-input"
                />
              </div>
              <div className="edge-field">
                <label className="edge-field-label">Random seed</label>
                <input
                  type="number"
                  value={trainCfg.random_state}
                  onChange={handleTrainField("random_state")}
                  className="edge-input"
                />
              </div>
            </div>
            <button type="submit" className="edge-button">
              Train model
            </button>
          </form>
          {trainErr && <p className="edge-error">{trainErr}</p>}
          {trainResult && (
            <div className="edge-stat-row">
              <StatTile
                label="Samples"
                value={trainResult.n_samples.toLocaleString()}
              />
              <StatTile
                label="MAE (minutes)"
                value={(trainResult.mae_seconds / 60).toFixed(1)}
              />
            </div>
          )}
        </Card>

        <Card
          title="Point ETA prediction"
          subtitle="Single-shipment ETA using the trained model."
        >
          <form className="edge-form" onSubmit={handlePredict}>
            <div className="edge-field-row">
              <div className="edge-field">
                <label className="edge-field-label">Distance (km)</label>
                <input
                  type="number"
                  min="1"
                  value={predictInput.distance_km}
                  onChange={handlePredictField("distance_km")}
                  className="edge-input"
                />
              </div>
              <div className="edge-field">
                <label className="edge-field-label">Hour of day</label>
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={predictInput.hour_of_day}
                  onChange={handlePredictField("hour_of_day")}
                  className="edge-input"
                />
              </div>
              <div className="edge-field">
                <label className="edge-field-label">Day of week</label>
                <input
                  type="number"
                  min="0"
                  max="6"
                  value={predictInput.day_of_week}
                  onChange={handlePredictField("day_of_week")}
                  className="edge-input"
                />
              </div>
            </div>
            <button type="submit" className="edge-button">
              Predict ETA
            </button>
          </form>
          {predErr && <p className="edge-error">{predErr}</p>}
          {prediction && (
            <div className="edge-stat-row">
              <StatTile
                label="ETA (minutes)"
                value={prediction.eta_minutes.toFixed(1)}
              />
              <StatTile
                label="ETA (hours)"
                value={(prediction.eta_minutes / 60).toFixed(2)}
              />
            </div>
          )}
        </Card>

        <Card
          title="Baseline vs ML ETA"
          subtitle="Lane-average baseline vs naive distance and the ML model."
          right={
            <select
              className="edge-select"
              value={compareInput.lane}
              onChange={handleCompareField("lane")}
            >
              {lanes.map((l) => (
                <option key={l.lane} value={l.lane}>
                  {l.lane} ({l.origin}→{l.destination})
                </option>
              ))}
            </select>
          }
        >
          <form className="edge-form" onSubmit={handleCompare}>
            <div className="edge-field-row">
              <div className="edge-field">
                <label className="edge-field-label">Distance (km)</label>
                <input
                  type="number"
                  min="1"
                  value={compareInput.distance_km}
                  onChange={handleCompareField("distance_km")}
                  className="edge-input"
                />
              </div>
              <div className="edge-field">
                <label className="edge-field-label">Hour</label>
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={compareInput.hour_of_day}
                  onChange={handleCompareField("hour_of_day")}
                  className="edge-input"
                />
              </div>
              <div className="edge-field">
                <label className="edge-field-label">Day</label>
                <input
                  type="number"
                  min="0"
                  max="6"
                  value={compareInput.day_of_week}
                  onChange={handleCompareField("day_of_week")}
                  className="edge-input"
                />
              </div>
            </div>
            <button type="submit" className="edge-button">
              Compare strategies
            </button>
          </form>
          {compareErr && <p className="edge-error">{compareErr}</p>}
          {compareResult && (
            <>
              <div className="edge-stat-row">
                <StatTile
                  label="Naive ETA (min)"
                  value={compareResult.naive_eta_minutes.toFixed(1)}
                />
                {compareResult.baseline_eta_minutes != null && (
                  <StatTile
                    label="Lane baseline (min)"
                    value={compareResult.baseline_eta_minutes.toFixed(1)}
                  />
                )}
                <StatTile
                  label="ML ETA (min)"
                  value={compareResult.ml_eta_minutes.toFixed(1)}
                />
              </div>
              <ul className="edge-list">
                {compareResult.breakdown.map((b, idx) => (
                  <li key={idx}>
                    {b.label}:{" "}
                    <strong>{b.eta_minutes.toFixed(1)} min</strong>
                    {b.notes && <> — {b.notes}</>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      <Card
        title="Door-to-door lead time"
        subtitle="ETA + dwell to get a total door-to-door expectation."
      >
        <form className="edge-form" onSubmit={handleDoorToDoor}>
          <div className="edge-field-row">
            <div className="edge-field">
              <label className="edge-field-label">Lane</label>
              <select
                className="edge-select"
                value={compareInput.lane}
                onChange={handleCompareField("lane")}
              >
                {lanes.map((l) => (
                  <option key={l.lane} value={l.lane}>
                    {l.lane} ({l.origin}→{l.destination})
                  </option>
                ))}
              </select>
            </div>
            <div className="edge-field">
              <label className="edge-field-label">Distance (km)</label>
              <input
                type="number"
                min="1"
                value={compareInput.distance_km}
                onChange={handleCompareField("distance_km")}
                className="edge-input"
              />
            </div>
            <div className="edge-field">
              <label className="edge-field-label">Hour</label>
              <input
                type="number"
                min="0"
                max="23"
                value={compareInput.hour_of_day}
                onChange={handleCompareField("hour_of_day")}
                className="edge-input"
              />
            </div>
            <div className="edge-field">
              <label className="edge-field-label">Day</label>
              <input
                type="number"
                min="0"
                max="6"
                value={compareInput.day_of_week}
                onChange={handleCompareField("day_of_week")}
                className="edge-input"
              />
            </div>
          </div>
          <button type="submit" className="edge-button">
            Calculate door-to-door
          </button>
        </form>
        {doorErr && <p className="edge-error">{doorErr}</p>}
        {doorResult && (
          <div className="edge-stat-row">
            <StatTile
              label="Transit (hrs)"
              value={doorResult.transit_hours.toFixed(1)}
            />
            <StatTile
              label="Dwell (hrs)"
              value={doorResult.dwell_hours.toFixed(1)}
            />
            <StatTile
              label="Total lead time (hrs)"
              value={doorResult.total_hours.toFixed(1)}
            />
            <StatTile
              label="Dwell share %"
              value={(doorResult.dwell_share * 100).toFixed(1)}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
