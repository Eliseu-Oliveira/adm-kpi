import React, { useMemo, useState } from 'react';
import { formatNumber } from '../utils';
import { appendAudit, createAuditEvent, getKpiLabel } from '../store';
import { buildRoleNotifications } from '../notifications';

const STATUS_META = {
  ABERTO: { color: 'var(--bad)', label: 'Aberto' },
  EM_ANALISE: { color: 'var(--warn)', label: 'Em análise' },
  CONTIDO: { color: '#2563eb', label: 'Contido' },
  VALIDADO_QUALIDADE: { color: '#7c3aed', label: 'Validado pela Qualidade' },
  CONCLUIDO: { color: 'var(--ok)', label: 'Concluído' },
};

const LEGACY_STATUS_MAP = {
  ANDAMENTO: 'EM_ANALISE',
};

function normalizeStatus(status) {
  return LEGACY_STATUS_MAP[status] || status || 'ABERTO';
}

function StatusBadge({ status }) {
  const meta = STATUS_META[normalizeStatus(status)] || { color: 'var(--muted)', label: status || '—' };
  return (
    <span className="badge">
      <span className="dot" style={{ background: meta.color }} />
      {meta.label}
    </span>
  );
}

function SummaryCard({ title, value, tone = 'default', hint = '' }) {
  const colors = {
    default: 'var(--text)',
    bad: 'var(--bad)',
    warn: 'var(--warn)',
    ok: 'var(--ok)',
    muted: 'var(--muted)',
    info: '#2563eb',
    quality: '#7c3aed',
  };

  return (
    <div className="card" style={{ margin: 0 }}>
      <div className="small" style={{ marginBottom: 6 }}>{title}</div>
      <div className="h1" style={{ fontSize: 26, lineHeight: 1.1, color: colors[tone] || colors.default }}>
        {value}
      </div>
      {hint ? <div className="small" style={{ marginTop: 6 }}>{hint}</div> : null}
    </div>
  );
}

function shiftLabel(shift) {
  return { MANHA: 'Manhã', TARDE: 'Tarde', NOITE: 'Noite' }[shift] || shift || '—';
}

function nameById(list, id) {
  return list.find((x) => x.id === id)?.name || '—';
}

function appendTimelineItem(list, actorName, message) {
  return [
    { id: crypto.randomUUID(), at: new Date().toISOString(), actorName: actorName || 'Sistema local', message },
    ...(Array.isArray(list) ? list : []),
  ];
}


function downloadCsv(filename, rows) {
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  return typeof value === 'string' ? `"${String(value).replaceAll('"', '""')}"` : value;
}

function addAttachment(deviation, ctx, patchDeviation) {
  const name = window.prompt('Nome do anexo ou evidência:');
  if (!name) return;
  const url = window.prompt('URL do arquivo/evidência (opcional):', '') || '';
  patchDeviation(
    deviation.id,
    {
      attachments: [
        { id: crypto.randomUUID(), name: name.trim(), url: url.trim(), createdAt: new Date().toISOString() },
        ...(Array.isArray(deviation.attachments) ? deviation.attachments : []),
      ],
    },
    'DEVIATION_ATTACHMENT_ADDED',
    `Anexo adicionado ao desvio ${getKpiLabel(deviation.kpiKey)}.`,
    `Anexo registrado: ${name.trim()}`
  );
}

function canEditWorkflow(status, ctx) {
  const normalized = normalizeStatus(status);
  if (normalized === 'VALIDADO_QUALIDADE' || normalized === 'CONCLUIDO') {
    return ctx.can('VALIDATE_DEVIATIONS');
  }
  return ctx.can('MANAGE_DEVIATIONS');
}

export default function Deviations({ ctx }) {
  const { state, setState, currentUser } = ctx;
  const { masters } = state;

  const [statusFilter, setStatusFilter] = useState('ABERTO');
  const [kpiFilter, setKpiFilter] = useState('');
  const [shiftFilter, setShiftFilter] = useState('');
  const [search, setSearch] = useState('');

  const today = new Date().toISOString().slice(0, 10);
  const canManage = ctx.can('MANAGE_DEVIATIONS');
  const canValidate = ctx.can('VALIDATE_DEVIATIONS');

  const deviations = useMemo(
    () => state.deviations.map((item) => ({ ...item, status: normalizeStatus(item.status) })),
    [state.deviations]
  );

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return deviations.filter((d) => {
      if (statusFilter !== 'TODOS' && normalizeStatus(d.status) !== statusFilter) return false;
      if (kpiFilter && d.kpiKey !== kpiFilter) return false;
      if (shiftFilter && d.shift !== shiftFilter) return false;
      if (q) {
        const haystack = [
          d.date,
          shiftLabel(d.shift),
          getKpiLabel(d.kpiKey),
          d.action,
          d.rootCause,
          d.qualityValidationNotes,
          nameById(masters.leaders, d.ownerId),
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [deviations, statusFilter, kpiFilter, shiftFilter, search, masters.leaders]);

  const summary = useMemo(() => {
    const counts = {
      ABERTO: 0,
      EM_ANALISE: 0,
      CONTIDO: 0,
      VALIDADO_QUALIDADE: 0,
      CONCLUIDO: 0,
    };
    deviations.forEach((d) => {
      counts[normalizeStatus(d.status)] = (counts[normalizeStatus(d.status)] || 0) + 1;
    });
    const overdue = deviations.filter((d) => normalizeStatus(d.status) !== 'CONCLUIDO' && d.dueDate && d.dueDate < today).length;
    return { ...counts, overdue };
  }, [deviations, today]);

  const slaSummary = useMemo(() => {
    const parseDate = (value) => value ? new Date(`${value}T00:00:00`) : null;
    const diffDays = (from, to) => Math.max(0, Math.round((to - from) / 86400000));

    const measured = deviations.filter((d) => d.dueDate);
    const onTime = measured.filter((d) => {
      const due = parseDate(d.dueDate);
      const end = d.closedAt ? new Date(d.closedAt) : new Date();
      return due && end <= due;
    }).length;
    const open = deviations.filter((d) => normalizeStatus(d.status) !== 'CONCLUIDO');
    const overdueList = open
      .filter((d) => d.dueDate && d.dueDate < today)
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    const avgOpenAge = open
      .map((d) => {
        const start = parseDate(d.date);
        return start ? diffDays(start, new Date()) : null;
      })
      .filter((v) => Number.isFinite(v));
    const avgClosure = deviations
      .filter((d) => d.closedAt)
      .map((d) => {
        const start = parseDate(d.date);
        const end = d.closedAt ? new Date(d.closedAt) : null;
        return start && end ? diffDays(start, end) : null;
      })
      .filter((v) => Number.isFinite(v));

    return {
      measured: measured.length,
      onTime,
      onTimeRate: measured.length ? (onTime / measured.length) * 100 : 0,
      overdueList,
      overdue: overdueList.length,
      avgOpenAge: avgOpenAge.length ? avgOpenAge.reduce((a, b) => a + b, 0) / avgOpenAge.length : 0,
      avgClosureDays: avgClosure.length ? avgClosure.reduce((a, b) => a + b, 0) / avgClosure.length : 0,
    };
  }, [deviations, today]);

  const recurrenceAlertList = useMemo(() => {
    const counts = deviations.reduce((acc, dev) => {
      acc[dev.kpiKey] = (acc[dev.kpiKey] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts)
      .filter(([, count]) => count >= 2)
      .map(([kpiKey, count]) => ({ kpiKey, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [deviations]);

  const roleNotifications = useMemo(() => buildRoleNotifications(state, currentUser), [state, currentUser]);

  const stageSla = useMemo(() => {
    const parseDate = (value) => value ? new Date(`${value}T00:00:00`) : null;
    const now = new Date();
    return ['ABERTO', 'EM_ANALISE', 'CONTIDO', 'VALIDADO_QUALIDADE'].map((status) => {
      const items = deviations.filter((d) => normalizeStatus(d.status) === status);
      const avgAgeValues = items
        .map((d) => {
          const start = parseDate(d.date);
          return start ? Math.max(0, Math.round((now - start) / 86400000)) : null;
        })
        .filter((v) => Number.isFinite(v));
      const overdue = items.filter((d) => d.dueDate && d.dueDate < today).length;
      return {
        status,
        label: STATUS_META[status]?.label || status,
        count: items.length,
        overdue,
        avgAge: avgAgeValues.length ? avgAgeValues.reduce((a, b) => a + b, 0) / avgAgeValues.length : 0,
      };
    });
  }, [deviations, today]);

  function exportQualityQueue() {
    const rows = [];
    rows.push(['status', 'data', 'turno', 'kpi', 'responsavel', 'prazo'].join(','));
    deviations
      .filter((item) => ['CONTIDO', 'VALIDADO_QUALIDADE'].includes(normalizeStatus(item.status)))
      .forEach((item) => {
        rows.push([
          STATUS_META[normalizeStatus(item.status)]?.label || item.status,
          item.date,
          shiftLabel(item.shift),
          getKpiLabel(item.kpiKey),
          nameById(masters.leaders, item.ownerId),
          item.dueDate || '',
        ].map(csvCell).join(','));
      });

    if (rows.length === 1) {
      rows.push(['Sem pendências', '', '', '', '', ''].map(csvCell).join(','));
    }

    downloadCsv(`fila_qualidade_adm_${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  function exportSlaReport() {
    const rows = [];
    rows.push(['kpi','status','data','turno','responsavel','prazo','dias_em_aberto','sla'].join(','));
    slaSummary.overdueList.forEach((d) => {
      const start = new Date(`${d.date}T00:00:00`);
      const age = Math.max(0, Math.round((new Date() - start) / 86400000));
      rows.push([
        getKpiLabel(d.kpiKey),
        STATUS_META[normalizeStatus(d.status)]?.label || d.status,
        d.date,
        shiftLabel(d.shift),
        nameById(masters.leaders, d.ownerId),
        d.dueDate || '',
        age,
        'EM_ATRASO',
      ].map(csvCell).join(','));
    });
    if (!slaSummary.overdueList.length) {
      rows.push(['Sem desvios em atraso','','','','','','',''].map(csvCell).join(','));
    }
    downloadCsv(`sla_desvios_adm_${new Date().toISOString().slice(0,10)}.csv`, rows);
  }

  function patchDeviation(devId, patch, action, details, timelineMessage) {
    setState((prev) => {
      const current = prev.deviations.find((d) => d.id === devId);
      if (!current) return prev;

      const nextDeviation = {
        ...current,
        ...patch,
        status: normalizeStatus(patch.status || current.status),
        timeline: appendTimelineItem(current.timeline, currentUser?.name || 'Gestão de desvios', timelineMessage || details),
      };

      let next = {
        ...prev,
        deviations: prev.deviations.map((d) => (d.id === devId ? nextDeviation : d)),
      };

      next = appendAudit(next, createAuditEvent({
        entityType: 'DEVIATION',
        entityId: devId,
        action,
        actorName: currentUser?.name || 'Gestão de desvios',
        details,
      }));

      return next;
    });
  }

  function updateField(deviation, field, value, action = 'DEVIATION_UPDATED', details) {
    if (!canEditWorkflow(deviation.status, ctx)) return;
    patchDeviation(
      deviation.id,
      { [field]: value },
      action,
      details || `${getKpiLabel(deviation.kpiKey)} • ${field} atualizado.`,
      details || `${field} atualizado.`
    );
  }

  function changeStatus(deviation, nextStatus) {
    const currentStatus = normalizeStatus(deviation.status);
    const next = normalizeStatus(nextStatus);

    if (next === currentStatus) return;

    if (next === 'EM_ANALISE' && !canManage) return;
    if (next === 'CONTIDO' && !canManage) return;
    if ((next === 'VALIDADO_QUALIDADE' || next === 'CONCLUIDO') && !canValidate) {
      alert('A validação final do desvio exige perfil de Qualidade, Gestão Industrial ou Administrador.');
      return;
    }

    if ((next === 'EM_ANALISE' || next === 'CONTIDO' || next === 'VALIDADO_QUALIDADE' || next === 'CONCLUIDO') && !(deviation.ownerId || '').trim()) {
      alert(`Defina o responsável do desvio ${getKpiLabel(deviation.kpiKey)} antes de avançar o fluxo.`);
      return;
    }

    if ((next === 'CONTIDO' || next === 'VALIDADO_QUALIDADE' || next === 'CONCLUIDO') && !(deviation.action || '').trim()) {
      alert(`Registre a ação imediata/corretiva do desvio ${getKpiLabel(deviation.kpiKey)} antes de avançar o fluxo.`);
      return;
    }

    if ((next === 'VALIDADO_QUALIDADE' || next === 'CONCLUIDO') && !(deviation.rootCause || '').trim()) {
      alert(`Informe a causa raiz do desvio ${getKpiLabel(deviation.kpiKey)} antes da validação da Qualidade.`);
      return;
    }

    if (next === 'CONCLUIDO') {
      const note = window.prompt('Informe a validação final da Qualidade para concluir o desvio:') || '';
      if (!note.trim()) {
        alert('A conclusão exige registro da validação final da Qualidade.');
        return;
      }
      patchDeviation(
        deviation.id,
        {
          status: next,
          qualityValidationNotes: note.trim(),
          qualityValidatedAt: new Date().toISOString(),
          qualityValidatedBy: currentUser?.id || null,
          closedAt: new Date().toISOString(),
          closedBy: currentUser?.id || null,
        },
        'DEVIATION_CLOSED_WITH_QUALITY',
        `${getKpiLabel(deviation.kpiKey)} • desvio concluído com validação final da Qualidade.`,
        `Desvio concluído. Validação final registrada: ${note.trim()}`
      );
      return;
    }

    if (next === 'VALIDADO_QUALIDADE') {
      const note = window.prompt('Informe a validação da Qualidade:') || deviation.qualityValidationNotes || '';
      if (!note.trim()) {
        alert('A validação da Qualidade exige um parecer registrado.');
        return;
      }
      patchDeviation(
        deviation.id,
        {
          status: next,
          qualityValidationNotes: note.trim(),
          qualityValidatedAt: new Date().toISOString(),
          qualityValidatedBy: currentUser?.id || null,
        },
        'DEVIATION_QUALITY_VALIDATED',
        `${getKpiLabel(deviation.kpiKey)} • desvio validado pela Qualidade.`,
        `Desvio validado pela Qualidade. Parecer: ${note.trim()}`
      );
      return;
    }

    const statusLabel = STATUS_META[next]?.label || next;
    patchDeviation(
      deviation.id,
      { status: next },
      'DEVIATION_STATUS_CHANGED',
      `${getKpiLabel(deviation.kpiKey)} • status alterado para ${statusLabel}.`,
      `Status alterado para ${statusLabel}.`
    );
  }

  return (
    <>
      <div className="header">
        <div>
          <div className="h1">Desvios & Ações</div>
          <div className="sub">Workflow formal de tratamento com validação da Qualidade, SLA e rastreabilidade completa.</div>
        </div>
        {ctx.can('EXPORT_DATA') ? (
          <div className="btnRow" style={{ marginTop: 0 }}>
            <button className="primary" onClick={exportSlaReport}>Exportar SLA</button>
            {ctx.can('VALIDATE_DEVIATIONS') ? <button onClick={exportQualityQueue}>Fila da Qualidade</button> : null}
          </div>
        ) : null}
      </div>

      <div className="grid" style={{ marginBottom: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <SummaryCard title="Abertos" value={summary.ABERTO} tone="bad" />
        <SummaryCard title="Em análise" value={summary.EM_ANALISE} tone="warn" />
        <SummaryCard title="Contidos" value={summary.CONTIDO} tone="info" />
        <SummaryCard title="Validados pela Qualidade" value={summary.VALIDADO_QUALIDADE} tone="quality" />
        <SummaryCard title="Concluídos" value={summary.CONCLUIDO} tone="ok" />
        <SummaryCard title="Atrasados" value={summary.overdue} tone={summary.overdue > 0 ? 'bad' : 'ok'} />
      </div>

      <div className="grid" style={{ marginBottom: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <SummaryCard title="SLA dentro do prazo" value={`${formatNumber(slaSummary.onTimeRate)}%`} tone={slaSummary.onTimeRate >= 90 ? 'ok' : slaSummary.onTimeRate >= 75 ? 'warn' : 'bad'} hint={`${slaSummary.onTime} de ${slaSummary.measured} desvios com prazo`} />
        <SummaryCard title="Em atraso" value={slaSummary.overdue} tone={slaSummary.overdue > 0 ? 'bad' : 'ok'} hint="Desvios abertos com prazo vencido" />
        <SummaryCard title="Tempo médio em aberto" value={`${formatNumber(slaSummary.avgOpenAge)} d`} tone="default" hint="Desvios ainda não concluídos" />
        <SummaryCard title="Fechamento médio" value={`${formatNumber(slaSummary.avgClosureDays)} d`} tone="info" hint="Média entre abertura e conclusão" />
      </div>

      {roleNotifications.length ? (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="cardTitle">Central de notificações</div>
          <div className="small" style={{ marginBottom: 10 }}>Alertas automáticos priorizados para o perfil logado.</div>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            {roleNotifications.map((item, index) => (
              <div key={`${item.title}-${index}`} className="card" style={{ margin: 0, borderLeft: `4px solid ${item.severity === 'bad' ? 'var(--bad)' : item.severity === 'warn' ? 'var(--warn)' : item.severity === 'quality' ? '#7c3aed' : '#2563eb'}` }}>
                <div className="small" style={{ marginBottom: 6 }}>{item.title}</div>
                <div style={{ fontWeight: 700 }}>{item.message}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="cardTitle">SLA por etapa do workflow</div>
        <div className="small" style={{ marginBottom: 10 }}>Visão das filas abertas por estágio, tempo médio em aberto e quantidade em atraso.</div>
        <table className="table">
          <thead>
            <tr>
              <th className="th">Etapa</th>
              <th className="th">Quantidade</th>
              <th className="th">Em atraso</th>
              <th className="th">Idade média</th>
            </tr>
          </thead>
          <tbody>
            {stageSla.map((item) => (
              <tr key={item.status} className="tr">
                <td className="td"><b>{item.label}</b></td>
                <td className="td">{item.count}</td>
                <td className="td">{item.overdue}</td>
                <td className="td">{formatNumber(item.avgAge)} d</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {recurrenceAlertList.length ? (
        <div className="card" style={{ marginBottom: 12, border: '1px solid rgba(245,166,35,.35)', background: 'rgba(245,166,35,.08)' }}>
          <div className="cardTitle">Alerta automático de reincidência</div>
          <div className="small">Os desvios abaixo apareceram mais de uma vez na janela filtrada e merecem ação estruturada.</div>
          <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
            {recurrenceAlertList.map((item) => (
              <span key={item.kpiKey} className="pill" style={{ borderColor: 'var(--warn)' }}>
                <b>{getKpiLabel(item.kpiKey)}</b> • {item.count} ocorrências
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {ctx.can('VALIDATE_DEVIATIONS') ? (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="cardTitle">Painel de pendências da Qualidade</div>
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
              {deviations.filter((item) => ['CONTIDO', 'VALIDADO_QUALIDADE'].includes(normalizeStatus(item.status))).slice(0, 8).map((item) => (
                <tr key={item.id} className="tr">
                  <td className="td"><StatusBadge status={item.status} /></td>
                  <td className="td">{item.date}</td>
                  <td className="td">{shiftLabel(item.shift)}</td>
                  <td className="td"><b>{getKpiLabel(item.kpiKey)}</b></td>
                  <td className="td">{nameById(masters.leaders, item.ownerId)}</td>
                  <td className="td">{item.dueDate || '—'}</td>
                </tr>
              ))}
              {!deviations.some((item) => ['CONTIDO', 'VALIDADO_QUALIDADE'].includes(normalizeStatus(item.status))) && (
                <tr><td className="td" colSpan={6} style={{ color: 'var(--muted)' }}>Nenhuma pendência da Qualidade no momento.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="cardTitle">Filtros</div>
        <div className="row" style={{ alignItems: 'end' }}>
          <div className="field" style={{ minWidth: 220 }}>
            <label>Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="ABERTO">Abertos</option>
              <option value="EM_ANALISE">Em análise</option>
              <option value="CONTIDO">Contidos</option>
              <option value="VALIDADO_QUALIDADE">Validados pela Qualidade</option>
              <option value="CONCLUIDO">Concluídos</option>
              <option value="TODOS">Todos</option>
            </select>
          </div>

          <div className="field" style={{ minWidth: 300 }}>
            <label>KPI</label>
            <select value={kpiFilter} onChange={(e) => setKpiFilter(e.target.value)}>
              <option value="">Todos os KPIs</option>
              {Object.keys(masters.kpiConfigs).map((key) => (
                <option key={key} value={key}>{getKpiLabel(key)}</option>
              ))}
            </select>
          </div>

          <div className="field" style={{ minWidth: 220 }}>
            <label>Turno</label>
            <select value={shiftFilter} onChange={(e) => setShiftFilter(e.target.value)}>
              <option value="">Todos os turnos</option>
              <option value="MANHA">Manhã</option>
              <option value="TARDE">Tarde</option>
              <option value="NOITE">Noite</option>
            </select>
          </div>

          <div className="field" style={{ minWidth: 260 }}>
            <label>Busca</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="KPI, ação, causa, responsável..." />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="cardTitle">Regras do fluxo</div>
        <div className="small">
          <b>Fluxo:</b> Aberto → Em análise → Contido → Validado pela Qualidade → Concluído.
        </div>
        <div className="small" style={{ marginTop: 6 }}>
          Supervisor/Gestão/Admin podem avançar até <b>Contido</b>. A etapa <b>Validado pela Qualidade</b> e o fechamento final exigem perfil de <b>Qualidade</b>, <b>Gestão Industrial</b> ou <b>Administrador</b>.
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="cardTitle">Fila de SLA</div>
        <table className="table">
          <thead>
            <tr>
              <th className="th">KPI</th>
              <th className="th">Status</th>
              <th className="th">Turno</th>
              <th className="th">Responsável</th>
              <th className="th">Prazo</th>
            </tr>
          </thead>
          <tbody>
            {slaSummary.overdueList.slice(0, 8).map((d) => (
              <tr key={d.id} className="tr">
                <td className="td"><b>{getKpiLabel(d.kpiKey)}</b></td>
                <td className="td"><StatusBadge status={d.status} /></td>
                <td className="td">{shiftLabel(d.shift)}</td>
                <td className="td">{nameById(masters.leaders, d.ownerId)}</td>
                <td className="td" style={{ color: 'var(--bad)', fontWeight: 800 }}>{d.dueDate}</td>
              </tr>
            ))}
            {!slaSummary.overdueList.length && (
              <tr><td className="td" colSpan={5} style={{ color: 'var(--muted)' }}>Nenhum desvio em atraso no momento.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="cardTitle">Lista de desvios</div>
        <table className="table">
          <thead>
            <tr>
              <th className="th">Status</th>
              <th className="th">Data</th>
              <th className="th">Turno</th>
              <th className="th">KPI</th>
              <th className="th">Valor</th>
              <th className="th">Responsável</th>
              <th className="th">Prazo</th>
              <th className="th">Tratativa</th>
              <th className="th">Fluxo</th>
            </tr>
          </thead>
          <tbody>
            {list.map((d) => {
              const status = normalizeStatus(d.status);
              const cfg = masters.kpiConfigs[d.kpiKey];
              const unit = cfg?.unit || '';
              const isLate = status !== 'CONCLUIDO' && d.dueDate && d.dueDate < today;
              const ownerName = nameById(masters.leaders, d.ownerId);
              const editable = canEditWorkflow(status, ctx);

              return (
                <tr key={d.id} className="tr">
                  <td className="td"><StatusBadge status={status} /></td>
                  <td className="td">{d.date}</td>
                  <td className="td">{shiftLabel(d.shift)}</td>
                  <td className="td">
                    <b>{getKpiLabel(d.kpiKey)}</b>
                    <div className="small" style={{ marginTop: 6 }}>
                      Limite: {cfg?.type === 'CONTROL' ? `${formatNumber(cfg.lsl)}–${formatNumber(cfg.usl)} ${unit}` : `${formatNumber(cfg?.target)} ${unit}`}
                    </div>
                  </td>
                  <td className="td">{d.value === null ? '—' : `${formatNumber(Number(d.value))} ${unit}`}</td>
                  <td className="td">
                    <select
                      value={d.ownerId || ''}
                      disabled={!editable}
                      onChange={(e) => updateField(d, 'ownerId', e.target.value, 'DEVIATION_OWNER_CHANGED', `Responsável definido: ${nameById(masters.leaders, e.target.value)}`)}
                    >
                      <option value="">Selecione</option>
                      {masters.leaders.filter((x) => x.active).map((l) => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </select>
                    {d.ownerId ? <div className="small" style={{ marginTop: 6 }}>{ownerName}</div> : null}
                  </td>
                  <td className="td">
                    <input
                      type="date"
                      value={d.dueDate || ''}
                      disabled={!editable}
                      onChange={(e) => updateField(d, 'dueDate', e.target.value, 'DEVIATION_DUE_CHANGED', `Prazo atualizado para ${e.target.value || 'não definido'}.`)}
                    />
                    {isLate ? <div className="small" style={{ marginTop: 6, color: 'var(--bad)', fontWeight: 700 }}>Prazo vencido</div> : null}
                  </td>
                  <td className="td">
                    <textarea
                      rows={2}
                      value={d.action || ''}
                      disabled={!editable}
                      onChange={(e) => updateField(d, 'action', e.target.value, 'DEVIATION_ACTION_UPDATED', 'Ação imediata/corretiva atualizada.')}
                      placeholder="Ação imediata / corretiva"
                    />
                    <textarea
                      rows={2}
                      value={d.rootCause || ''}
                      disabled={!editable}
                      onChange={(e) => updateField(d, 'rootCause', e.target.value, 'DEVIATION_ROOTCAUSE_UPDATED', 'Causa raiz atualizada.')}
                      placeholder="Causa raiz"
                      style={{ marginTop: 8 }}
                    />
                    <textarea
                      rows={2}
                      value={d.qualityValidationNotes || ''}
                      disabled={!canValidate}
                      onChange={(e) => updateField(d, 'qualityValidationNotes', e.target.value, 'DEVIATION_QUALITY_NOTE_UPDATED', 'Parecer da Qualidade atualizado.')}
                      placeholder="Parecer da Qualidade"
                      style={{ marginTop: 8 }}
                    />
                  </td>
                  <td className="td">
                    <div className="btnRow" style={{ flexWrap: 'wrap' }}>
                      <button disabled={!canManage} onClick={() => changeStatus(d, 'ABERTO')}>Abrir</button>
                      <button disabled={!canManage} onClick={() => changeStatus(d, 'EM_ANALISE')}>Analisar</button>
                      <button disabled={!canManage} onClick={() => changeStatus(d, 'CONTIDO')}>Contido</button>
                      <button disabled={!canValidate} onClick={() => changeStatus(d, 'VALIDADO_QUALIDADE')}>Validar</button>
                      <button disabled={!canValidate} onClick={() => changeStatus(d, 'CONCLUIDO')}>Concluir</button>
                    </div>
                    {d.timeline?.length ? (
                      <div style={{ marginTop: 10 }}>
                        <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>Timeline</div>
                        <div className="timelineList">
                          {d.timeline.slice(0, 5).map((item) => (
                            <div key={item.id} className="timelineItem">
                              <b>{new Date(item.at).toLocaleString('pt-BR')}</b> • {item.actorName} • {item.message}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {!list.length && (
              <tr>
                <td className="td" colSpan={9} style={{ color: 'var(--muted)' }}>Nenhum desvio no filtro selecionado.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
