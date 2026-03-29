import React, { useMemo } from 'react';
import { getKpiLabel } from '../store';
import { buildQualityPanelData, buildRoleNotifications, shiftLabel } from '../notifications';

function nameById(list, id) {
  return list.find((x) => x.id === id)?.name || '—';
}

function NoticeCard({ item }) {
  const colors = {
    bad: 'var(--bad)',
    warn: 'var(--warn)',
    info: '#2563eb',
    quality: '#7c3aed',
  };
  return (
    <div className="card" style={{ margin: 0, borderLeft: `4px solid ${colors[item.severity] || 'var(--border)'}` }}>
      <div className="cardTitle" style={{ marginBottom: 6 }}>{item.title}</div>
      <div className="small">{item.message}</div>
    </div>
  );
}

export default function QualityPanel({ ctx }) {
  const { state, currentUser } = ctx;
  const { masters } = state;
  const notifications = useMemo(() => buildRoleNotifications(state, currentUser), [state, currentUser]);
  const data = useMemo(() => buildQualityPanelData(state), [state]);

  return (
    <>
      <div className="header admHeader">
        <div>
          <div className="entryEyebrow">ADM • Quality Governance</div>
          <div className="h1">Painel da Qualidade</div>
          <div className="sub">Fila exclusiva da Qualidade para validação, SLA e rastreabilidade de desvios.</div>
        </div>
      </div>

      {notifications.length ? (
        <div className="grid" style={{ marginBottom: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          {notifications.map((item, idx) => <NoticeCard key={`${item.title}-${idx}`} item={item} />)}
        </div>
      ) : null}

      <div className="grid" style={{ marginBottom: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <div className="card" style={{ margin: 0 }}><div className="small">Fila da Qualidade</div><div className="h1" style={{ fontSize: 28 }}>{data.qualityQueue.length}</div></div>
        <div className="card" style={{ margin: 0 }}><div className="small">SLA vencido</div><div className="h1" style={{ fontSize: 28, color: 'var(--bad)' }}>{data.overdueList.length}</div></div>
        <div className="card" style={{ margin: 0 }}><div className="small">Validações recentes</div><div className="h1" style={{ fontSize: 28, color: '#7c3aed' }}>{data.recentlyValidated.length}</div></div>
        <div className="card" style={{ margin: 0 }}><div className="small">Apontamentos reprovados</div><div className="h1" style={{ fontSize: 28, color: 'var(--warn)' }}>{data.rejectedEntries.length}</div></div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="cardTitle">Pendências para validação</div>
        <table className="table">
          <thead>
            <tr>
              <th className="th">Status</th>
              <th className="th">Data</th>
              <th className="th">Turno</th>
              <th className="th">KPI</th>
              <th className="th">Responsável</th>
              <th className="th">Prazo</th>
            </tr>
          </thead>
          <tbody>
            {data.qualityQueue.map((item) => (
              <tr key={item.id} className="tr">
                <td className="td">{item.status === 'CONTIDO' ? 'Aguardando validação' : 'Pronto para conclusão'}</td>
                <td className="td">{item.date}</td>
                <td className="td">{shiftLabel(item.shift)}</td>
                <td className="td"><b>{getKpiLabel(item.kpiKey)}</b></td>
                <td className="td">{nameById(masters.leaders, item.ownerId)}</td>
                <td className="td">{item.dueDate || '—'}</td>
              </tr>
            ))}
            {!data.qualityQueue.length && <tr><td className="td" colSpan={6} style={{ color: 'var(--muted)' }}>Nenhuma pendência na fila da Qualidade.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="grid" style={{ marginBottom: 12 }}>
        <div className="card">
          <div className="cardTitle">SLA vencido</div>
          <table className="table">
            <thead><tr><th className="th">KPI</th><th className="th">Data</th><th className="th">Turno</th><th className="th">Prazo</th></tr></thead>
            <tbody>
              {data.overdueList.slice(0, 8).map((item) => (
                <tr key={item.id} className="tr">
                  <td className="td"><b>{getKpiLabel(item.kpiKey)}</b></td>
                  <td className="td">{item.date}</td>
                  <td className="td">{shiftLabel(item.shift)}</td>
                  <td className="td">{item.dueDate || '—'}</td>
                </tr>
              ))}
              {!data.overdueList.length && <tr><td className="td" colSpan={4} style={{ color: 'var(--muted)' }}>Nenhum desvio com SLA vencido.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="cardTitle">Validações recentes</div>
          <table className="table">
            <thead><tr><th className="th">KPI</th><th className="th">Status</th><th className="th">Data</th><th className="th">Registro</th></tr></thead>
            <tbody>
              {data.recentlyValidated.map((item) => (
                <tr key={item.id} className="tr">
                  <td className="td"><b>{getKpiLabel(item.kpiKey)}</b></td>
                  <td className="td">{item.status}</td>
                  <td className="td">{item.date}</td>
                  <td className="td">{item.qualityValidatedAt ? new Date(item.qualityValidatedAt).toLocaleString('pt-BR') : new Date(item.closedAt).toLocaleString('pt-BR')}</td>
                </tr>
              ))}
              {!data.recentlyValidated.length && <tr><td className="td" colSpan={4} style={{ color: 'var(--muted)' }}>Sem validações recentes.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="cardTitle">Apontamentos reprovados aguardando correção</div>
        <table className="table">
          <thead><tr><th className="th">Data</th><th className="th">Turno</th><th className="th">Operador</th><th className="th">Motivo</th></tr></thead>
          <tbody>
            {data.rejectedEntries.map((item) => (
              <tr key={item.id} className="tr">
                <td className="td">{item.date}</td>
                <td className="td">{shiftLabel(item.shift)}</td>
                <td className="td">{nameById(masters.operators, item.operatorId)}</td>
                <td className="td">{item.approvalNotes || '—'}</td>
              </tr>
            ))}
            {!data.rejectedEntries.length && <tr><td className="td" colSpan={4} style={{ color: 'var(--muted)' }}>Nenhum apontamento reprovado no momento.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
