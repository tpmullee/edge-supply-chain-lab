import React, { useEffect, useState } from "react";
import Card from "../components/shared/Card.jsx";
import StatTile from "../components/shared/StatTile.jsx";

const API = "http://127.0.0.1:8000";

export default function DataLab() {
  const [mode, setMode] = useState("sample");

  // TMS normalizer
  const [tmsSummary, setTmsSummary] = useState(null);
  const [tmsErr, setTmsErr] = useState("");
  const [uploading, setUploading] = useState(false);

  // pipeline
  const [pipeline, setPipeline] = useState(null);
  const [manifest, setManifest] = useState([]);

  // dev portal
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState("free");
  const [newKey, setNewKey] = useState(null);
  const [keys, setKeys] = useState([]);
  const [samples, setSamples] = useState([]);
  const [devErr, setDevErr] = useState("");

  // data quality - address
  const [address, setAddress] = useState({
    street: "123 Supply Chain Way",
    city: "Seattle",
    state: "wa",
    postal_code: "98101",
    country: "US",
  });
  const [addressResult, setAddressResult] = useState(null);
  const [addrErr, setAddrErr] = useState("");

  // data quality - dedupe
  const [names, setNames] = useState([
    "Acme Logistics LLC",
    "ACME Logistic",
    "Global Freight Partners",
    "Global Freight Partner",
  ]);
  const [threshold, setThreshold] = useState(90);
  const [dedupeResult, setDedupeResult] = useState(null);
  const [dedupeErr, setDedupeErr] = useState("");

  useEffect(() => {
    loadPipeline();
    loadKeys();
    loadSamples();
  }, [mode]);

  async function loadPipeline() {
    try {
      const res = await fetch(
        `${API}/tms/pipeline-summary?mode=${encodeURIComponent(mode)}`
      ).then((r) => r.json());
      const mani = await fetch(`${API}/tms/sample-manifest`).then((r) =>
        r.json()
      );
      setPipeline(res);
      setManifest(mani);
    } catch {
      // soft fail
    }
  }

  async function loadKeys() {
    try {
      const res = await fetch(`${API}/devportal/keys`).then((r) => r.json());
      setKeys(res);
    } catch {
      // ignore
    }
  }

  async function loadSamples() {
    try {
      const res = await fetch(`${API}/devportal/sample-requests`).then((r) =>
        r.json()
      );
      setSamples(res);
    } catch {
      // ignore
    }
  }

  async function handleTmsUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setTmsErr("");
    setTmsSummary(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API}/tms/normalize`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setTmsSummary(json);
    } catch (err) {
      setTmsErr(err.message || String(err));
    } finally {
      setUploading(false);
    }
  }

  async function handleSignup(e) {
    e.preventDefault();
    setDevErr("");
    setNewKey(null);
    try {
      const res = await fetch(`${API}/devportal/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, plan }),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setNewKey(json.api_key);
      setEmail("");
      await loadKeys();
    } catch (err) {
      setDevErr(err.message || String(err));
    }
  }

  const handleAddressField = (field) => (e) => {
    setAddress((a) => ({ ...a, [field]: e.target.value }));
  };

  async function handleAddressValidate(e) {
    e.preventDefault();
    setAddrErr("");
    setAddressResult(null);
    try {
      const res = await fetch(`${API}/data-quality/validate-address`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(address),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setAddressResult(json);
    } catch (err) {
      setAddrErr(err.message || String(err));
    }
  }

  const handleNameChange = (idx) => (e) => {
    const value = e.target.value;
    setNames((rows) => rows.map((r, i) => (i === idx ? value : r)));
  };

  const addNameRow = () => setNames((rows) => [...rows, ""]);

  const removeNameRow = (idx) =>
    setNames((rows) => rows.filter((_, i) => i !== idx));

  async function handleDedupe(e) {
    e.preventDefault();
    setDedupeErr("");
    setDedupeResult(null);
    try {
      const records = names
        .map((n) => n.trim())
        .filter((n) => n.length > 0)
        .map((n) => ({ full_name: n }));
      const body = { records, threshold: Number(threshold) || 0 };
      const res = await fetch(`${API}/data-quality/dedupe-names`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setDedupeResult(json);
    } catch (err) {
      setDedupeErr(err.message || String(err));
    }
  }

  return (
    <div className="edge-lab">
      <h1 className="edge-lab-title">Data & Developer APIs</h1>
      <p className="edge-lab-subtitle">
        Onboarding messy exports, validating master data, and exposing curated
        intelligence as APIs.
      </p>

      <div className="edge-lab-grid edge-lab-grid-2">
        <Card
          title="TMS Data Normalizer"
          subtitle="Upload a CSV export from a TMS and get a quick data readiness score."
        >
          <label className="edge-file-label">
            <span className="edge-button edge-button-secondary">
              {uploading ? "Uploading…" : "Choose CSV export"}
            </span>
            <input
              type="file"
              hidden
              accept=".csv,text/csv"
              onChange={handleTmsUpload}
            />
          </label>
          {tmsErr && <p className="edge-error">{tmsErr}</p>}
          {tmsSummary && (
            <>
              <div className="edge-stat-row">
                <StatTile
                  label="Rows"
                  value={tmsSummary.n_rows.toLocaleString()}
                />
                <StatTile
                  label="Columns"
                  value={tmsSummary.n_columns.toString()}
                />
                <StatTile
                  label="Ready for analytics?"
                  value={tmsSummary.has_required_fields ? "Yes" : "No"}
                />
              </div>
              <p className="edge-muted">
                Required fields: load, stop, and arrival/departure timestamps.
              </p>
              <h3 className="edge-table-title">Missing values</h3>
              <table className="edge-table">
                <thead>
                  <tr>
                    <th>Column</th>
                    <th>Missing rows</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(tmsSummary.missing_by_column).map(
                    ([col, miss]) => (
                      <tr key={col}>
                        <td>{col}</td>
                        <td>{miss}</td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </>
          )}
          {!tmsSummary && !tmsErr && (
            <p className="edge-muted">
              No file uploaded yet. Use a sample TMS export to see the
              normalization summary.
            </p>
          )}
        </Card>

        <Card
          title="Developer API portal"
          subtitle="Issue keys and explore ETA / dwell / emissions APIs as products."
        >
          <form className="edge-form" onSubmit={handleSignup}>
            <div className="edge-field-row">
              <div className="edge-field">
                <label className="edge-field-label">Email</label>
                <input
                  type="email"
                  className="edge-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="edge-field">
                <label className="edge-field-label">Plan</label>
                <select
                  className="edge-select"
                  value={plan}
                  onChange={(e) => setPlan(e.target.value)}
                >
                  <option value="free">Free</option>
                  <option value="growth">Growth</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
            </div>
            <button type="submit" className="edge-button">
              Generate API key
            </button>
          </form>
          {devErr && <p className="edge-error">{devErr}</p>}
          {newKey && (
            <p className="edge-success">
              Your new key: <code>{newKey}</code>
            </p>
          )}

          <h3 className="edge-table-title">Issued keys (demo)</h3>
          {keys.length === 0 ? (
            <p className="edge-muted">No keys yet.</p>
          ) : (
            <table className="edge-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Plan</th>
                  <th>Key</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.api_key}>
                    <td>{k.email}</td>
                    <td>{k.plan}</td>
                    <td>
                      <code>{k.api_key}</code>
                    </td>
                    <td>{k.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h3 className="edge-table-title">Sample requests</h3>
          <ul className="edge-list">
            {samples.map((s, idx) => (
              <li key={idx}>
                <strong>{s.label}</strong>
                <pre className="edge-code-snippet">{s.snippet}</pre>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="edge-lab-grid edge-lab-grid-2">
        <Card
          title="Address validation"
          subtitle="Offline-friendly normalization inspired by USPS + Smarty integration."
        >
          <form className="edge-form" onSubmit={handleAddressValidate}>
            <div className="edge-field-row">
              <div className="edge-field">
                <label className="edge-field-label">Street</label>
                <input
                  className="edge-input"
                  value={address.street}
                  onChange={handleAddressField("street")}
                />
              </div>
            </div>
            <div className="edge-field-row">
              <div className="edge-field">
                <label className="edge-field-label">City</label>
                <input
                  className="edge-input"
                  value={address.city}
                  onChange={handleAddressField("city")}
                />
              </div>
              <div className="edge-field">
                <label className="edge-field-label">State</label>
                <input
                  className="edge-input"
                  value={address.state}
                  onChange={handleAddressField("state")}
                />
              </div>
              <div className="edge-field">
                <label className="edge-field-label">ZIP / Postal</label>
                <input
                  className="edge-input"
                  value={address.postal_code}
                  onChange={handleAddressField("postal_code")}
                />
              </div>
              <div className="edge-field">
                <label className="edge-field-label">Country</label>
                <input
                  className="edge-input"
                  value={address.country}
                  onChange={handleAddressField("country")}
                />
              </div>
            </div>
            <button type="submit" className="edge-button">
              Validate address
            </button>
          </form>
          {addrErr && <p className="edge-error">{addrErr}</p>}
          {addressResult && (
            <>
              <div className="edge-stat-row">
                <StatTile
                  label="Status"
                  value={addressResult.status.toUpperCase()}
                />
              </div>
              <h3 className="edge-table-title">Normalized</h3>
              <ul className="edge-list">
                <li>
                  {addressResult.normalized.street},{" "}
                  {addressResult.normalized.city},{" "}
                  {addressResult.normalized.state}{" "}
                  {addressResult.normalized.postal_code}{" "}
                  {addressResult.normalized.country}
                </li>
              </ul>
              {addressResult.messages.length > 0 && (
                <>
                  <h3 className="edge-table-title">Messages</h3>
                  <ul className="edge-list">
                    {addressResult.messages.map((m, idx) => (
                      <li key={idx}>{m}</li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </Card>

        <Card
          title="Duplicate name detection"
          subtitle="Cluster near-duplicate entities (carriers, customers, facilities)."
        >
          <form className="edge-form" onSubmit={handleDedupe}>
            <div className="edge-field-row">
              <div className="edge-field">
                <label className="edge-field-label">Threshold</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  className="edge-input"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                />
              </div>
            </div>
            <table className="edge-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {names.map((n, idx) => (
                  <tr key={idx}>
                    <td>
                      <input
                        className="edge-input edge-input-sm"
                        value={n}
                        onChange={handleNameChange(idx)}
                      />
                    </td>
                    <td>
                      {names.length > 1 && (
                        <button
                          type="button"
                          className="edge-link-button"
                          onClick={() => removeNameRow(idx)}
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
                onClick={addNameRow}
              >
                + Add name
              </button>
              <button type="submit" className="edge-button">
                Detect duplicates
              </button>
            </div>
          </form>
          {dedupeErr && <p className="edge-error">{dedupeErr}</p>}
          {dedupeResult && (
            <>
              <div className="edge-stat-row">
                <StatTile
                  label="Total records"
                  value={dedupeResult.total_records.toString()}
                />
                <StatTile
                  label="Unique (approx)"
                  value={dedupeResult.unique_count.toString()}
                />
                <StatTile
                  label="Duplicate groups"
                  value={dedupeResult.clusters.length.toString()}
                />
              </div>
              {dedupeResult.clusters.length > 0 ? (
                <>
                  <h3 className="edge-table-title">Clusters</h3>
                  <ul className="edge-list">
                    {dedupeResult.clusters.map((c, idx) => (
                      <li key={idx}>
                        <strong>{c.representative}</strong>
                        <ul className="edge-list">
                          {c.members.map((m, j) => (
                            <li key={j}>{m.full_name || ""}</li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="edge-muted">No duplicate clusters found.</p>
              )}
            </>
          )}
        </Card>
      </div>

      <Card
        title="Curated pipeline overview"
        subtitle="RAW → CURATED lane averages and dwell stats, simulated locally."
      >
        <div className="edge-field-row">
          <div className="edge-field">
            <label className="edge-field-label">Mode</label>
            <select
              className="edge-select"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              <option value="sample">Sample (local CSV)</option>
              <option value="live">Live (conceptual)</option>
            </select>
          </div>
        </div>
        {pipeline && (
          <div className="edge-stat-row">
            <StatTile
              label="Last refresh"
              value={new Date(pipeline.last_refresh_at).toLocaleString()}
            />
            <StatTile
              label="Raw files"
              value={pipeline.raw_files.toString()}
            />
            <StatTile
              label="Curated lanes"
              value={pipeline.curated_lanes.toString()}
            />
            <StatTile
              label="Curated dwell lanes"
              value={pipeline.curated_dwell.toString()}
            />
          </div>
        )}
        <h3 className="edge-table-title">Ingest manifest (sample)</h3>
        <table className="edge-table">
          <thead>
            <tr>
              <th>File</th>
              <th>Last processed</th>
              <th>Changed?</th>
            </tr>
          </thead>
          <tbody>
            {manifest.map((m) => (
              <tr key={m.file_name}>
                <td>{m.file_name}</td>
                <td>{m.last_processed_at}</td>
                <td>{m.changed ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
