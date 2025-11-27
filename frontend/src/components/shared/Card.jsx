import React from "react";

export default function Card({ title, subtitle, children, right }) {
  return (
    <section className="edge-card">
      <div className="edge-card-header">
        <div>
          {title && <h2 className="edge-card-title">{title}</h2>}
          {subtitle && <p className="edge-card-subtitle">{subtitle}</p>}
        </div>
        {right && <div className="edge-card-right">{right}</div>}
      </div>
      <div className="edge-card-body">{children}</div>
    </section>
  );
}
