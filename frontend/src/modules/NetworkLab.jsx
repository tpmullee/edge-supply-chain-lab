import React, { useEffect, useState } from "react";
import Card from "../components/shared/Card.jsx";
import StatTile from "../components/shared/StatTile.jsx";

const API = "http://127.0.0.1:8000";

async function getJson(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function NetworkLab() {
  const [coverage, setCoverage] = useState([]);
  const [slowSegments, setSlowSegments] = useState([]);
  const [dwellHotspots, setDwellHotspots] = useState([]);
  const [slaBreaches, setSlaBreaches] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [cov, segs, hot, sla] = await Promise.all([
          getJson("/network/state-coverage"),
          getJson("/network/slow-segments?top_n=6"),
          getJson("/network/dwell-hotspots?top_n=6"),
          getJson("/dwell/sla-breaches?sla_hours=24"),
        ]);
        setCoverage(cov);
        setSlowSegments(segs);
        setDwellHotspots(hot);
        setSlaBreaches(sla);
      } catch (e) {
        setErr(e.message || String(e));
      }
    })();
  }, []);

  const totalStores = coverage.reduce((acc, c) => acc + c.store_count, 0);

  return (
    <div className="edge-lab">
      <h1 className="edge-lab-title">Network & Flow</h1>
      <p className="edge-lab-subtitle">
        Where the network is dense, where it’s slow, and which lanes are
        structurally at risk because of dwell.
      </p>

      <div className="edge-lab-grid edge-lab-grid-2">
        <Card
          title="Coverage by state"
          subtitle="Rough view of where nodes / facilities are concentrated."
        >
          {coverage.length === 0 ? (
            <p className="edge-muted">
              No coverage data yet. Add{" "}
              <code>stores_sample.csv</code> under <code>backend/data</code>.
            </p>
          ) : (
            <>
              <div className="edge-stat-row">
                <StatTile
                  label="States"
                  value={coverage.length.toString()}
                />
                <StatTile
                  label="Total locations"
                  value={totalStores.toString()}
                />
              </div>
              <table className="edge-table">
                <thead>
                  <tr>
                    <th>State</th>
                    <th>Locations</th>
                  </tr>
                </thead>
                <tbody>
                  {coverage.map((row) => (
                    <tr key={row.state}>
                      <td>{row.state}</td>
                      <td>{row.store_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Card>

        <Card
          title="Slowest segments"
          subtitle="Segment-level transit where p90 time is highest."
        >
          {slowSegments.length === 0 ? (
            <p className="edge-muted">
              No segment stats yet. Add{" "}
              <code>segments_sample.csv</code> under <code>backend/data</code>.
            </p>
          ) : (
            <table className="edge-table">
              <thead>
                <tr>
                  <th>Lane</th>
                  <th>Segment</th>
                  <th>From → To</th>
                  <th>Avg hrs</th>
                  <th>P90 hrs</th>
                </tr>
              </thead>
              <tbody>
                {slowSegments.map((s) => (
                  <tr key={s.segment_id}>
                    <td>{s.lane}</td>
                    <td>{s.segment_id}</td>
                    <td>
                      {s.origin_node} → {s.dest_node}
                    </td>
                    <td>{s.avg_transit_hours.toFixed(1)}</td>
                    <td>{s.p90_transit_hours.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <Card
        title="Dwell risk & SLA breaches"
        subtitle="Lanes where dwell is structurally risky or already breaching SLA."
      >
        {err && <p className="edge-error">{err}</p>}

        <div className="edge-stat-row">
          <StatTile
            label="Dwell hotspots"
            value={dwellHotspots.length.toString()}
          />
          <StatTile
            label="Lanes breaching 24h P90 dwell"
            value={slaBreaches.length.toString()}
          />
        </div>

        <div className="edge-lab-grid edge-lab-grid-2">
          <div>
            <h3 className="edge-table-title">Top dwell risk lanes</h3>
            {dwellHotspots.length === 0 ? (
              <p className="edge-muted">
                Add <code>dwell_stats.csv</code> under <code>backend/data</code>{" "}
                for a richer view.
              </p>
            ) : (
              <table className="edge-table">
                <thead>
                  <tr>
                    <th>Lane</th>
                    <th>Avg dwell (h)</th>
                    <th>P90 dwell (h)</th>
                    <th>Risk score</th>
                  </tr>
                </thead>
                <tbody>
                  {dwellHotspots.map((d) => (
                    <tr key={d.lane}>
                      <td>{d.lane}</td>
                      <td>{d.avg_dwell_hours.toFixed(1)}</td>
                      <td>{d.p90_dwell_hours.toFixed(1)}</td>
                      <td>{d.risk_score.toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div>
            <h3 className="edge-table-title">SLA breaches (P90 &gt; 24h)</h3>
            {slaBreaches.length === 0 ? (
              <p className="edge-muted">No lanes breaching SLA.</p>
            ) : (
              <table className="edge-table">
                <thead>
                  <tr>
                    <th>Lane</th>
                    <th>Avg dwell (h)</th>
                    <th>P90 dwell (h)</th>
                    <th>Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {slaBreaches.map((d) => (
                    <tr key={d.lane}>
                      <td>{d.lane}</td>
                      <td>{d.avg_dwell_hours.toFixed(1)}</td>
                      <td>{d.p90_dwell_hours.toFixed(1)}</td>
                      <td>{d.risk_score.toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
