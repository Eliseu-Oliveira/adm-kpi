import React, { useMemo, useState } from 'react';
import { formatNumber, isoToday } from '../utils';
import { appendAudit, createAuditEvent, getKpiLabel } from '../store';
import { KPI_ORDER, buildAverageSeries } from '../chartHelpers';
import TrendChart from '../components/TrendChart';

const SHIFTS = [
  { key: 'MANHA', label: 'Manhã' },
  { key: 'TARDE', label: 'Tarde' },
  { key: 'NOITE', label: 'Noite' },
];

const QUALITY_SECTIONS = [
  {
    title: 'Soja',
    description: 'Condição de entrada e preparação do grão.',
    fields: [
      {
        key: 'umidadeSojaEntradaSecadorMega',
        label: 'Umidade Soja Entrada Secador Mega',
        placeholder: 'Ex: 11,20',
        kpiKey: 'UMIDADE_SOJA_ENTRADA_SECADOR_MEGA',
      },
      {
        key: 'umidadeSojaEntradaPreparacao',
        label: 'Umidade Soja Entrada Preparação (RDL-2504)',
        placeholder: 'Ex: 10,10',
        kpiKey: 'UMIDADE_SOJA_ENTRADA_PREPARACAO_RDL_2504',
      },
    ],
  },
  {
    title: 'Farelo',
    description: 'Indicadores laboratoriais do farelo final.',
    fields: [
      { key: 'umidadeFarelo', label: 'Umidade Farelo', placeholder: 'Ex: 12,20', kpiKey: 'UMIDADE_FARELO' },
      { key: 'proteina', label: 'Proteína do Farelo', placeholder: 'Ex: 46,30', kpiKey: 'PROTEINA' },
      { key: 'oleo', label: 'Óleo do Farelo', placeholder: 'Ex: 2,20', kpiKey: 'OLEO' },
      { key: 'fibra', label: 'Fibra do Farelo', placeholder: 'Ex: 5,80', kpiKey: 'FIBRA' },
      { key: 'cinza', label: 'Cinza no Farelo', placeholder: 'Ex: 6,40', kpiKey: 'CINZA' },
    ],
  },
  {
    title: 'Casca',
    description: 'Controle de residual de óleo na casca.',
    fields: [
      { key: 'oleoCasca', label: 'Óleo na Casca', placeholder: 'Ex: 0,80', kpiKey: 'OLEO_CASCA' },
    ],
  },
  {
    title: 'Lex',
    description: 'Controle do índice de lex.',
    fields: [
      { key: 'lex', label: 'Lex', placeholder: 'Ex: 0,70', kpiKey: 'LEX' },
    ],
  },
];

function badge(status) {
  const map = {
    OK: { label: 'Conforme', color: 'var(--ok)' },
    WARN: { label: 'Atenção', color: 'var(--warn)' },
    BAD: { label: 'Fora', color: 'var(--bad)' },
    NODATA: { label: 'Sem dado', color: 'var(--muted)' },
  };
  return map[status] || map.NODATA;
}

function StatusBadge({ status }) {
  const b = badge(status);
  return (
    <span className="badge">
      <span className="dot" style={{ background: b.color }} />
      {b.label}
    </span>
  );
}

function evalSingle(value, cfg) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'NODATA';
  const target = Number(cfg.target);
  if (!Number.isFinite(target)) return 'NODATA';
  const tol = Math.abs(target) * 0.05;

  if (cfg.direction === 'up') {
    if (value >= target) return 'OK';
    if (value >= target - tol) return 'WARN';
    return 'BAD';
  }

  if (value <= target) return 'OK';
  if (value <= target + tol) return 'WARN';
  return 'BAD';
}

function evalControl(value, cfg) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'NODATA';
  const lsl = Number(cfg.lsl);
  const usl = Number(cfg.usl);
  if (!Number.isFinite(lsl) || !Number.isFinite(usl)) return 'NODATA';
  if (value < lsl || value > usl) return 'BAD';

  const range = usl - lsl || 1;
  const margin = range * 0.1;
  if (value < lsl + margin || value > usl - margin) return 'WARN';
  return 'OK';
}

function computeKPIs(entry, cfgs) {
  const kpis = {
    OEE: { value: entry.oeePct ?? null },
    PRODUTIVIDADE: { value: entry.productivityTPH ?? null },
    UMIDADE_SOJA_ENTRADA_SECADOR_MEGA: { value: entry.quality?.umidadeSojaEntradaSecadorMega ?? null },
    UMIDADE_SOJA_ENTRADA_PREPARACAO_RDL_2504: { value: entry.quality?.umidadeSojaEntradaPreparacao ?? null },
    UMIDADE_FARELO: { value: entry.quality?.umidadeFarelo ?? null },
    PROTEINA: { value: entry.quality?.proteina ?? null },
    OLEO: { value: entry.quality?.oleo ?? null },
    FIBRA: { value: entry.quality?.fibra ?? null },
    CINZA: { value: entry.quality?.cinza ?? null },
    OLEO_CASCA: { value: entry.quality?.oleoCasca ?? null },
    LEX: { value: entry.quality?.lex ?? null },
  };

  const statuses = {};
  for (const [key, obj] of Object.entries(kpis)) {
    const cfg = cfgs[key];
    if (!cfg) {
      statuses[key] = 'NODATA';
      continue;
    }

    const v = obj.value;
    statuses[key] = cfg.type === 'CONTROL' ? evalControl(Number(v), cfg) : evalSingle(Number(v), cfg);
  }

  return { kpis, statuses };
}

function upsertDeviation(state, entry, kpiKey, value, cfg, action) {
  const exists = state.deviations.find(
    (d) => d.entryId === entry.id && d.kpiKey === kpiKey && d.status !== 'CONCLUIDO'
  );
  if (exists) return state;

  const dev = {
    id: crypto.randomUUID(),
    entryId: entry.id,
    date: entry.date,
    shift: entry.shift,
    area: entry.area,
    kpiKey,
    value,
    status: 'ABERTO',
    target: cfg.type !== 'CONTROL' ? cfg.target : null,
    lsl: cfg.type === 'CONTROL' ? cfg.lsl : null,
    usl: cfg.type === 'CONTROL' ? cfg.usl : null,
    action: action || '',
    ownerId: entry.leaderId || null,
    dueDate: '',
    createdAt: new Date().toISOString(),
    timeline: appendTimelineItem([], entry.operatorName || 'Sistema local', `Desvio aberto automaticamente para ${getKpiLabel(kpiKey)}.`),
  };

  return { ...state, deviations: [dev, ...state.deviations] };
}

function toNum(x) {
  if (x === '' || x === null || x === undefined) return null;
  const normalized = String(x).replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function fieldStatusClass(status) {
  if (status === 'BAD') return 'fieldCard is-bad';
  if (status === 'WARN') return 'fieldCard is-warn';
  if (status === 'OK') return 'fieldCard is-ok';
  return 'fieldCard';
}

function shiftLabel(shift) {
  return SHIFTS.find((item) => item.key === shift)?.label || shift;
}

function specText(cfg) {
  if (!cfg) return 'Sem especificação definida';
  if (cfg.type === 'CONTROL') return `Faixa ${formatNumber(cfg.lsl)} a ${formatNumber(cfg.usl)} ${cfg.unit || ''}`;
  return `${cfg.direction === 'down' ? 'Máximo' : 'Mínimo'} ${formatNumber(cfg.target)} ${cfg.unit || ''}`;
}

function kpiStatusText(status) {
  if (status === 'OK') return 'Em conformidade';
  if (status === 'WARN') return 'Próximo do limite';
  if (status === 'BAD') return 'Fora da especificação';
  return 'Aguardando valor';
}

function appendTimelineItem(list, actorName, message) {
  return [
    {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      actorName: actorName || 'Sistema local',
      message,
    },
    ...(Array.isArray(list) ? list : []),
  ];
}

function approvalBadge(status) {
  const map = {
    RASCUNHO: { label: 'Rascunho', color: 'var(--muted)' },
    AGUARDANDO_APROVACAO: { label: 'Aguardando aprovação', color: 'var(--warn)' },
    APROVADO: { label: 'Aprovado', color: 'var(--ok)' },
    REPROVADO: { label: 'Reprovado', color: 'var(--bad)' },
  };
  return map[status] || map.RASCUNHO;
}

function createDraft(operators, leaders, products) {
  return {
    id: crypto.randomUUID(),
    area: 'PREPARACAO',
    date: isoToday(),
    shift: 'MANHA',
    operatorId: operators[0]?.id || '',
    leaderId: leaders[0]?.id || '',
    productId: products[0]?.id || '',
    generalNotes: '',
    productionTons: '',
    oeePct: '',
    productivityTPH: '',
    umidadeSojaEntradaSecadorMega: '',
    umidadeSojaEntradaPreparacao: '',
    umidadeFarelo: '',
    proteina: '',
    oleo: '',
    fibra: '',
    cinza: '',
    oleoCasca: '',
    lex: '',
    actions: {},
  };
}

function draftFromEntry(entry) {
  return {
    id: entry.id,
    area: entry.area || 'PREPARACAO',
    date: entry.date || isoToday(),
    shift: entry.shift || 'MANHA',
    operatorId: entry.operatorId || '',
    leaderId: entry.leaderId || '',
    productId: entry.productId || '',
    generalNotes: entry.generalNotes || '',
    productionTons: entry.productionTons ?? '',
    oeePct: entry.oeePct ?? '',
    productivityTPH: entry.productivityTPH ?? '',
    umidadeSojaEntradaSecadorMega: entry.quality?.umidadeSojaEntradaSecadorMega ?? '',
    umidadeSojaEntradaPreparacao: entry.quality?.umidadeSojaEntradaPreparacao ?? '',
    umidadeFarelo: entry.quality?.umidadeFarelo ?? '',
    proteina: entry.quality?.proteina ?? '',
    oleo: entry.quality?.oleo ?? '',
    fibra: entry.quality?.fibra ?? '',
    cinza: entry.quality?.cinza ?? '',
    oleoCasca: entry.quality?.oleoCasca ?? '',
    lex: entry.quality?.lex ?? '',
    actions: { ...(entry.correctiveActions || {}) },
  };
}

function cloneEntrySnapshot(entry) {
  return {
    date: entry.date,
    shift: entry.shift,
    operatorId: entry.operatorId,
    leaderId: entry.leaderId,
    productId: entry.productId,
    generalNotes: entry.generalNotes || '',
    productionTons: entry.productionTons ?? null,
    oeePct: entry.oeePct ?? null,
    productivityTPH: entry.productivityTPH ?? null,
    quality: {
      ...(entry.quality || {}),
    },
    correctiveActions: {
      ...(entry.correctiveActions || {}),
    },
    approvalStatus: entry.approvalStatus || 'AGUARDANDO_APROVACAO',
    approvalNotes: entry.approvalNotes || '',
  };
}

function buildEntryFromDraft(draft) {
  return {
    id: draft.id,
    area: draft.area,
    date: draft.date,
    shift: draft.shift,
    operatorId: draft.operatorId,
    leaderId: draft.leaderId,
    productId: draft.productId,
    generalNotes: draft.generalNotes || '',
    productionTons: toNum(draft.productionTons),
    oeePct: toNum(draft.oeePct),
    productivityTPH: toNum(draft.productivityTPH),
    quality: {
      umidadeSojaEntradaSecadorMega: toNum(draft.umidadeSojaEntradaSecadorMega),
      umidadeSojaEntradaPreparacao: toNum(draft.umidadeSojaEntradaPreparacao),
      umidadeFarelo: toNum(draft.umidadeFarelo),
      proteina: toNum(draft.proteina),
      oleo: toNum(draft.oleo),
      fibra: toNum(draft.fibra),
      cinza: toNum(draft.cinza),
      oleoCasca: toNum(draft.oleoCasca),
      lex: toNum(draft.lex),
    },
    correctiveActions: { ...(draft.actions || {}) },
  };
}

function diffEntrySnapshots(before, after, masters) {
  const fields = [];
  const nameById = (list, id) => list.find((x) => x.id === id)?.name || '—';
  const pushIfChanged = (label, oldValue, newValue) => {
    const oldStr = oldValue === null || oldValue === undefined || oldValue === '' ? '—' : String(oldValue);
    const newStr = newValue === null || newValue === undefined || newValue === '' ? '—' : String(newValue);
    if (oldStr !== newStr) fields.push(`${label}: ${oldStr} → ${newStr}`);
  };

  pushIfChanged('Data', before.date, after.date);
  pushIfChanged('Turno', shiftLabel(before.shift), shiftLabel(after.shift));
  pushIfChanged('Operador', nameById(masters.operators, before.operatorId), nameById(masters.operators, after.operatorId));
  pushIfChanged('Líder', nameById(masters.leaders, before.leaderId), nameById(masters.leaders, after.leaderId));
  pushIfChanged('Produto', nameById(masters.products, before.productId), nameById(masters.products, after.productId));
  pushIfChanged('Observação geral', before.generalNotes, after.generalNotes);
  pushIfChanged('Produção', before.productionTons, after.productionTons);
  pushIfChanged('OEE', before.oeePct, after.oeePct);
  pushIfChanged('Produtividade', before.productivityTPH, after.productivityTPH);

  const qualityMap = {
    umidadeSojaEntradaSecadorMega: 'Umidade Soja Entrada Secador Mega',
    umidadeSojaEntradaPreparacao: 'Umidade Soja Entrada Preparação (RDL-2504)',
    umidadeFarelo: 'Umidade Farelo',
    proteina: 'Proteína',
    oleo: 'Óleo',
    fibra: 'Fibra',
    cinza: 'Cinza',
    oleoCasca: 'Óleo Casca',
    lex: 'Lex',
  };
  for (const [key, label] of Object.entries(qualityMap)) {
    pushIfChanged(label, before.quality?.[key], after.quality?.[key]);
  }
  for (const [kpiKey, label] of Object.entries({
    UMIDADE_SOJA_ENTRADA_SECADOR_MEGA: 'Ação Umidade Soja Entrada Secador Mega',
    UMIDADE_SOJA_ENTRADA_PREPARACAO_RDL_2504: 'Ação Umidade Soja Entrada Preparação (RDL-2504)',
    UMIDADE_FARELO: 'Ação Umidade Farelo',
    PROTEINA: 'Ação Proteína',
    OLEO: 'Ação Óleo',
    FIBRA: 'Ação Fibra',
    CINZA: 'Ação Cinza',
    OLEO_CASCA: 'Ação Óleo Casca',
    LEX: 'Ação Lex',
  })) {
    pushIfChanged(label, before.correctiveActions?.[kpiKey], after.correctiveActions?.[kpiKey]);
  }
  return fields;
}

function EntryHeader({ date, shift, operator, onSave, disabled }) {
  return (
    <div className="entryHeader card">
      <div>
        <div className="entryEyebrow">Coleta operacional</div>
        <div className="h1">Apontamentos Operacionais</div>
        <div className="sub">Registro de qualidade por turno com validação, rastreabilidade e ação corretiva obrigatória.</div>
      </div>
      <div className="entryHeaderAside">
        <div className="entryContextMeta">
          <span className="pill"><b>Data:</b>&nbsp;{date || '—'}</span>
          <span className="pill"><b>Turno:</b>&nbsp;{shiftLabel(shift)}</span>
          <span className="pill"><b>Operador:</b>&nbsp;{operator || '—'}</span>
        </div>
        <button className="primary" onClick={onSave} disabled={disabled}>Salvar apontamento</button>
      </div>
    </div>
  );
}

function SummaryPanel({ total, filled, ok, warn, bad, pendingActions }) {
  const progress = total ? Math.round((filled / total) * 100) : 0;
  const status = bad > 0 ? 'Crítico' : warn > 0 ? 'Atenção' : filled === total ? 'Conforme' : 'Em preenchimento';

  return (
    <div className="card stickyPanel">
      <div className="cardTitle">Resumo da coleta</div>

      <div className="progressBlock">
        <div className="progressMeta">
          <span>Preenchimento</span>
          <b>{progress}%</b>
        </div>
        <div className="progressTrack"><div className="progressFill" style={{ width: `${progress}%` }} /></div>
      </div>

      <div className="summaryGridCompact">
        <div className="summaryTile highlight">
          <span>Status geral</span>
          <strong>{status}</strong>
          <small>{filled}/{total} campos lançados</small>
        </div>
        <div className="summaryTile">
          <span>Conformes</span>
          <strong>{ok}</strong>
          <small>Dentro da especificação</small>
        </div>
        <div className="summaryTile">
          <span>Atenção</span>
          <strong>{warn}</strong>
          <small>Próximo do limite</small>
        </div>
        <div className="summaryTile danger">
          <span>Fora</span>
          <strong>{bad}</strong>
          <small>Exigem ação corretiva</small>
        </div>
      </div>

      <div className="hr" />

      <div className="summaryChecklist">
        <div className="summaryChecklistRow"><span>Ações pendentes</span><b>{pendingActions}</b></div>
        <div className="summaryChecklistRow"><span>Campos em branco</span><b>{Math.max(total - filled, 0)}</b></div>
      </div>
    </div>
  );
}

function EntryHistoryTable({ entries, masters, cfgs, canEdit, onEdit, onView }) {
  function nameById(list, id) {
    return list.find((x) => x.id === id)?.name || '—';
  }

  const rows = entries.map((entry) => {
    const { statuses } = computeKPIs(entry, cfgs);
    const badCount = Object.values(statuses).filter((status) => status === 'BAD').length;
    const warnCount = Object.values(statuses).filter((status) => status === 'WARN').length;
    return {
      ...entry,
      badCount,
      warnCount,
      status: badCount > 0 ? 'Crítico' : warnCount > 0 ? 'Atenção' : 'Conforme',
      operatorName: nameById(masters.operators, entry.operatorId),
    };
  });

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div className="cardTitle">Últimos apontamentos</div>
          <div className="small">Os apontamentos aprovados só podem ser ajustados por perfis autorizados, com motivo obrigatório e trilha antes/depois.</div>
        </div>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th className="th">Data</th>
            <th className="th">Turno</th>
            <th className="th">Operador</th>
            <th className="th">Fora</th>
            <th className="th">Status</th>
            <th className="th">Aprovação</th>
            <th className="th">Revisões</th>
            {canEdit ? <th className="th">Ação</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((entry) => (
            <tr className="tr" key={entry.id}>
              <td className="td">{entry.date}</td>
              <td className="td">{shiftLabel(entry.shift)}</td>
              <td className="td">{entry.operatorName}</td>
              <td className="td">{entry.badCount}</td>
              <td className="td">{entry.status}</td>
              <td className="td">{approvalBadge(entry.approvalStatus || 'AGUARDANDO_APROVACAO').label}</td>
              <td className="td">{entry.revisions?.length || 0}</td>
              <td className="td">
                <button type="button" onClick={() => onView(entry)}>Ver detalhes</button>
              </td>
              {canEdit ? (
                <td className="td">
                  <button className="primary" type="button" onClick={() => onEdit(entry)}>
                    Editar
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
          {!rows.length && (
            <tr><td className="td" colSpan={canEdit ? 9 : 8} style={{ color: 'var(--muted)' }}>Nenhum apontamento salvo ainda.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}


function EntryDetailModal({ entry, masters, cfgs, deviations, canEdit, onEdit, onClose }) {
  if (!entry) return null;

  function nameById(list, id) {
    return list.find((x) => x.id === id)?.name || '—';
  }

  const { kpis, statuses } = computeKPIs(entry, cfgs);
  const entryDeviations = deviations.filter((item) => item.entryId === entry.id);
  const approval = approvalBadge(entry.approvalStatus || 'AGUARDANDO_APROVACAO');

  const qualityCards = QUALITY_SECTIONS.flatMap((section) => section.fields.map((field) => ({
    section: section.title,
    key: field.kpiKey,
    label: field.label,
    value: entry.quality?.[field.key] ?? null,
    action: entry.correctiveActions?.[field.kpiKey] || '',
  })));

  const productionCards = [
    { label: 'Produção', value: entry.productionTons, unit: 't/turno', key: 'PRODUCAO' },
    { label: 'OEE', value: entry.oeePct, unit: '%', key: 'OEE' },
    { label: 'Produtividade', value: entry.productivityTPH, unit: 't/h', key: 'PRODUTIVIDADE' },
  ];

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard modalCardLg" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <div>
            <div className="cardTitle">Detalhe completo do apontamento</div>
            <div className="small">Rastreabilidade completa da coleta, aprovação, revisões e desvios relacionados.</div>
          </div>
          <div className="btnRow">
            {canEdit ? <button type="button" className="primary" onClick={() => onEdit(entry)}>Editar apontamento</button> : null}
            <button type="button" onClick={onClose}>Fechar</button>
          </div>
        </div>

        <div className="modalBody">
          <div className="detailHero">
            <div>
              <div className="detailHeroTitle">{entry.date} • {shiftLabel(entry.shift)}</div>
              <div className="detailHeroSub">
                Operador: <b>{nameById(masters.operators, entry.operatorId)}</b> • Líder: <b>{nameById(masters.leaders, entry.leaderId)}</b> • Produto: <b>{nameById(masters.products, entry.productId)}</b>
              </div>
            </div>
            <div className="detailHeroBadges">
              <span className="badge"><span className="dot" style={{ background: approval.color }} />{approval.label}</span>
              <span className="pill">Revisões: <b>{entry.revisions?.length || 0}</b></span>
              <span className="pill">Desvios vinculados: <b>{entryDeviations.length}</b></span>
            </div>
          </div>

          <div className="detailGrid">
            <div className="card">
              <div className="cardTitle">Contexto operacional</div>
              <div className="detailInfoGrid">
                <div className="detailInfoItem"><span>Área</span><strong>{entry.area || 'Preparação'}</strong></div>
                <div className="detailInfoItem"><span>Criado em</span><strong>{entry.createdAt ? new Date(entry.createdAt).toLocaleString('pt-BR') : '—'}</strong></div>
                <div className="detailInfoItem"><span>Última atualização</span><strong>{entry.updatedAt ? new Date(entry.updatedAt).toLocaleString('pt-BR') : '—'}</strong></div>
                <div className="detailInfoItem"><span>Nota de aprovação</span><strong>{entry.approvalNotes || 'Sem comentário'}</strong></div>
              </div>
              <div className="hr" />
              <div className="small">Observação geral</div>
              <div className="detailTextBlock">{entry.generalNotes || 'Nenhuma observação geral registrada.'}</div>
            </div>

            <div className="card">
              <div className="cardTitle">Indicadores de produção</div>
              <div className="detailMetricGrid">
                {productionCards.map((item) => (
                  <div className="detailMetricCard" key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value !== null && item.value !== undefined ? `${formatNumber(Number(item.value))} ${item.unit}` : '—'}</strong>
                    {item.key !== 'PRODUCAO' ? <StatusBadge status={statuses[item.key]} /> : <span className="small">Informativo</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="cardTitle">Indicadores laboratoriais e ações</div>
            <div className="detailMetricGrid">
              {qualityCards.map((item) => {
                const cfg = cfgs[item.key];
                return (
                  <div className={`detailMetricCard ${fieldStatusClass(statuses[item.key])}`} key={item.key}>
                    <span>{item.section} • {item.label}</span>
                    <strong>{item.value !== null && item.value !== undefined ? `${formatNumber(Number(item.value))} ${cfg?.unit || ''}`.trim() : '—'}</strong>
                    <div className="fieldMetaRow">
                      <StatusBadge status={statuses[item.key]} />
                      <span className="fieldSpecText">{specText(cfg)}</span>
                    </div>
                    <div className="detailActionText">
                      <b>Ação registrada:</b> {item.action || 'Nenhuma ação corretiva registrada para este KPI.'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="detailGrid">
            <div className="card">
              <div className="cardTitle">Timeline do apontamento</div>
              {entry.timeline?.length ? (
                <div className="timelineList">
                  {entry.timeline.map((item) => (
                    <div key={item.id} className="timelineItem">
                      <div className="timelineDate">{new Date(item.at).toLocaleString('pt-BR')}</div>
                      <div><b>{item.actorName}</b></div>
                      <div className="small">{item.message}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="small">Sem eventos registrados.</div>
              )}
            </div>

            <div className="card">
              <div className="cardTitle">Revisões antes/depois</div>
              {entry.revisions?.length ? (
                <div className="timelineList">
                  {entry.revisions.map((revision) => (
                    <div key={revision.id} className="timelineItem">
                      <div className="timelineDate">{new Date(revision.at).toLocaleString('pt-BR')}</div>
                      <div><b>{revision.actorName}</b> • Motivo: {revision.reason}</div>
                      <div className="small">{revision.changes?.length ? revision.changes.join(' • ') : 'Sem diferenças materiais registradas.'}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="small">Nenhuma revisão registrada para este apontamento.</div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="cardTitle">Desvios relacionados</div>
            <table className="table">
              <thead>
                <tr>
                  <th className="th">KPI</th>
                  <th className="th">Valor</th>
                  <th className="th">Status</th>
                  <th className="th">Responsável</th>
                  <th className="th">Prazo</th>
                </tr>
              </thead>
              <tbody>
                {entryDeviations.map((dev) => (
                  <tr key={dev.id} className="tr">
                    <td className="td"><b>{getKpiLabel(dev.kpiKey)}</b></td>
                    <td className="td">{formatNumber(Number(dev.value))}</td>
                    <td className="td">{dev.status}</td>
                    <td className="td">{nameById(masters.leaders, dev.ownerId)}</td>
                    <td className="td">{dev.dueDate || '—'}</td>
                  </tr>
                ))}
                {!entryDeviations.length ? (
                  <tr><td className="td" colSpan={5} style={{ color: 'var(--muted)' }}>Nenhum desvio vinculado a este apontamento.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Entries({ ctx }) {
  const { state, setState, currentUser } = ctx;
  const { masters } = state;

  const operators = masters.operators.filter((o) => o.active);
  const leaders = masters.leaders.filter((l) => l.active);
  const products = masters.products.filter((p) => p.active);

  const [draft, setDraft] = useState(() => {
    const base = createDraft(operators, leaders, products);
    if (currentUser?.operatorId) base.operatorId = currentUser.operatorId;
    if (currentUser?.leaderId) base.leaderId = currentUser.leaderId;
    return base;
  });
  const [selectedKpi, setSelectedKpi] = useState('PROTEINA');
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [selectedEntryId, setSelectedEntryId] = useState(null);

  const cfgs = masters.kpiConfigs;

  const computed = useMemo(() => {
    const entry = buildEntryFromDraft(draft);
    return computeKPIs(entry, cfgs);
  }, [draft, cfgs]);

  const qualityFieldCount = QUALITY_SECTIONS.reduce((acc, section) => acc + section.fields.length, 0);

  const entrySummary = useMemo(() => {
    const statuses = QUALITY_SECTIONS.flatMap((section) => section.fields.map((field) => computed.statuses?.[field.kpiKey] || 'NODATA'));
    const filled = QUALITY_SECTIONS.flatMap((section) => section.fields.map((field) => draft[field.key]))
      .filter((value) => value !== '' && value !== null && value !== undefined).length;
    const ok = statuses.filter((status) => status === 'OK').length;
    const warn = statuses.filter((status) => status === 'WARN').length;
    const bad = statuses.filter((status) => status === 'BAD').length;
    const pendingActions = QUALITY_SECTIONS.flatMap((section) => section.fields)
      .filter((field) => computed.statuses?.[field.kpiKey] === 'BAD' && !(draft.actions?.[field.kpiKey] || '').trim())
      .length;
    return { filled, ok, warn, bad, pendingActions };
  }, [computed.statuses, draft]);

  const outOfSpecKpis = useMemo(
    () => Object.entries(computed.statuses || {}).filter(([, status]) => status === 'BAD').map(([kpiKey]) => kpiKey),
    [computed.statuses]
  );

  function updateAction(kpiKey, value) {
    setDraft((current) => ({
      ...current,
      actions: {
        ...(current.actions || {}),
        [kpiKey]: value,
      },
    }));
  }

  function updateField(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function resetDraft() {
    const nextDraft = createDraft(operators, leaders, products);
    if (currentUser?.operatorId) nextDraft.operatorId = currentUser.operatorId;
    if (currentUser?.leaderId) nextDraft.leaderId = currentUser.leaderId;
    setDraft(nextDraft);
    setEditingEntryId(null);
  }

  function validateDraft() {
    if (!draft.date) return 'Informe a data.';
    if (!draft.shift) return 'Informe o turno.';
    if (!draft.operatorId) return 'Selecione o operador.';
    if (!draft.leaderId) return 'Selecione o líder.';
    if (!draft.productId) return 'Selecione o produto.';
    for (const kpiKey of outOfSpecKpis) {
      if (!(draft.actions?.[kpiKey] || '').trim()) {
        return `Descreva a ação tomada para o KPI fora do limite: ${getKpiLabel(kpiKey)}.`;
      }
    }
    return '';
  }

  function syncEntryDeviations(next, updatedEntry, statuses, kpis, actorName) {
    let working = next;
    const openByKpi = new Map(
      working.deviations
        .filter((d) => d.entryId === updatedEntry.id && d.status !== 'CONCLUIDO')
        .map((d) => [d.kpiKey, d])
    );

    for (const [kpiKey, st] of Object.entries(statuses)) {
      const cfg = cfgs[kpiKey];
      const value = kpis[kpiKey]?.value ?? null;
      if (!cfg) continue;

      if (st === 'BAD') {
        if (!openByKpi.has(kpiKey)) {
          const beforeCount = working.deviations.length;
          working = upsertDeviation(working, updatedEntry, kpiKey, value, cfg, updatedEntry.correctiveActions?.[kpiKey]);
          if (working.deviations.length > beforeCount) {
            const createdDeviation = working.deviations[0];
            working = appendAudit(working, createAuditEvent({
              entityType: 'DEVIATION',
              entityId: createdDeviation.id,
              action: 'DEVIATION_CREATED',
              actorName,
              details: `Desvio gerado para ${getKpiLabel(kpiKey)} com valor ${formatNumber(Number(value))}`,
            }));
          }
        }
      } else if (openByKpi.has(kpiKey)) {
        const existing = openByKpi.get(kpiKey);
        const resolvedDeviation = {
          ...existing,
          status: 'CONCLUIDO',
          action: updatedEntry.correctiveActions?.[kpiKey] || existing.action || '',
          timeline: appendTimelineItem(existing.timeline, actorName, 'Desvio concluído automaticamente após correção do apontamento.'),
        };
        working = {
          ...working,
          deviations: working.deviations.map((item) => (item.id === resolvedDeviation.id ? resolvedDeviation : item)),
        };
        working = appendAudit(working, createAuditEvent({
          entityType: 'DEVIATION',
          entityId: resolvedDeviation.id,
          action: 'DEVIATION_AUTO_RESOLVED',
          actorName,
          details: `${getKpiLabel(kpiKey)} voltou para a faixa após edição do apontamento.`,
        }));
      }
    }
    return working;
  }

  function saveEntry() {
    const validationError = validateDraft();
    if (validationError) return alert(validationError);

    const baseEntry = buildEntryFromDraft(draft);
    const actorName = currentUser?.name || nameById(operators, draft.operatorId);

    if (editingEntryId) {
      const reason = window.prompt('Informe o motivo da edição controlada deste apontamento:') || '';
      if (!reason.trim()) {
        alert('Informe o motivo da edição para manter a rastreabilidade.');
        return;
      }

      setState((prev) => {
        const originalEntry = prev.entries.find((item) => item.id === editingEntryId);
        if (!originalEntry) return prev;
        const beforeSnapshot = cloneEntrySnapshot(originalEntry);
        const updatedEntry = {
          ...originalEntry,
          ...baseEntry,
          createdAt: originalEntry.createdAt,
          createdBy: originalEntry.createdBy,
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser?.id || null,
          approvalStatus: 'AGUARDANDO_APROVACAO',
          approvalNotes: `Revisão pendente após edição controlada. Motivo: ${reason.trim()}`,
          approvedAt: null,
          approvedBy: null,
        };
        const afterSnapshot = cloneEntrySnapshot(updatedEntry);
        const changes = diffEntrySnapshots(beforeSnapshot, afterSnapshot, prev.masters);
        updatedEntry.revisions = [
          {
            id: crypto.randomUUID(),
            at: new Date().toISOString(),
            actorId: currentUser?.id || null,
            actorName,
            reason: reason.trim(),
            before: beforeSnapshot,
            after: afterSnapshot,
            changes,
          },
          ...(originalEntry.revisions || []),
        ];
        updatedEntry.timeline = appendTimelineItem(
          originalEntry.timeline,
          actorName,
          `Apontamento editado. Motivo: ${reason.trim()}${changes.length ? ` • Alterações: ${changes.join('; ')}` : ''}`
        );
        const { statuses, kpis } = computeKPIs(updatedEntry, cfgs);

        let next = {
          ...prev,
          entries: prev.entries.map((item) => (item.id === editingEntryId ? updatedEntry : item)),
        };
        next = appendAudit(next, createAuditEvent({
          entityType: 'ENTRY',
          entityId: updatedEntry.id,
          action: 'ENTRY_EDITED',
          actorName,
          details: `${updatedEntry.date} • ${shiftLabel(updatedEntry.shift)} • ${changes.length ? changes.join(' | ') : 'sem alteração material'}`,
          meta: { reason: reason.trim(), changes },
        }));
        next = syncEntryDeviations(next, updatedEntry, statuses, kpis, actorName);
        return next;
      });

      resetDraft();
      alert('Apontamento atualizado. A revisão foi registrada e o item voltou para aprovação.');
      return;
    }

    const entry = {
      ...baseEntry,
      createdAt: new Date().toISOString(),
      createdBy: draft.operatorId,
      updatedAt: null,
      updatedBy: null,
      approvalStatus: 'AGUARDANDO_APROVACAO',
      approvalNotes: '',
      approvedAt: null,
      approvedBy: null,
      revisions: [],
      timeline: appendTimelineItem([], actorName, 'Apontamento criado e enviado para aprovação.'),
    };

    const { statuses, kpis } = computeKPIs(entry, cfgs);

    setState((prev) => {
      let next = { ...prev, entries: [entry, ...prev.entries] };
      next = appendAudit(next, createAuditEvent({
        entityType: 'ENTRY',
        entityId: entry.id,
        action: 'ENTRY_CREATED',
        actorName,
        details: `Apontamento criado em ${entry.date} • ${shiftLabel(entry.shift)}`
      }));
      next = syncEntryDeviations(next, entry, statuses, kpis, actorName);
      return next;
    });

    resetDraft();
    alert('Apontamento salvo. Desvios foram gerados quando necessário.');
  }

  function startEditing(entry) {
    if (!ctx.can('EDIT_CONTROLLED_ENTRY')) return;
    setSelectedEntryId(null);
    setEditingEntryId(entry.id);
    setDraft(draftFromEntry(entry));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openEntryDetail(entry) {
    setSelectedEntryId(entry.id);
  }

  const entries = useMemo(() => state.entries.slice(0, 8), [state.entries]);
  const shiftSeries = useMemo(() => buildAverageSeries(state.entries, (entry) => shiftLabel(entry.shift), selectedKpi), [state.entries, selectedKpi]);

  function nameById(list, id) {
    return list.find((x) => x.id === id)?.name || '—';
  }

  const selectedUnit = masters.kpiConfigs[selectedKpi]?.unit || '';
  const canSave = !entrySummary.pendingActions && !!draft.date && !!draft.shift && !!draft.operatorId && !!draft.leaderId && !!draft.productId;
  const canEditEntries = ctx.can('EDIT_CONTROLLED_ENTRY');

  const pendingApprovals = useMemo(
    () => state.entries.filter((entry) => entry.approvalStatus === 'AGUARDANDO_APROVACAO').slice(0, 8),
    [state.entries]
  );
  const canApproveEntries = ctx.can('APPROVE_ENTRIES');
  const selectedEntry = useMemo(() => state.entries.find((item) => item.id === selectedEntryId) || null, [state.entries, selectedEntryId]);

  function updateEntryApproval(entryId, approvalStatus) {
    if (!canApproveEntries) return;
    const note = window.prompt(
      approvalStatus === 'APROVADO' ? 'Comentário da aprovação (opcional):' : 'Informe o motivo da reprovação:'
    ) || '';
    if (approvalStatus === 'REPROVADO' && !note.trim()) {
      alert('Informe o motivo da reprovação.');
      return;
    }

    setState((prev) => {
      const entry = prev.entries.find((item) => item.id === entryId);
      if (!entry) return prev;
      const actorName = currentUser?.name || 'Aprovador';
      const updatedEntry = {
        ...entry,
        approvalStatus,
        approvalNotes: note.trim(),
        approvedAt: new Date().toISOString(),
        approvedBy: currentUser?.id || null,
        timeline: appendTimelineItem(
          entry.timeline,
          actorName,
          approvalStatus === 'APROVADO' ? 'Apontamento aprovado.' : `Apontamento reprovado. ${note.trim()}`
        ),
      };
      let next = {
        ...prev,
        entries: prev.entries.map((item) => (item.id === entryId ? updatedEntry : item)),
      };
      next = appendAudit(next, createAuditEvent({
        entityType: 'ENTRY',
        entityId: entryId,
        action: approvalStatus === 'APROVADO' ? 'ENTRY_APPROVED' : 'ENTRY_REJECTED',
        actorName,
        details: `${approvalStatus} • ${entry.date} • ${shiftLabel(entry.shift)}`,
      }));
      return next;
    });
  }

  return (
    <>
      <EntryHeader
        date={draft.date}
        shift={draft.shift}
        operator={nameById(operators, draft.operatorId)}
        onSave={saveEntry}
        disabled={!canSave}
      />

      {editingEntryId ? (
        <div className="alertBox" style={{ marginBottom: 12 }}>
          Você está em <b>modo de edição controlada</b>. Ao salvar, o apontamento volta para aprovação e a alteração fica registrada com trilha antes/depois.
          <div className="btnRow" style={{ marginTop: 10 }}>
            <button type="button" onClick={resetDraft}>Cancelar edição</button>
          </div>
        </div>
      ) : null}

      <div className="entriesLayout">
        <div className="entriesMainColumn">
          <div className="card">
            <div className="cardTitle">Contexto da coleta</div>
            <div className="row">
              <div className="field" style={{ maxWidth: 200 }}>
                <label>Data</label>
                <input type="date" value={draft.date} onChange={(e) => updateField('date', e.target.value)} />
              </div>
              <div className="field" style={{ maxWidth: 200 }}>
                <label>Turno</label>
                <select value={draft.shift} onChange={(e) => updateField('shift', e.target.value)}>
                  {SHIFTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Produto</label>
                <select value={draft.productId} onChange={(e) => updateField('productId', e.target.value)}>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>

            <div className="row">
              <div className="field">
                <label>Operador</label>
                <select value={draft.operatorId} onChange={(e) => updateField('operatorId', e.target.value)}>
                  {operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Líder</label>
                <select value={draft.leaderId} onChange={(e) => updateField('leaderId', e.target.value)}>
                  {leaders.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Observação geral do apontamento</label>
                <textarea value={draft.generalNotes} onChange={(e) => updateField('generalNotes', e.target.value)} placeholder="Registre observações operacionais relevantes do turno." />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="sectionHeader">
              <div>
                <div className="sectionTitle">Produção</div>
                <div className="sectionSub">Indicadores operacionais do turno.</div>
              </div>
            </div>

            <div className="row">
              <div className="field">
                <label>Produção (t/turno)</label>
                <input value={draft.productionTons} onChange={(e) => updateField('productionTons', e.target.value)} placeholder="Ex: 650" inputMode="decimal" />
              </div>
              <div className="field">
                <label>OEE (%)</label>
                <input value={draft.oeePct} onChange={(e) => updateField('oeePct', e.target.value)} placeholder="Ex: 82,40" inputMode="decimal" />
              </div>
              <div className="field">
                <label>Produtividade (t/h)</label>
                <input value={draft.productivityTPH} onChange={(e) => updateField('productivityTPH', e.target.value)} placeholder="Ex: 78,20" inputMode="decimal" />
              </div>
            </div>
          </div>

          {QUALITY_SECTIONS.map((section) => (
            <div key={section.title} className="card">
              <div className="sectionHeader">
                <div>
                  <div className="sectionTitle">{section.title}</div>
                  <div className="sectionSub">{section.description}</div>
                </div>
                <span className="pill">{section.fields.length} indicador(es)</span>
              </div>

              <div className="qualityBlockGrid">
                {section.fields.map((field) => {
                  const status = computed.statuses?.[field.kpiKey] || 'NODATA';
                  const cfg = cfgs[field.kpiKey];
                  const value = draft[field.key];
                  return (
                    <div key={field.key} className={fieldStatusClass(status)}>
                      <div className="field">
                        <label>{field.label} {cfg?.unit ? `(${cfg.unit})` : ''}</label>
                        <input
                          value={value}
                          onChange={(e) => updateField(field.key, e.target.value)}
                          placeholder={field.placeholder}
                          inputMode="decimal"
                        />
                      </div>

                      <div className="fieldMetaRow">
                        <StatusBadge status={status} />
                        <span className="fieldSpecText">{specText(cfg)}</span>
                      </div>

                      <div className="fieldMetricRow">
                        <span className="fieldMetricLabel">Valor informado</span>
                        <strong>{value ? `${value} ${cfg?.unit || ''}` : '—'}</strong>
                      </div>

                      <div className="fieldMetricStatus">{kpiStatusText(status)}</div>

                      {status === 'BAD' && (
                        <div className="actionRequiredBox">
                          <div className="actionRequiredTitle">Ação corretiva obrigatória</div>
                          <div className="actionRequiredSub">Descreva a ação tomada pelo operador para corrigir ou conter o desvio.</div>
                          <textarea
                            value={draft.actions?.[field.kpiKey] || ''}
                            onChange={(e) => updateAction(field.kpiKey, e.target.value)}
                            placeholder={`Ação tomada para ${getKpiLabel(field.kpiKey)}.`}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {!!outOfSpecKpis.length && (
            <div className="alertBox alertBad">
              Existem {outOfSpecKpis.length} resultado(s) fora do limite. O salvamento só será permitido após preencher a ação obrigatória de cada desvio.
            </div>
          )}


          {canApproveEntries && (
            <div className="card">
              <div className="cardTitle">Apontamentos pendentes de aprovação</div>
              <table className="table">
                <thead>
                  <tr>
                    <th className="th">Data</th>
                    <th className="th">Turno</th>
                    <th className="th">Operador</th>
                    <th className="th">Status</th>
                    <th className="th">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingApprovals.map((entry) => (
                    <tr key={entry.id} className="tr">
                      <td className="td">{entry.date}</td>
                      <td className="td">{shiftLabel(entry.shift)}</td>
                      <td className="td">{nameById(masters.operators, entry.operatorId)}</td>
                      <td className="td">{approvalBadge(entry.approvalStatus).label}</td>
                      <td className="td">
                        <div className="btnRow">
                          <button type="button" onClick={() => openEntryDetail(entry)}>Ver detalhes</button>
                          <button className="primary" type="button" onClick={() => updateEntryApproval(entry.id, 'APROVADO')}>Aprovar</button>
                          <button className="danger" type="button" onClick={() => updateEntryApproval(entry.id, 'REPROVADO')}>Reprovar</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!pendingApprovals.length && (
                    <tr><td className="td" colSpan={5} style={{ color: 'var(--muted)' }}>Nenhum apontamento pendente de aprovação.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="card">
            <div className="cardTitle">Tendência por turno</div>
            <div className="row" style={{ marginBottom: 12 }}>
              <div className="field" style={{ maxWidth: 420 }}>
                <label>KPI do gráfico</label>
                <select value={selectedKpi} onChange={(e) => setSelectedKpi(e.target.value)}>
                  {KPI_ORDER.map((key) => (
                    <option key={key} value={key}>{getKpiLabel(key)}</option>
                  ))}
                </select>
              </div>
            </div>
            <TrendChart
              data={shiftSeries}
              unit={selectedUnit}
              spec={masters.kpiConfigs[selectedKpi]}
              emptyText="Cadastre apontamentos em mais de um turno para visualizar a média por turno."
            />
          </div>

          <EntryHistoryTable entries={entries} masters={masters} cfgs={cfgs} canEdit={canEditEntries} onEdit={startEditing} onView={openEntryDetail} />
        </div>

        <div className="entriesAsideColumn">
          <SummaryPanel
            total={qualityFieldCount}
            filled={entrySummary.filled}
            ok={entrySummary.ok}
            warn={entrySummary.warn}
            bad={entrySummary.bad}
            pendingActions={entrySummary.pendingActions}
          />
        </div>
      </div>

      <EntryDetailModal
        entry={selectedEntry}
        masters={masters}
        cfgs={cfgs}
        deviations={state.deviations}
        canEdit={canEditEntries}
        onEdit={startEditing}
        onClose={() => setSelectedEntryId(null)}
      />
    </>
  );
}
