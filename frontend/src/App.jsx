import React, { useState } from "react";
import Header from "./components/layout/Header.jsx";
import Sidebar from "./components/layout/Sidebar.jsx";

import EtaLab from "./modules/EtaLab.jsx";
import InventoryLab from "./modules/InventoryLab.jsx";
import NetworkLab from "./modules/NetworkLab.jsx";
import RoutingLab from "./modules/RoutingLab.jsx";
import EmissionsLab from "./modules/EmissionsLab.jsx";
import DataLab from "./modules/DataLab.jsx";
import ExecLab from "./modules/ExecLab.jsx";
import FleetMaintenanceLab from "./modules/FleetMaintenanceLab.jsx";

const TABS = [
  { id: "eta", label: "On-Time & ETA" },
  { id: "inventory", label: "Inventory Policy" },
  { id: "network", label: "Network & Flow" },
  { id: "routing", label: "Routing & Fleet" },
  { id: "fleet", label: "Fleet Maintenance" },
  { id: "emissions", label: "Emissions & API" },
  { id: "data", label: "Data & Dev APIs" },
  { id: "exec", label: "Exec Board" },
];

export default function App() {
  const [active, setActive] = useState("eta");

  const renderActive = () => {
    switch (active) {
      case "eta":
        return <EtaLab />;
      case "inventory":
        return <InventoryLab />;
      case "network":
        return <NetworkLab />;
      case "routing":
        return <RoutingLab />;
      case "fleet":
        return <FleetMaintenanceLab />;
      case "emissions":
        return <EmissionsLab />;
      case "data":
        return <DataLab />;
      case "exec":
        return <ExecLab />;
      default:
        return null;
    }
  };

  return (
    <div className="edge-root">
      <Header />
      <div className="edge-shell">
        <Sidebar tabs={TABS} active={active} onChange={setActive} />
        <main className="edge-main">{renderActive()}</main>
      </div>
    </div>
  );
}
