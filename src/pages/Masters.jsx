import React, { useMemo, useState } from "react";
import { appendAudit, createAuditEvent, getKpiLabel } from "../store";

function Section({ title, children }) {
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="cardTitle">{title}</div>
      {children}
    </div>
  );
}

export default function Masters({ ctx }) {
  const { state, setState, currentUser } = ctx;
  const { masters } = state;

  const [newOperator, setNewOperator] = useState("");
  const [newLeader, setNewLeader] = useState("");
  const [newProduct, setNewProduct] = useState("");

  const kpiKeys = useMemo(() => Object.keys(masters.kpiConfigs || {}), [masters.kpiConfigs]);

  function add(listKey, name) {
    const n = name.trim();
    if (!n) return;
    setState(prev => {
      const created = { id: crypto.randomUUID(), name: n, active: true };
      let next = {
        ...prev,
        masters: {
          ...prev.masters,
          [listKey]: [created, ...prev.masters[listKey]]
        }
      };
      next = appendAudit(next, createAuditEvent({
        entityType: 'MASTER',
        entityId: created.id,
        action: 'MASTER_CREATED',
        actorName: currentUser?.name || 'Administrador',
        details: `${listKey} • ${created.name}`
      }));
      return next;
    });
  }

  function toggle(listKey, id) {
    setState(prev => {
      const current = prev.masters[listKey].find(x => x.id === id);
      if (!current) return prev;
      let next = {
        ...prev,
        masters: {
          ...prev.masters,
          [listKey]: prev.masters[listKey].map(x => x.id === id ? { ...x, active: !x.active } : x)
        }
      };
      next = appendAudit(next, createAuditEvent({
        entityType: 'MASTER',
        entityId: id,
        action: 'MASTER_TOGGLED',
        actorName: currentUser?.name || 'Administrador',
        details: `${listKey} • ${current.name} • ${current.active ? 'desativado' : 'ativado'}`
      }));
      return next;
    });
  }

  function updateKpi(kpiKey, patch) {
    setState(prev => {
      let next = {
        ...prev,
        masters: {
          ...prev.masters,
          kpiConfigs: {
            ...prev.masters.kpiConfigs,
            [kpiKey]: { ...prev.masters.kpiConfigs[kpiKey], ...patch }
          }
        }
      };
      next = appendAudit(next, createAuditEvent({
        entityType: 'KPI_CONFIG',
        entityId: kpiKey,
        action: 'KPI_CONFIG_UPDATED',
        actorName: currentUser?.name || 'Administrador',
        details: `${getKpiLabel(kpiKey)} • campos alterados: ${Object.keys(patch).join(', ')}`
      }));
      return next;
    });
  }

  return (
    <>
      <div className="header">
        <div>
          <div className="h1">Cadastros & Configurações</div>
          <div className="sub">Operadores, líderes, produtos e metas/limites dos KPI’s de qualidade.</div>
        </div>
      </div>

      <Section title="Operadores">
        <div className="row">
          <div className="field">
            <label>Novo operador</label>
            <input value={newOperator} onChange={(e) => setNewOperator(e.target.value)} placeholder="Ex: João Silva" />
          </div>
        </div>
        <div className="btnRow">
          <button className="primary" onClick={() => { add("operators", newOperator); setNewOperator(""); }}>Adicionar</button>
        </div>

        <table className="table">
          <thead><tr><th className="th">Nome</th><th className="th">Ativo</th><th className="th"></th></tr></thead>
          <tbody>
            {masters.operators.map(o => (
              <tr key={o.id} className="tr">
                <td className="td">{o.name}</td>
                <td className="td">{o.active ? "Sim" : "Não"}</td>
                <td className="td" style={{ textAlign:"right" }}>
                  <button onClick={() => toggle("operators", o.id)}>{o.active ? "Desativar" : "Ativar"}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Líderes / Responsáveis">
        <div className="row">
          <div className="field">
            <label>Novo líder</label>
            <input value={newLeader} onChange={(e) => setNewLeader(e.target.value)} placeholder="Ex: Líder Turno A" />
          </div>
        </div>
        <div className="btnRow">
          <button className="primary" onClick={() => { add("leaders", newLeader); setNewLeader(""); }}>Adicionar</button>
        </div>

        <table className="table">
          <thead><tr><th className="th">Nome</th><th className="th">Ativo</th><th className="th"></th></tr></thead>
          <tbody>
            {masters.leaders.map(l => (
              <tr key={l.id} className="tr">
                <td className="td">{l.name}</td>
                <td className="td">{l.active ? "Sim" : "Não"}</td>
                <td className="td" style={{ textAlign:"right" }}>
                  <button onClick={() => toggle("leaders", l.id)}>{l.active ? "Desativar" : "Ativar"}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Produtos">
        <div className="row">
          <div className="field">
            <label>Novo produto</label>
            <input value={newProduct} onChange={(e) => setNewProduct(e.target.value)} placeholder="Ex: Farelo Hipro" />
          </div>
        </div>
        <div className="btnRow">
          <button className="primary" onClick={() => { add("products", newProduct); setNewProduct(""); }}>Adicionar</button>
        </div>

        <table className="table">
          <thead><tr><th className="th">Nome</th><th className="th">Ativo</th><th className="th"></th></tr></thead>
          <tbody>
            {masters.products.map(p => (
              <tr key={p.id} className="tr">
                <td className="td">{p.name}</td>
                <td className="td">{p.active ? "Sim" : "Não"}</td>
                <td className="td" style={{ textAlign:"right" }}>
                  <button onClick={() => toggle("products", p.id)}>{p.active ? "Desativar" : "Ativar"}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Configuração de KPI (metas e limites)">
        <div className="small" style={{ marginBottom: 10 }}>
          SINGLE/RATIO usam alvo e direção. CONTROL usa LSL/USL/Setpoint.
        </div>

        <table className="table">
          <thead>
            <tr>
              <th className="th">KPI</th>
              <th className="th">Tipo</th>
              <th className="th">Unidade</th>
              <th className="th">Direção</th>
              <th className="th">Alvo</th>
              <th className="th">LSL</th>
              <th className="th">Setpoint</th>
              <th className="th">USL</th>
            </tr>
          </thead>
          <tbody>
            {kpiKeys.map(k => {
              const cfg = masters.kpiConfigs[k];
              return (
                <tr key={k} className="tr">
                  <td className="td"><b>{getKpiLabel(k)}</b></td>
                  <td className="td">{cfg.type}</td>
                  <td className="td">
                    <input value={cfg.unit || ""} onChange={(e) => updateKpi(k, { unit: e.target.value })} />
                  </td>
                  <td className="td">
                    {cfg.type === "CONTROL" ? "—" : (
                      <select value={cfg.direction} onChange={(e) => updateKpi(k, { direction: e.target.value })}>
                        <option value="up">↑</option>
                        <option value="down">↓</option>
                      </select>
                    )}
                  </td>
                  <td className="td">
                    {cfg.type === "CONTROL" ? "—" : (
                      <input value={cfg.target ?? ""} onChange={(e) => updateKpi(k, { target: Number(e.target.value) })} />
                    )}
                  </td>
                  <td className="td">
                    {cfg.type !== "CONTROL" ? "—" : (
                      <input value={cfg.lsl ?? ""} onChange={(e) => updateKpi(k, { lsl: Number(e.target.value) })} />
                    )}
                  </td>
                  <td className="td">
                    {cfg.type !== "CONTROL" ? "—" : (
                      <input value={cfg.setpoint ?? ""} onChange={(e) => updateKpi(k, { setpoint: Number(e.target.value) })} />
                    )}
                  </td>
                  <td className="td">
                    {cfg.type !== "CONTROL" ? "—" : (
                      <input value={cfg.usl ?? ""} onChange={(e) => updateKpi(k, { usl: Number(e.target.value) })} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>
    </>
  );
}