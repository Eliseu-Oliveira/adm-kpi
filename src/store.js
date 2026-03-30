import { isoToday } from './utils';

const LS_KEY = 'sho_kpi_app_v12';

export const KPI_DEFS = {
  OEE: { label: 'OEE' },
  PRODUTIVIDADE: { label: 'Produtividade' },
  UMIDADE_SOJA_ENTRADA_SECADOR_MEGA: { label: 'Umidade Soja Entrada Secador Mega' },
  UMIDADE_SOJA_ENTRADA_PREPARACAO_RDL_2504: { label: 'Umidade Soja Entrada Preparação (RDL-2504)' },
  UMIDADE_FARELO: { label: 'Umidade Farelo' },
  PROTEINA: { label: 'Proteína' },
  OLEO: { label: 'Óleo' },
  FIBRA: { label: 'Fibra' },
  CINZA: { label: 'Cinza' },
  OLEO_CASCA: { label: 'Óleo Casca' },
  LEX: { label: 'Lex' },
};

export function getKpiLabel(key) {
  return KPI_DEFS[key]?.label || key;
}

function defaultUsers(operatorId, leaderId) {
  return [
    { id: crypto.randomUUID(), name: 'Operador Demo', email: 'operador@sho.local', password: '123456', role: 'OPERADOR', plant: 'Preparação', active: true, operatorId, leaderId: '' },
    { id: crypto.randomUUID(), name: 'Supervisor Demo', email: 'supervisor@sho.local', password: '123456', role: 'SUPERVISOR', plant: 'Preparação', active: true, operatorId, leaderId },
    { id: crypto.randomUUID(), name: 'Qualidade Demo', email: 'qualidade@sho.local', password: '123456', role: 'QUALIDADE', plant: 'Preparação', active: true, operatorId: '', leaderId },
    { id: crypto.randomUUID(), name: 'Gestão Demo', email: 'gestao@sho.local', password: '123456', role: 'GESTAO', plant: 'Preparação', active: true, operatorId: '', leaderId },
    { id: crypto.randomUUID(), name: 'Administrador Demo', email: 'admin@sho.local', password: '123456', role: 'ADMIN', plant: 'Preparação', active: true, operatorId: '', leaderId },
  ];
}

export function seedState() {
  const operatorId = crypto.randomUUID();
  const leaderId = crypto.randomUUID();
  const productId = crypto.randomUUID();

  return {
    masters: {
      operators: [{ id: operatorId, name: 'Operador 01', active: true }],
      leaders: [{ id: leaderId, name: 'Líder 01', active: true }],
      products: [{ id: productId, name: 'Farelo Moído', active: true }],
      kpiConfigs: defaultKpiConfigs(),
    },
    entries: [],
    deviations: [],
    audits: [],
    users: defaultUsers(operatorId, leaderId),
  };
}

export function defaultKpiConfigs() {
  return {
    OEE: { type: 'SINGLE', unit: '%', direction: 'up', target: 85 },
    PRODUTIVIDADE: { type: 'SINGLE', unit: 't/h', direction: 'up', target: 80 },
    UMIDADE_SOJA_ENTRADA_SECADOR_MEGA: { type: 'CONTROL', unit: '%', lsl: 10, setpoint: 11, usl: 12 },
    UMIDADE_SOJA_ENTRADA_PREPARACAO_RDL_2504: { type: 'CONTROL', unit: '%', lsl: 9.5, setpoint: 10, usl: 10.5 },
    UMIDADE_FARELO: { type: 'CONTROL', unit: '%', lsl: 12, setpoint: 12.25, usl: 12.5 },
    PROTEINA: { type: 'CONTROL', unit: '%', lsl: 46, setpoint: 46.25, usl: 46.5 },
    OLEO: { type: 'SINGLE', unit: '%', direction: 'down', target: 2.5 },
    FIBRA: { type: 'SINGLE', unit: '%', direction: 'down', target: 6 },
    CINZA: { type: 'SINGLE', unit: '%', direction: 'down', target: 7 },
    OLEO_CASCA: { type: 'SINGLE', unit: '%', direction: 'down', target: 0.85 },
    LEX: { type: 'SINGLE', unit: '%', direction: 'down', target: 0.77 },
  };
}

export function loadState() {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return {
      ...parsed,
      masters: {
        operators: parsed.masters?.operators || [],
        leaders: parsed.masters?.leaders || [],
        products: parsed.masters?.products || [],
        kpiConfigs: {
          ...defaultKpiConfigs(),
          ...(parsed.masters?.kpiConfigs || {}),
        },
      },
      entries: (parsed.entries || []).map((entry) => ({
        ...entry,
        quality: entry.quality || {},
        approvalStatus: entry.approvalStatus || 'AGUARDANDO_APROVACAO',
        approvalNotes: entry.approvalNotes || '',
        timeline: Array.isArray(entry.timeline) ? entry.timeline : [],
        revisions: Array.isArray(entry.revisions) ? entry.revisions : [],
      })),
      deviations: (parsed.deviations || []).map((deviation) => ({
        ...deviation,
        status: deviation.status === 'ANDAMENTO' ? 'EM_ANALISE' : (deviation.status || 'ABERTO'),
        rootCause: deviation.rootCause || '',
        qualityValidationNotes: deviation.qualityValidationNotes || '',
        qualityValidatedAt: deviation.qualityValidatedAt || null,
        qualityValidatedBy: deviation.qualityValidatedBy || null,
        closedAt: deviation.closedAt || null,
        closedBy: deviation.closedBy || null,
        timeline: Array.isArray(deviation.timeline) ? deviation.timeline : [],
        notes: deviation.notes || '',
        attachments: Array.isArray(deviation.attachments) ? deviation.attachments.map((item) => ({
          ...item,
          kind: item.kind || ('dataUrl' in item ? 'UPLOAD' : 'LINK'),
          dataUrl: item.dataUrl || '',
          mimeType: item.mimeType || '',
          size: item.size || 0,
        })) : [],
      })),
      audits: parsed.audits || [],
      users: (parsed.users && parsed.users.length ? parsed.users : defaultUsers(parsed.masters?.operators?.[0]?.id || '', parsed.masters?.leaders?.[0]?.id || '')),
    };
  } catch {
    return null;
  }
}



export function createAuditEvent({ entityType, entityId, action, actorName, details = '', meta = {} }) {
  return {
    id: crypto.randomUUID(),
    entityType,
    entityId,
    action,
    actorName: actorName || 'Sistema local',
    details,
    meta,
    createdAt: new Date().toISOString(),
  };
}

export function appendAudit(state, event) {
  return {
    ...state,
    audits: [event, ...(state.audits || [])],
  };
}

export function saveState(state) {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

function csvCell(value) {
  return typeof value === 'string'
    ? `"${String(value).replaceAll('"', '""')}"`
    : value;
}

function nameById(list, id) {
  return list.find((item) => item.id === id)?.name || '—';
}

export function exportCSV(state) {
  const { entries, deviations, masters } = state;
  const rows = [];
  rows.push([
    'entry_id', 'data', 'turno', 'area', 'operador', 'lider', 'produto', 'status_aprovacao', 'nota_aprovacao',
    'producao_t', 'oee_pct', 'produtividade_t_h',
    'umidade_soja_entrada_secador_mega', 'umidade_soja_entrada_preparacao_rdl_2504',
    'umidade_farelo', 'proteina', 'oleo', 'fibra', 'cinza', 'oleo_casca', 'lex',
    'criado_em'
  ].join(','));

  for (const e of entries) {
    rows.push([
      e.id,
      e.date,
      e.shift,
      e.area,
      nameById(masters.operators, e.operatorId),
      nameById(masters.leaders, e.leaderId),
      nameById(masters.products, e.productId),
      e.approvalStatus ?? '',
      e.approvalNotes ?? '',
      e.productionTons ?? '',
      e.oeePct ?? '',
      e.productivityTPH ?? '',
      e.quality?.umidadeSojaEntradaSecadorMega ?? '',
      e.quality?.umidadeSojaEntradaPreparacao ?? '',
      e.quality?.umidadeFarelo ?? '',
      e.quality?.proteina ?? '',
      e.quality?.oleo ?? '',
      e.quality?.fibra ?? '',
      e.quality?.cinza ?? '',
      e.quality?.oleoCasca ?? '',
      e.quality?.lex ?? '',
      e.createdAt ?? '',
    ].map(csvCell).join(','));
  }

  rows.push('');
  rows.push(['DEVIATIONS'].join(','));
  rows.push([
    'dev_id', 'status', 'data', 'turno', 'kpi', 'kpi_label', 'valor', 'alvo_lsl', 'usl', 'acao', 'causa_raiz', 'parecer_qualidade', 'notas', 'anexos', 'responsavel', 'prazo', 'createdAt', 'quality_validated_at', 'closed_at', 'timeline_eventos'
  ].join(','));

  for (const d of deviations) {
    rows.push([
      d.id,
      d.status,
      d.date,
      d.shift,
      d.kpiKey,
      getKpiLabel(d.kpiKey),
      d.value ?? '',
      d.lsl ?? d.target ?? '',
      d.usl ?? '',
      d.action ?? '',
      d.rootCause ?? '',
      d.qualityValidationNotes ?? '',
      d.notes ?? '',
      (d.attachments || []).map((item) => `${item.name}${item.url ? ` (${item.url})` : ''}`).join(' | '),
      nameById(masters.leaders, d.ownerId),
      d.dueDate ?? '',
      d.createdAt ?? '',
      d.qualityValidatedAt ?? '',
      d.closedAt ?? '',
      (d.timeline || []).map((item) => `${item.at} - ${item.actorName}: ${item.message}`).join(' | '),
    ].map(csvCell).join(','));
  }

  rows.push('');
  rows.push(['AUDIT_LOG'].join(','));
  rows.push(['audit_id', 'entity_type', 'entity_id', 'action', 'ator', 'detalhes', 'created_at'].join(','));

  for (const audit of state.audits || []) {
    rows.push([
      audit.id,
      audit.entityType ?? '',
      audit.entityId ?? '',
      audit.action ?? '',
      audit.actorName ?? '',
      audit.details ?? '',
      audit.createdAt ?? '',
    ].map(csvCell).join(','));
  }

  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sho_kpis_${isoToday()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
