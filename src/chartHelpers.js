export const KPI_ORDER = [
  'OEE',
  'PRODUTIVIDADE',
  'UMIDADE_SOJA_ENTRADA_SECADOR_MEGA',
  'UMIDADE_SOJA_ENTRADA_PREPARACAO_RDL_2504',
  'UMIDADE_FARELO',
  'PROTEINA',
  'OLEO',
  'FIBRA',
  'CINZA',
  'OLEO_CASCA',
  'LEX',
];

export const KPI_VALUE_GETTERS = {
  OEE: (entry) => entry.oeePct ?? null,
  PRODUTIVIDADE: (entry) => entry.productivityTPH ?? null,
  UMIDADE_SOJA_ENTRADA_SECADOR_MEGA: (entry) => entry.quality?.umidadeSojaEntradaSecadorMega ?? null,
  UMIDADE_SOJA_ENTRADA_PREPARACAO_RDL_2504: (entry) => entry.quality?.umidadeSojaEntradaPreparacao ?? null,
  UMIDADE_FARELO: (entry) => entry.quality?.umidadeFarelo ?? null,
  PROTEINA: (entry) => entry.quality?.proteina ?? null,
  OLEO: (entry) => entry.quality?.oleo ?? null,
  FIBRA: (entry) => entry.quality?.fibra ?? null,
  CINZA: (entry) => entry.quality?.cinza ?? null,
  OLEO_CASCA: (entry) => entry.quality?.oleoCasca ?? null,
  LEX: (entry) => entry.quality?.lex ?? null,
};

function average(values) {
  const valid = values.map(Number).filter((v) => Number.isFinite(v));
  if (!valid.length) return null;
  return valid.reduce((acc, value) => acc + value, 0) / valid.length;
}

export function buildAverageSeries(entries, groupBy, kpiKey) {
  const getter = KPI_VALUE_GETTERS[kpiKey];
  if (!getter) return [];

  const grouped = entries.reduce((acc, entry) => {
    const key = groupBy(entry);
    if (!key) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(entry);
    return acc;
  }, {});

  return Object.entries(grouped)
    .map(([label, items]) => ({
      label,
      value: average(items.map(getter)),
      count: items.length,
    }))
    .filter((item) => item.value !== null)
    .sort((a, b) => a.label.localeCompare(b.label));
}
