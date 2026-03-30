import React, { useMemo, useState } from 'react';
import { formatNumber } from '../utils';
import { getKpiLabel } from '../store';
import { KPI_ORDER, buildAverageSeries } from '../chartHelpers';
import TrendChart from '../components/TrendChart';
import { buildRoleNotifications } from '../notifications';

function StatusBadge({ status }) {
  const map = {
    OK: { c: 'var(--ok)', t: 'OK' },
    WARN: { c: 'var(--warn)', t: 'Risco' },
    BAD: { c: 'var(--bad)', t: 'Fora' },
    NODATA: { c: 'var(--muted)', t: 'Sem dados' },
  };
  const b = map[status] || map.NODATA;

  return (
    <span className="badge">
      <span className="dot" style={{ background: b.c }} />
      {b.t}
    </span>
  );
}

function shiftLabel(shift) {
  return { MANHA: 'Manhã', TARDE: 'Tarde', NOITE: 'Noite' }[shift] || shift || '—';
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

function getEntryValue(entry, key) {
  switch (key) {
    case 'OEE':
      return entry.oeePct ?? null;
    case 'PRODUTIVIDADE':
      return entry.productivityTPH ?? null;
    case 'UMIDADE_SOJA_ENTRADA_SECADOR_MEGA':
      return entry.quality?.umidadeSojaEntradaSecadorMega ?? null;
    case 'UMIDADE_SOJA_ENTRADA_PREPARACAO_RDL_2504':
      return entry.quality?.umidadeSojaEntradaPreparacao ?? null;
    case 'UMIDADE_FARELO':
      return entry.quality?.umidadeFarelo ?? null;
    case 'PROTEINA':
      return entry.quality?.proteina ?? null;
    case 'OLEO':
      return entry.quality?.oleo ?? null;
    case 'FIBRA':
      return entry.quality?.fibra ?? null;
    case 'CINZA':
      return entry.quality?.cinza ?? null;
    case 'OLEO_CASCA':
      return entry.quality?.oleoCasca ?? null;
    case 'LEX':
      return entry.quality?.lex ?? null;
    default:
      return null;
  }
}

function evaluateKpi(value, cfg) {
  if (!cfg) return 'NODATA';
  const numeric = Number(value);
  return cfg.type === 'CONTROL' ? evalControl(numeric, cfg) : evalSingle(numeric, cfg);
}

function isEntryCritical(entry, cfgs) {
  return KPI_ORDER.some((key) => {
    const value = getEntryValue(entry, key);
    const status = evaluateKpi(value, cfgs[key]);
    return status === 'BAD';
  });
}

function nameById(list, id) {
  return list.find((x) => x.id === id)?.name || '—';
}

function StatCard({ title, value, hint, tone = 'default' }) {
  const colors = {
    default: 'var(--text)',
    ok: 'var(--ok)',
    warn: 'var(--warn)',
    bad: 'var(--bad)',
    muted: 'var(--muted)',
  };

  return (
    <div className="card statCard" style={{ margin: 0 }}>
      <div className="small" style={{ marginBottom: 6 }}>{title}</div>
      <div className="h1" style={{ fontSize: 28, lineHeight: 1.1, color: colors[tone] || colors.default }}>
        {value}
      </div>
      {hint ? <div className="small" style={{ marginTop: 6 }}>{hint}</div> : null}
    </div>
  );
}

function getPeriodConfig(period) {
  if (period === 'today') {
    return { label: 'Hoje', days: 1 };
  }
  const days = Number(period);
  return {
    label: `Últimos ${days} dias`,
    days: Number.isFinite(days) && days > 0 ? days : 30,
  };
}

function isDateWithinRange(dateString, start, end) {
  const value = new Date(`${dateString}T00:00:00`);
  return value >= start && value <= end;
}

function buildRangeSets(period) {
  const { days } = getPeriodConfig(period);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const currentEnd = new Date(today);
  const currentStart = new Date(today);
  currentStart.setDate(currentStart.getDate() - (days - 1));

  const previousEnd = new Date(currentStart);
  previousEnd.setDate(previousEnd.getDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setDate(previousStart.getDate() - (days - 1));

  return {
    current: { start: currentStart, end: currentEnd },
    previous: { start: previousStart, end: previousEnd },
  };
}

function formatDelta(value, suffix = '') {
  if (!Number.isFinite(value)) return `0${suffix}`;
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatNumber(value)}${suffix}`;
}


function downloadHtmlReport(filename, html) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildExecutiveReportHtml({ periodLabel, shift, selectedKpiLabel, selectedUnit, userName, generatedAt, summary, sla, topDeviations, recurrenceByKpi, operatorRanking }) {
  const rows = topDeviations.map((item) => `
    <tr><td>${item.label}</td><td>${item.count}</td></tr>`).join('');
  const recurrenceRows = recurrenceByKpi.map((item) => `
    <tr><td>${item.label}</td><td>${item.currentCount}</td><td>${item.previousCount}</td><td>${item.repeated ? 'Sim' : 'Não'}</td></tr>`).join('');
  const operatorRows = operatorRanking.map((item) => `
    <tr><td>${item.operatorName}</td><td>${item.critical}</td><td>${formatNumber(item.rate)}%</td></tr>`).join('');
  return `<!doctype html>
  <html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Relatório Executivo ADM</title>
    <style>
      body{font-family:Arial,sans-serif;padding:32px;color:#1f2937;background:#f8fafc;}
      h1{color:#003A8F;margin:0 0 8px;}
      h2{color:#003A8F;margin:24px 0 10px;font-size:18px;}
      .meta,.cards{display:flex;gap:12px;flex-wrap:wrap;}
      .card{background:#fff;border:1px solid #d9e1ea;border-radius:14px;padding:14px;min-width:220px;}
      .label{font-size:12px;color:#5f6b7a;text-transform:uppercase;letter-spacing:.4px;}
      .value{font-size:26px;font-weight:700;margin-top:6px;}
      table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #d9e1ea;border-radius:12px;overflow:hidden;}
      th,td{padding:10px;border-bottom:1px solid #e5e7eb;text-align:left;font-size:13px;}
      th{background:#eef4fb;color:#003A8F;}
      .muted{color:#5f6b7a;font-size:12px;}
    </style>
  </head>
  <body>
    <h1>Sistema de Gestão ADM</h1>
    <div class="muted">Relatório executivo gerado em ${generatedAt}</div>
    <div class="meta" style="margin-top:12px;">
      <div class="card"><div class="label">Período</div><div class="value" style="font-size:18px;">${periodLabel}</div></div>
      <div class="card"><div class="label">Turno</div><div class="value" style="font-size:18px;">${shift || 'Todos os turnos'}</div></div>
      <div class="card"><div class="label">KPI em foco</div><div class="value" style="font-size:18px;">${selectedKpiLabel}${selectedUnit ? ` (${selectedUnit})` : ''}</div></div>
      <div class="card"><div class="label">Usuário</div><div class="value" style="font-size:18px;">${userName}</div></div>
    </div>
    <h2>Resumo executivo</h2>
    <div class="cards">
      <div class="card"><div class="label">Conformidade</div><div class="value">${formatNumber(summary.conformityPct)}%</div></div>
      <div class="card"><div class="label">Desvios</div><div class="value">${summary.totalDeviations}</div></div>
      <div class="card"><div class="label">Apontamentos</div><div class="value">${summary.totalEntries}</div></div>
      <div class="card"><div class="label">Média KPI</div><div class="value">${summary.avgCurrentSelectedKpi == null ? '—' : formatNumber(summary.avgCurrentSelectedKpi)}${selectedUnit ? ` ${selectedUnit}` : ''}</div></div>
    </div>
    <h2>SLA de desvios</h2>
    <div class="cards">
      <div class="card"><div class="label">Dentro do SLA</div><div class="value">${formatNumber(sla.onTimeRate)}%</div></div>
      <div class="card"><div class="label">Em atraso</div><div class="value">${sla.overdue}</div></div>
      <div class="card"><div class="label">Tempo médio em aberto</div><div class="value">${formatNumber(sla.avgOpenAge)} d</div></div>
      <div class="card"><div class="label">Fechamento médio</div><div class="value">${formatNumber(sla.avgClosureDays)} d</div></div>
    </div>
    <h2>Top desvios por KPI</h2>
    <table><thead><tr><th>KPI</th><th>Ocorrências</th></tr></thead><tbody>${rows || '<tr><td colspan="2">Sem dados</td></tr>'}</tbody></table>
    <h2>Reincidência entre períodos</h2>
    <table><thead><tr><th>KPI</th><th>Atual</th><th>Anterior</th><th>Reincidente</th></tr></thead><tbody>${recurrenceRows || '<tr><td colspan="4">Sem dados</td></tr>'}</tbody></table>
    <h2>Operadores com maior criticidade</h2>
    <table><thead><tr><th>Operador</th><th>Apontamentos críticos</th><th>Taxa crítica</th></tr></thead><tbody>${operatorRows || '<tr><td colspan="3">Sem dados</td></tr>'}</tbody></table>
  </body></html>`;
}



function buildMonthlyConsolidatedHtml({ monthLabel, userName, generatedAt, entries, deviations, masters }) {
  const totalEntries = entries.length;
  const approvedEntries = entries.filter((item) => item.approvalStatus === 'APROVADO').length;
  const pendingEntries = entries.filter((item) => item.approvalStatus === 'AGUARDANDO_APROVACAO').length;
  const openDeviations = deviations.filter((item) => item.status !== 'CONCLUIDO').length;
  const qualityPending = deviations.filter((item) => item.status === 'CONTIDO').length;
  const byKpi = deviations.reduce((acc, dev) => {
    acc[dev.kpiKey] = (acc[dev.kpiKey] || 0) + 1;
    return acc;
  }, {});
  const topKpis = Object.entries(byKpi).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const operatorRows = entries.reduce((acc, entry) => {
    const name = nameById(masters.operators, entry.operatorId);
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {});
  const opHtml = Object.entries(operatorRows).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([name, count]) => `<tr><td>${name}</td><td>${count}</td></tr>`).join('');
  const kpiHtml = topKpis.map(([key, count]) => `<tr><td>${getKpiLabel(key)}</td><td>${count}</td></tr>`).join('');
  return `<!doctype html>
  <html lang="pt-BR"><head><meta charset="utf-8" />
  <title>Relatório Mensal Consolidado ADM</title>
  <style>
  body{font-family:Arial,sans-serif;padding:32px;color:#1f2937;background:#f8fafc;}
  h1{color:#003A8F;margin:0 0 8px;} h2{color:#003A8F;margin:24px 0 10px;font-size:18px;}
  .cards{display:flex;gap:12px;flex-wrap:wrap;} .card{background:#fff;border:1px solid #d9e1ea;border-radius:14px;padding:14px;min-width:220px;}
  .label{font-size:12px;color:#5f6b7a;text-transform:uppercase;letter-spacing:.4px;} .value{font-size:26px;font-weight:700;margin-top:6px;}
  table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #d9e1ea;border-radius:12px;overflow:hidden;}
  th,td{padding:10px;border-bottom:1px solid #e5e7eb;text-align:left;font-size:13px;} th{background:#eef4fb;color:#003A8F;}
  .muted{color:#5f6b7a;font-size:12px;}
  </style></head><body>
  <h1>Sistema de Gestão ADM</h1>
  <div class="muted">Relatório mensal consolidado • ${monthLabel} • gerado em ${generatedAt} por ${userName}</div>
  <h2>Resumo mensal</h2>
  <div class="cards">
    <div class="card"><div class="label">Apontamentos</div><div class="value">${totalEntries}</div></div>
    <div class="card"><div class="label">Aprovados</div><div class="value">${approvedEntries}</div></div>
    <div class="card"><div class="label">Pendentes de aprovação</div><div class="value">${pendingEntries}</div></div>
    <div class="card"><div class="label">Desvios abertos</div><div class="value">${openDeviations}</div></div>
    <div class="card"><div class="label">Pendências da Qualidade</div><div class="value">${qualityPending}</div></div>
  </div>
  <h2>KPIs com mais desvios no mês</h2>
  <table><thead><tr><th>KPI</th><th>Ocorrências</th></tr></thead><tbody>${kpiHtml || '<tr><td colspan="2">Sem dados</td></tr>'}</tbody></table>
  <h2>Operadores com mais lançamentos</h2>
  <table><thead><tr><th>Operador</th><th>Lançamentos</th></tr></thead><tbody>${opHtml || '<tr><td colspan="2">Sem dados</td></tr>'}</tbody></table>
  </body></html>`;
}

export default function Dashboard({ ctx }) {
  const { state, currentUser } = ctx;
  const { masters } = state;

  const [selectedKpi, setSelectedKpi] = useState('PROTEINA');
  const [period, setPeriod] = useState('30');
  const [selectedShift, setSelectedShift] = useState('');

  const ranges = useMemo(() => buildRangeSets(period), [period]);

  const filteredEntries = useMemo(() => {
    const entries = [...state.entries].sort((a, b) => (b.date + b.shift).localeCompare(a.date + a.shift));
    const now = new Date();

    return entries.filter((entry) => {
      if (selectedShift && entry.shift !== selectedShift) return false;

      if (period === 'today') {
        const today = now.toISOString().slice(0, 10);
        return entry.date === today;
      }

      return isDateWithinRange(entry.date, ranges.current.start, ranges.current.end);
    });
  }, [state.entries, period, selectedShift, ranges]);

  const filteredDeviations = useMemo(() => {
    return state.deviations.filter((d) => {
      if (selectedShift && d.shift !== selectedShift) return false;

      if (period === 'today') {
        const today = new Date().toISOString().slice(0, 10);
        return d.date === today;
      }

      return isDateWithinRange(d.date, ranges.current.start, ranges.current.end);
    });
  }, [state.deviations, period, selectedShift, ranges]);

  const previousEntries = useMemo(() => {
    return [...state.entries]
      .filter((entry) => {
        if (selectedShift && entry.shift !== selectedShift) return false;
        return isDateWithinRange(entry.date, ranges.previous.start, ranges.previous.end);
      })
      .sort((a, b) => (b.date + b.shift).localeCompare(a.date + a.shift));
  }, [state.entries, selectedShift, ranges]);

  const previousDeviations = useMemo(() => {
    return state.deviations.filter((d) => {
      if (selectedShift && d.shift !== selectedShift) return false;
      return isDateWithinRange(d.date, ranges.previous.start, ranges.previous.end);
    });
  }, [state.deviations, selectedShift, ranges]);

  const monthlyEntries = useMemo(() => {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return state.entries.filter((entry) => (!selectedShift || entry.shift === selectedShift) && entry.date?.slice(0, 7) === monthKey);
  }, [state.entries, selectedShift]);

  const monthlyDeviations = useMemo(() => {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return state.deviations.filter((dev) => (!selectedShift || dev.shift === selectedShift) && dev.date?.slice(0, 7) === monthKey);
  }, [state.deviations, selectedShift]);

  const lastByShift = useMemo(() => filteredEntries.slice(0, 6), [filteredEntries]);

  const openDevs = useMemo(() => {
    return filteredDeviations.filter((d) => d.status !== 'CONCLUIDO').slice(0, 8);
  }, [filteredDeviations]);

  const latestEntry = filteredEntries[0] || null;

  const kpiSummary = useMemo(() => {
    if (!latestEntry) return null;

    const cfgs = masters.kpiConfigs;
    const values = {};
    const statuses = {};

    KPI_ORDER.forEach((key) => {
      values[key] = getEntryValue(latestEntry, key);
      statuses[key] = evaluateKpi(values[key], cfgs[key]);
    });

    return { last: latestEntry, values, statuses };
  }, [latestEntry, masters.kpiConfigs]);

  const dailySeries = useMemo(() => {
    return buildAverageSeries(filteredEntries, (entry) => entry.date, selectedKpi);
  }, [filteredEntries, selectedKpi]);

  const monthlySeries = useMemo(() => {
    return buildAverageSeries(filteredEntries, (entry) => entry.date?.slice(0, 7), selectedKpi);
  }, [filteredEntries, selectedKpi]);

  const selectedUnit = masters.kpiConfigs[selectedKpi]?.unit || '';

  const executiveSummary = useMemo(() => {
    const cfgs = masters.kpiConfigs;
    const totalEntries = filteredEntries.length;
    const totalDeviations = filteredDeviations.length;
    const criticalEntries = filteredEntries.filter((entry) => isEntryCritical(entry, cfgs)).length;
    const conformityPct = totalEntries > 0 ? ((totalEntries - criticalEntries) / totalEntries) * 100 : 0;

    const lastValue = latestEntry ? getEntryValue(latestEntry, selectedKpi) : null;

    return {
      totalEntries,
      totalDeviations,
      criticalEntries,
      conformityPct,
      lastValue,
    };
  }, [filteredEntries, filteredDeviations, latestEntry, masters.kpiConfigs, selectedKpi]);

  const previousSummary = useMemo(() => {
    const cfgs = masters.kpiConfigs;
    const totalEntries = previousEntries.length;
    const totalDeviations = previousDeviations.length;
    const criticalEntries = previousEntries.filter((entry) => isEntryCritical(entry, cfgs)).length;
    const conformityPct = totalEntries > 0 ? ((totalEntries - criticalEntries) / totalEntries) * 100 : 0;
    const avgSelected = previousEntries.reduce((acc, entry) => {
      const value = Number(getEntryValue(entry, selectedKpi));
      if (!Number.isFinite(value)) return acc;
      acc.sum += value;
      acc.count += 1;
      return acc;
    }, { sum: 0, count: 0 });

    return {
      totalEntries,
      totalDeviations,
      conformityPct,
      averageSelectedKpi: avgSelected.count ? avgSelected.sum / avgSelected.count : null,
    };
  }, [previousEntries, previousDeviations, masters.kpiConfigs, selectedKpi]);

  const topDeviations = useMemo(() => {
    const counter = filteredDeviations.reduce((acc, dev) => {
      acc[dev.kpiKey] = (acc[dev.kpiKey] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(counter)
      .map(([kpiKey, count]) => ({ kpiKey, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [filteredDeviations]);

  const recurrenceByKpi = useMemo(() => {
    const previousCounts = previousDeviations.reduce((acc, dev) => {
      acc[dev.kpiKey] = (acc[dev.kpiKey] || 0) + 1;
      return acc;
    }, {});

    const currentCounts = filteredDeviations.reduce((acc, dev) => {
      acc[dev.kpiKey] = (acc[dev.kpiKey] || 0) + 1;
      return acc;
    }, {});

    return KPI_ORDER
      .map((key) => {
        const currentCount = currentCounts[key] || 0;
        const previousCount = previousCounts[key] || 0;
        const repeated = currentCount > 0 && previousCount > 0;
        const delta = currentCount - previousCount;
        return {
          kpiKey: key,
          currentCount,
          previousCount,
          repeated,
          delta,
        };
      })
      .filter((item) => item.currentCount > 0 || item.previousCount > 0)
      .sort((a, b) => {
        if (Number(b.repeated) !== Number(a.repeated)) return Number(b.repeated) - Number(a.repeated);
        return b.currentCount - a.currentCount || b.delta - a.delta;
      })
      .slice(0, 8);
  }, [filteredDeviations, previousDeviations]);

  const recentCriticals = useMemo(() => {
    const cfgs = masters.kpiConfigs;

    return filteredEntries
      .filter((entry) => isEntryCritical(entry, cfgs))
      .slice(0, 8)
      .map((entry) => {
        const badKeys = KPI_ORDER.filter((key) => {
          const value = getEntryValue(entry, key);
          const status = evaluateKpi(value, cfgs[key]);
          return status === 'BAD';
        });

        return {
          id: entry.id,
          date: entry.date,
          shift: entry.shift,
          operatorName: nameById(masters.operators, entry.operatorId),
          firstBadKpi: badKeys[0] || null,
          badCount: badKeys.length,
        };
      });
  }, [filteredEntries, masters.kpiConfigs, masters.operators]);

  const shiftDistribution = useMemo(() => {
    const base = { MANHA: 0, TARDE: 0, NOITE: 0 };

    filteredDeviations.forEach((dev) => {
      if (base[dev.shift] !== undefined) base[dev.shift] += 1;
    });

    return [
      { shift: 'Manhã', count: base.MANHA },
      { shift: 'Tarde', count: base.TARDE },
      { shift: 'Noite', count: base.NOITE },
    ];
  }, [filteredDeviations]);

  const shiftComparison = useMemo(() => {
    const cfg = masters.kpiConfigs[selectedKpi];
    const base = {
      MANHA: { sum: 0, count: 0, bad: 0 },
      TARDE: { sum: 0, count: 0, bad: 0 },
      NOITE: { sum: 0, count: 0, bad: 0 },
    };

    filteredEntries.forEach((entry) => {
      const bucket = base[entry.shift];
      if (!bucket) return;
      const value = Number(getEntryValue(entry, selectedKpi));
      if (Number.isFinite(value)) {
        bucket.sum += value;
        bucket.count += 1;
        if (evaluateKpi(value, cfg) === 'BAD') bucket.bad += 1;
      }
    });

    return Object.entries(base).map(([key, stats]) => ({
      key,
      shift: shiftLabel(key),
      average: stats.count ? stats.sum / stats.count : null,
      bad: stats.bad,
      count: stats.count,
    }));
  }, [filteredEntries, masters.kpiConfigs, selectedKpi]);

  const operatorRanking = useMemo(() => {
    const cfg = masters.kpiConfigs;
    const counter = {};

    filteredEntries.forEach((entry) => {
      const operatorName = nameById(masters.operators, entry.operatorId);
      if (!counter[operatorName]) {
        counter[operatorName] = { operatorName, critical: 0, total: 0 };
      }
      counter[operatorName].total += 1;
      if (isEntryCritical(entry, cfg)) counter[operatorName].critical += 1;
    });

    return Object.values(counter)
      .map((item) => ({
        ...item,
        rate: item.total ? (item.critical / item.total) * 100 : 0,
      }))
      .sort((a, b) => b.critical - a.critical || b.rate - a.rate)
      .slice(0, 8);
  }, [filteredEntries, masters.operators, masters.kpiConfigs]);

  const slaSummary = useMemo(() => {
    const parseDate = (value) => value ? new Date(`${value}T00:00:00`) : null;
    const diffDays = (from, to) => Math.max(0, Math.round((to - from) / 86400000));

    const relevant = filteredDeviations;
    const openItems = relevant.filter((d) => d.status !== 'CONCLUIDO');
    const withDueDate = relevant.filter((d) => d.dueDate);
    const onTimeCount = withDueDate.filter((d) => {
      const due = parseDate(d.dueDate);
      if (!due) return false;
      const end = d.closedAt ? new Date(d.closedAt) : new Date();
      return end <= due;
    }).length;
    const overdue = openItems.filter((d) => d.dueDate && d.dueDate < new Date().toISOString().slice(0, 10)).length;
    const avgOpenAgeBase = openItems
      .map((d) => {
        const start = parseDate(d.date);
        return start ? diffDays(start, new Date()) : null;
      })
      .filter((v) => Number.isFinite(v));
    const avgClosureBase = relevant
      .filter((d) => d.closedAt)
      .map((d) => {
        const start = parseDate(d.date);
        const end = d.closedAt ? new Date(d.closedAt) : null;
        return start && end ? diffDays(start, end) : null;
      })
      .filter((v) => Number.isFinite(v));

    return {
      totalMeasured: withDueDate.length,
      onTime: onTimeCount,
      onTimeRate: withDueDate.length ? (onTimeCount / withDueDate.length) * 100 : 0,
      overdue,
      avgOpenAge: avgOpenAgeBase.length ? avgOpenAgeBase.reduce((a, b) => a + b, 0) / avgOpenAgeBase.length : 0,
      avgClosureDays: avgClosureBase.length ? avgClosureBase.reduce((a, b) => a + b, 0) / avgClosureBase.length : 0,
    };
  }, [filteredDeviations]);

  const monthlyExecutive = useMemo(() => {
    const approved = monthlyEntries.filter((item) => item.approvalStatus === 'APROVADO').length;
    const pending = monthlyEntries.filter((item) => item.approvalStatus !== 'APROVADO').length;
    const openDeviations = monthlyDeviations.filter((item) => item.status !== 'CONCLUIDO').length;
    const overdue = monthlyDeviations.filter((item) => item.status !== 'CONCLUIDO' && item.dueDate && item.dueDate < new Date().toISOString().slice(0, 10)).length;
    return {
      entries: monthlyEntries.length,
      approved,
      pending,
      openDeviations,
      overdue,
    };
  }, [monthlyEntries, monthlyDeviations]);

  const exportExecutiveReport = () => {
    const html = buildExecutiveReportHtml({
      periodLabel,
      shift: selectedShift ? shiftLabel(selectedShift) : '',
      selectedKpiLabel: getKpiLabel(selectedKpi),
      selectedUnit,
      userName: currentUser?.name || 'Usuário local',
      generatedAt: new Date().toLocaleString('pt-BR'),
      summary: { ...executiveSummary, avgCurrentSelectedKpi },
      sla: slaSummary,
      topDeviations: topDeviations.map((item) => ({ ...item, label: getKpiLabel(item.kpiKey) })),
      recurrenceByKpi: recurrenceByKpi.map((item) => ({ ...item, label: getKpiLabel(item.kpiKey) })),
      operatorRanking,
    });
    downloadHtmlReport(`relatorio_executivo_adm_${new Date().toISOString().slice(0,10)}.html`, html);
  };


  const qualityQueue = useMemo(() => {
    return state.deviations
      .filter((item) => (!selectedShift || item.shift === selectedShift) && ['CONTIDO', 'VALIDADO_QUALIDADE'].includes(item.status))
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '') || (b.date || '').localeCompare(a.date || ''))
      .slice(0, 8);
  }, [state.deviations, selectedShift]);

  const recurrenceAlerts = useMemo(() => {
    return recurrenceByKpi.filter((item) => item.repeated && item.currentCount >= 2).slice(0, 3);
  }, [recurrenceByKpi]);

  const roleNotifications = useMemo(() => buildRoleNotifications(state, currentUser), [state, currentUser]);

  function exportMonthlyConsolidatedReport() {
    const now = new Date();
    const monthLabel = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const html = buildMonthlyConsolidatedHtml({
      monthLabel,
      userName: currentUser?.name || 'Usuário local',
      generatedAt: new Date().toLocaleString('pt-BR'),
      entries: monthlyEntries,
      deviations: monthlyDeviations,
      masters,
    });
    downloadHtmlReport(`relatorio_mensal_adm_${now.toISOString().slice(0,7)}.html`, html);
  }
  const currentSpec = masters.kpiConfigs[selectedKpi];
  const periodLabel = getPeriodConfig(period).label;
  const avgCurrentSelectedKpi = useMemo(() => {
    const agg = filteredEntries.reduce((acc, entry) => {
      const value = Number(getEntryValue(entry, selectedKpi));
      if (!Number.isFinite(value)) return acc;
      acc.sum += value;
      acc.count += 1;
      return acc;
    }, { sum: 0, count: 0 });
    return agg.count ? agg.sum / agg.count : null;
  }, [filteredEntries, selectedKpi]);

  const periodComparison = {
    conformityDelta: executiveSummary.conformityPct - previousSummary.conformityPct,
    deviationsDelta: executiveSummary.totalDeviations - previousSummary.totalDeviations,
    entriesDelta: executiveSummary.totalEntries - previousSummary.totalEntries,
    kpiAverageDelta: (avgCurrentSelectedKpi ?? 0) - (previousSummary.averageSelectedKpi ?? 0),
  };

  return (
    <>
      <div className="header admHeader">
        <div>
          <div className="entryEyebrow">ADM • Corporate Operations</div>
          <div className="h1">Sistema de Gestão ADM</div>
          <div className="sub">
            Monitoramento operacional de qualidade, conformidade e tendência dos indicadores de processo.
          </div>
        </div>
        <div className="headerMetaCard card" style={{ margin: 0 }}>
          <div className="small">Usuário / planta</div>
          <div style={{ fontWeight: 800, marginTop: 4 }}>{currentUser?.name || '—'}</div>
          <div className="small" style={{ marginTop: 4 }}>{currentUser?.plant || 'ADM'} • {selectedShift ? shiftLabel(selectedShift) : 'Todos os turnos'}</div>
        </div>
      </div>

      <div className="card filterCard" style={{ marginBottom: 12 }}>
        <div className="cardTitle">
          <span>Filtros de análise</span>
          {ctx.can('EXPORT_DATA') ? (
            <div className="btnRow" style={{ marginTop: 0 }}>
              <button className="primary" onClick={exportExecutiveReport}>Exportar relatório executivo</button>
              <button onClick={exportMonthlyConsolidatedReport}>Relatório mensal</button>
            </div>
          ) : null}
        </div>
        <div className="row">
          <div className="field" style={{ minWidth: 180 }}>
            <label>Período</label>
            <select value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="today">Hoje</option>
              <option value="7">Últimos 7 dias</option>
              <option value="30">Últimos 30 dias</option>
            </select>
          </div>

          <div className="field" style={{ minWidth: 180 }}>
            <label>Turno</label>
            <select value={selectedShift} onChange={(e) => setSelectedShift(e.target.value)}>
              <option value="">Todos os turnos</option>
              <option value="MANHA">Manhã</option>
              <option value="TARDE">Tarde</option>
              <option value="NOITE">Noite</option>
            </select>
          </div>

          <div className="field" style={{ minWidth: 320 }}>
            <label>KPI do gráfico</label>
            <select value={selectedKpi} onChange={(e) => setSelectedKpi(e.target.value)}>
              {KPI_ORDER.map((key) => (
                <option key={key} value={key}>
                  {getKpiLabel(key)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>


      {recurrenceAlerts.length ? (
        <div className="card" style={{ marginBottom: 12, border: '1px solid rgba(245,166,35,.35)', background: 'rgba(245,166,35,.08)' }}>
          <div className="cardTitle">Alerta automático de reincidência</div>
          <div className="small">Os KPIs abaixo repetiram desvio entre o período anterior e o atual.</div>
          <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
            {recurrenceAlerts.map((item) => (
              <span key={item.kpiKey} className="pill" style={{ borderColor: 'var(--warn)' }}>
                <b>{getKpiLabel(item.kpiKey)}</b> • atual {item.currentCount} • anterior {item.previousCount}
              </span>
            ))}
          </div>
        </div>
      ) : null}

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
        <div className="cardTitle">Painel executivo mensal</div>
        <div className="small" style={{ marginBottom: 10 }}>Consolidado do mês corrente para acompanhamento gerencial.</div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <div className="card" style={{ margin: 0 }}>
            <div className="small">Apontamentos do mês</div>
            <div className="h1" style={{ fontSize: 24 }}>{monthlyExecutive.entries}</div>
          </div>
          <div className="card" style={{ margin: 0 }}>
            <div className="small">Aprovados</div>
            <div className="h1" style={{ fontSize: 24, color: 'var(--ok)' }}>{monthlyExecutive.approved}</div>
          </div>
          <div className="card" style={{ margin: 0 }}>
            <div className="small">Pendentes</div>
            <div className="h1" style={{ fontSize: 24, color: monthlyExecutive.pending > 0 ? 'var(--warn)' : 'var(--text)' }}>{monthlyExecutive.pending}</div>
          </div>
          <div className="card" style={{ margin: 0 }}>
            <div className="small">Desvios abertos</div>
            <div className="h1" style={{ fontSize: 24, color: monthlyExecutive.openDeviations > 0 ? 'var(--bad)' : 'var(--text)' }}>{monthlyExecutive.openDeviations}</div>
          </div>
          <div className="card" style={{ margin: 0 }}>
            <div className="small">Desvios atrasados</div>
            <div className="h1" style={{ fontSize: 24, color: monthlyExecutive.overdue > 0 ? 'var(--bad)' : 'var(--ok)' }}>{monthlyExecutive.overdue}</div>
          </div>
        </div>
      </div>

      {ctx.can('VALIDATE_DEVIATIONS') ? (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="cardTitle">Pendências da Qualidade</div>
          <div className="small" style={{ marginBottom: 10 }}>Fila de desvios aguardando validação da Qualidade ou fechamento final.</div>
          <table className="table">
            <thead>
              <tr>
                <th className="th">Status</th>
                <th className="th">Data</th>
                <th className="th">Turno</th>
                <th className="th">KPI</th>
                <th className="th">Prazo</th>
              </tr>
            </thead>
            <tbody>
              {qualityQueue.map((item) => (
                <tr key={item.id} className="tr">
                  <td className="td">{item.status === 'CONTIDO' ? 'Aguardando validação' : 'Pronto para conclusão'}</td>
                  <td className="td">{item.date}</td>
                  <td className="td">{shiftLabel(item.shift)}</td>
                  <td className="td"><b>{getKpiLabel(item.kpiKey)}</b></td>
                  <td className="td">{item.dueDate || '—'}</td>
                </tr>
              ))}
              {!qualityQueue.length && (
                <tr><td className="td" colSpan={5} style={{ color: 'var(--muted)' }}>Nenhuma pendência da Qualidade no momento.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {!kpiSummary ? (
        <div className="card">
          <div className="cardTitle">Sem dados</div>
          <div className="small">Faça o primeiro apontamento em “Apontamentos”.</div>
        </div>
      ) : (
        <>
          <div className="executiveGrid" style={{ marginBottom: 12 }}>
            <StatCard
              title="% de conformidade"
              value={`${formatNumber(executiveSummary.conformityPct)}%`}
              hint={`Variação vs período anterior: ${formatDelta(periodComparison.conformityDelta, '%')}`}
              tone={executiveSummary.conformityPct >= 95 ? 'ok' : executiveSummary.conformityPct >= 85 ? 'warn' : 'bad'}
            />
            <StatCard
              title="Desvios no período"
              value={executiveSummary.totalDeviations}
              hint={`Variação vs período anterior: ${formatDelta(periodComparison.deviationsDelta)}`}
              tone={executiveSummary.totalDeviations > 0 ? 'bad' : 'ok'}
            />
            <StatCard
              title={`Média do KPI • ${getKpiLabel(selectedKpi)}`}
              value={`${formatNumber(Number(avgCurrentSelectedKpi))} ${selectedUnit}`.trim()}
              hint={`Variação vs período anterior: ${formatDelta(periodComparison.kpiAverageDelta, selectedUnit ? ` ${selectedUnit}` : '')}`}
              tone="default"
            />
            <StatCard
              title="Apontamentos no período"
              value={executiveSummary.totalEntries}
              hint={`Variação vs período anterior: ${formatDelta(periodComparison.entriesDelta)}`}
              tone="default"
            />
          </div>

          <div className="grid" style={{ marginBottom: 12 }}>
            <div className="card">
              <div className="cardTitle">Comparativo com período anterior</div>
              <div className="small" style={{ marginBottom: 12 }}>
                Janela atual: <b>{periodLabel}</b> • Janela anterior com mesma duração.
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th className="th">Indicador</th>
                    <th className="th">Atual</th>
                    <th className="th">Anterior</th>
                    <th className="th">Variação</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="tr">
                    <td className="td"><b>Conformidade</b></td>
                    <td className="td">{formatNumber(executiveSummary.conformityPct)}%</td>
                    <td className="td">{formatNumber(previousSummary.conformityPct)}%</td>
                    <td className="td">{formatDelta(periodComparison.conformityDelta, '%')}</td>
                  </tr>
                  <tr className="tr">
                    <td className="td"><b>Desvios</b></td>
                    <td className="td">{executiveSummary.totalDeviations}</td>
                    <td className="td">{previousSummary.totalDeviations}</td>
                    <td className="td">{formatDelta(periodComparison.deviationsDelta)}</td>
                  </tr>
                  <tr className="tr">
                    <td className="td"><b>{getKpiLabel(selectedKpi)}</b></td>
                    <td className="td">{formatNumber(avgCurrentSelectedKpi)} {selectedUnit}</td>
                    <td className="td">{formatNumber(previousSummary.averageSelectedKpi)} {selectedUnit}</td>
                    <td className="td">{formatDelta(periodComparison.kpiAverageDelta, selectedUnit ? ` ${selectedUnit}` : '')}</td>
                  </tr>
                  <tr className="tr">
                    <td className="td"><b>Apontamentos</b></td>
                    <td className="td">{executiveSummary.totalEntries}</td>
                    <td className="td">{previousSummary.totalEntries}</td>
                    <td className="td">{formatDelta(periodComparison.entriesDelta)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="card">
              <div className="cardTitle">Reincidência de desvios por KPI</div>
              <div className="small" style={{ marginBottom: 12 }}>
                KPIs com repetição entre o período atual e a janela imediatamente anterior.
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th className="th">KPI</th>
                    <th className="th">Atual</th>
                    <th className="th">Anterior</th>
                    <th className="th">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recurrenceByKpi.map((item) => (
                    <tr key={item.kpiKey} className="tr">
                      <td className="td"><b>{getKpiLabel(item.kpiKey)}</b></td>
                      <td className="td">{item.currentCount}</td>
                      <td className="td">{item.previousCount}</td>
                      <td className="td">{item.repeated ? 'Reincidente' : 'Pontual'}</td>
                    </tr>
                  ))}
                  {!recurrenceByKpi.length && (
                    <tr>
                      <td className="td" colSpan={4} style={{ color: 'var(--muted)' }}>
                        Sem reincidência identificada entre os períodos comparados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 12 }}>
            <div className="cardTitle">Último apontamento</div>
            <div className="row">
              <span className="pill">Data: <b>{kpiSummary.last.date}</b></span>
              <span className="pill">Turno: <b>{shiftLabel(kpiSummary.last.shift)}</b></span>
              <span className="pill">Operador: <b>{nameById(masters.operators, kpiSummary.last.operatorId)}</b></span>
              <span className="pill">Produto: <b>{nameById(masters.products, kpiSummary.last.productId)}</b></span>
            </div>

            <div className="hr" />

            <div className="kpiGrid">
              {KPI_ORDER.map((key) => {
                const cfg = masters.kpiConfigs[key];
                const unit = cfg?.unit || '';
                return (
                  <div className="kpi" key={key}>
                    <div className="l">{getKpiLabel(key)}</div>
                    <div className="v">
                      {formatNumber(Number(kpiSummary.values[key]))} {unit}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <StatusBadge status={kpiSummary.statuses[key]} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card" style={{ marginBottom: 12 }}>
            <div className="cardTitle">Tendência do KPI selecionado</div>
            <div className="small" style={{ marginBottom: 12 }}>
              Indicador analisado: <b>{getKpiLabel(selectedKpi)}</b>
              {currentSpec?.type === 'CONTROL' && Number.isFinite(Number(currentSpec.lsl)) && Number.isFinite(Number(currentSpec.usl)) ? (
                <> • Faixa esperada: <b>{formatNumber(Number(currentSpec.lsl))} a {formatNumber(Number(currentSpec.usl))} {selectedUnit}</b></>
              ) : null}
              {currentSpec?.type !== 'CONTROL' && Number.isFinite(Number(currentSpec?.target)) ? (
                <> • Referência operacional: <b>{formatNumber(Number(currentSpec.target))} {selectedUnit}</b></>
              ) : null}
            </div>

            <div className="grid">
              <div className="card" style={{ margin: 0 }}>
                <div className="cardTitle">Média diária</div>
                <TrendChart
                  data={dailySeries}
                  unit={selectedUnit}
                  spec={masters.kpiConfigs[selectedKpi]}
                  emptyText="Cadastre apontamentos em dias diferentes para visualizar a média diária."
                />
              </div>

              <div className="card" style={{ margin: 0 }}>
                <div className="cardTitle">Média mensal</div>
                <TrendChart
                  data={monthlySeries}
                  unit={selectedUnit}
                  spec={masters.kpiConfigs[selectedKpi]}
                  emptyText="Cadastre apontamentos em meses diferentes para visualizar a média mensal."
                />
              </div>
            </div>
          </div>

          <div className="grid" style={{ marginBottom: 12 }}>
            <div className="card">
              <div className="cardTitle">Comparativo por turno • {getKpiLabel(selectedKpi)}</div>
              <table className="table">
                <thead>
                  <tr>
                    <th className="th">Turno</th>
                    <th className="th">Média</th>
                    <th className="th">Ocorrências fora</th>
                    <th className="th">Base</th>
                  </tr>
                </thead>
                <tbody>
                  {shiftComparison.map((item) => (
                    <tr key={item.key} className="tr">
                      <td className="td"><b>{item.shift}</b></td>
                      <td className="td">{formatNumber(item.average)} {selectedUnit}</td>
                      <td className="td">{item.bad}</td>
                      <td className="td">{item.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="card">
              <div className="cardTitle">Ranking de criticidade por operador</div>
              <table className="table">
                <thead>
                  <tr>
                    <th className="th">Operador</th>
                    <th className="th">Críticos</th>
                    <th className="th">Total</th>
                    <th className="th">Taxa</th>
                  </tr>
                </thead>
                <tbody>
                  {operatorRanking.map((item) => (
                    <tr key={item.operatorName} className="tr">
                      <td className="td"><b>{item.operatorName}</b></td>
                      <td className="td">{item.critical}</td>
                      <td className="td">{item.total}</td>
                      <td className="td">{formatNumber(item.rate)}%</td>
                    </tr>
                  ))}
                  {!operatorRanking.length && (
                    <tr>
                      <td className="td" colSpan={4} style={{ color: 'var(--muted)' }}>
                        Sem apontamentos suficientes para gerar ranking.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid" style={{ marginBottom: 12 }}>
            <div className="card">
              <div className="cardTitle">Top desvios por KPI</div>
              <table className="table">
                <thead>
                  <tr>
                    <th className="th">KPI</th>
                    <th className="th">Ocorrências</th>
                  </tr>
                </thead>
                <tbody>
                  {topDeviations.map((item) => (
                    <tr key={item.kpiKey} className="tr">
                      <td className="td"><b>{getKpiLabel(item.kpiKey)}</b></td>
                      <td className="td">{item.count}</td>
                    </tr>
                  ))}
                  {!topDeviations.length && (
                    <tr>
                      <td className="td" colSpan={2} style={{ color: 'var(--muted)' }}>
                        Nenhum desvio registrado no período selecionado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="card">
              <div className="cardTitle">Últimos apontamentos críticos</div>
              <table className="table">
                <thead>
                  <tr>
                    <th className="th">Data</th>
                    <th className="th">Turno</th>
                    <th className="th">Operador</th>
                    <th className="th">KPI</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCriticals.map((item) => (
                    <tr key={item.id} className="tr">
                      <td className="td">{item.date}</td>
                      <td className="td">{shiftLabel(item.shift)}</td>
                      <td className="td">{item.operatorName}</td>
                      <td className="td">
                        <b>{item.firstBadKpi ? getKpiLabel(item.firstBadKpi) : '—'}</b>
                        {item.badCount > 1 ? ` (+${item.badCount - 1})` : ''}
                      </td>
                    </tr>
                  ))}
                  {!recentCriticals.length && (
                    <tr>
                      <td className="td" colSpan={4} style={{ color: 'var(--muted)' }}>
                        Nenhum apontamento crítico no período selecionado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid" style={{ marginBottom: 12 }}>
            <div className="card">
              <div className="cardTitle">Distribuição de desvios por turno</div>
              <table className="table">
                <thead>
                  <tr>
                    <th className="th">Turno</th>
                    <th className="th">Desvios</th>
                  </tr>
                </thead>
                <tbody>
                  {shiftDistribution.map((item) => (
                    <tr key={item.shift} className="tr">
                      <td className="td">{item.shift}</td>
                      <td className="td">{item.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="card">
              <div className="cardTitle">Desvios abertos</div>
              <table className="table">
                <thead>
                  <tr>
                    <th className="th">Data</th>
                    <th className="th">Turno</th>
                    <th className="th">KPI</th>
                    <th className="th">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {openDevs.map((d) => (
                    <tr key={d.id} className="tr">
                      <td className="td">{d.date}</td>
                      <td className="td">{shiftLabel(d.shift)}</td>
                      <td className="td"><b>{getKpiLabel(d.kpiKey)}</b></td>
                      <td className="td">{d.status}</td>
                    </tr>
                  ))}
                  {!openDevs.length && (
                    <tr>
                      <td className="td" colSpan={4} style={{ color: 'var(--muted)' }}>
                        Nenhum desvio aberto.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="cardTitle">Últimos lançamentos</div>
            <table className="table">
              <thead>
                <tr>
                  <th className="th">Data</th>
                  <th className="th">Turno</th>
                  <th className="th">Operador</th>
                  <th className="th">Produto</th>
                </tr>
              </thead>
              <tbody>
                {lastByShift.map((e) => (
                  <tr key={e.id} className="tr">
                    <td className="td">{e.date}</td>
                    <td className="td">{shiftLabel(e.shift)}</td>
                    <td className="td">{nameById(masters.operators, e.operatorId)}</td>
                    <td className="td">{nameById(masters.products, e.productId)}</td>
                  </tr>
                ))}
                {!lastByShift.length && (
                  <tr>
                    <td className="td" colSpan={4} style={{ color: 'var(--muted)' }}>
                      Sem lançamentos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
