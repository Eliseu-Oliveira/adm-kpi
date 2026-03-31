
import React from "react";

export default function ControlRoom() {
  return (
    <div className="control-room">
      <div className="control-header">
        Sistema de Gestão ADM • Sala de Controle
      </div>

      <div className="control-grid">
        <div className="control-card">
          <div>Proteína do Farelo</div>
          <div className="control-kpi kpi-ok">46.2%</div>
        </div>

        <div className="control-card">
          <div>Umidade do Farelo</div>
          <div className="control-kpi kpi-warn">12.4%</div>
        </div>

        <div className="control-card">
          <div>Óleo do Farelo</div>
          <div className="control-kpi kpi-ok">2.1%</div>
        </div>
      </div>

      <div className="control-card">
        <h3>Desvios Críticos</h3>
        <p>Proteína abaixo da faixa — Turno Noite</p>
        <p>Umidade acima da faixa — Turno Manhã</p>
      </div>
    </div>
  );
}
