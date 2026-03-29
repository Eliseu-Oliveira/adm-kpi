import React, { useMemo, useState } from 'react';

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR');
}

function ActionBadge({ action }) {
  const tones = {
    ENTRY_CREATED: 'var(--ok)',
    DEVIATION_CREATED: 'var(--bad)',
    DEVIATION_UPDATED: 'var(--warn)',
    DEVIATION_CONCLUDED: 'var(--ok)',
    MASTER_CREATED: 'var(--ok)',
    MASTER_TOGGLED: 'var(--warn)',
    KPI_CONFIG_UPDATED: 'var(--warn)',
    USER_CREATED: 'var(--ok)',
    USER_UPDATED: 'var(--warn)',
    USER_ACTIVATED: 'var(--ok)',
    USER_DEACTIVATED: 'var(--bad)',
    LOGIN: 'var(--ok)',
    LOGOUT: 'var(--muted)',
  };

  return (
    <span className="badge">
      <span className="dot" style={{ background: tones[action] || 'var(--muted)' }} />
      {action}
    </span>
  );
}

export default function AuditTrail({ ctx }) {
  const audits = ctx.state.audits || [];
  const [entityFilter, setEntityFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [query, setQuery] = useState('');

  const actions = useMemo(() => Array.from(new Set(audits.map((item) => item.action).filter(Boolean))), [audits]);
  const entities = useMemo(() => Array.from(new Set(audits.map((item) => item.entityType).filter(Boolean))), [audits]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return audits.filter((item) => {
      if (entityFilter && item.entityType !== entityFilter) return false;
      if (actionFilter && item.action !== actionFilter) return false;
      if (!q) return true;
      return [item.actorName, item.details, item.entityId, item.action, item.entityType]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [audits, entityFilter, actionFilter, query]);

  return (
    <>
      <div className="header">
        <div>
          <div className="h1">Auditoria</div>
          <div className="sub">Histórico das ações do sistema para rastreabilidade operacional.</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="cardTitle">Filtros</div>
        <div className="row" style={{ alignItems: 'end' }}>
          <div className="field" style={{ minWidth: 220 }}>
            <label>Entidade</label>
            <select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)}>
              <option value="">Todas</option>
              {entities.map((entity) => <option key={entity} value={entity}>{entity}</option>)}
            </select>
          </div>
          <div className="field" style={{ minWidth: 260 }}>
            <label>Ação</label>
            <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
              <option value="">Todas</option>
              {actions.map((action) => <option key={action} value={action}>{action}</option>)}
            </select>
          </div>
          <div className="field" style={{ minWidth: 300 }}>
            <label>Busca</label>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ator, detalhe, entidade..." />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="cardTitle">Linha do tempo</div>
        <table className="table">
          <thead>
            <tr>
              <th className="th">Data/Hora</th>
              <th className="th">Entidade</th>
              <th className="th">Ação</th>
              <th className="th">Ator</th>
              <th className="th">Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr className="tr" key={item.id}>
                <td className="td">{formatDateTime(item.createdAt)}</td>
                <td className="td">{item.entityType || '—'}</td>
                <td className="td"><ActionBadge action={item.action} /></td>
                <td className="td">{item.actorName || 'Sistema local'}</td>
                <td className="td">{item.details || '—'}</td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td className="td" colSpan={5} style={{ color: 'var(--muted)' }}>Nenhum evento auditável encontrado.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
