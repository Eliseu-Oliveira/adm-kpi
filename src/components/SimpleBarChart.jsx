import React from 'react';
import { formatNumber } from '../utils';

export default function SimpleBarChart({ data, unit = '', emptyText = 'Sem dados suficientes para gerar o gráfico.' }) {
  if (!data.length) {
    return <div className="small" style={{ color: 'var(--muted)' }}>{emptyText}</div>;
  }

  const values = data.map((item) => Number(item.value)).filter((value) => Number.isFinite(value));
  const max = Math.max(...values, 1);

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {data.map((item) => {
        const width = `${Math.max((Number(item.value) / max) * 100, 4)}%`;
        return (
          <div key={item.label} style={{ display: 'grid', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>{item.label}</span>
              <span>{formatNumber(Number(item.value))} {unit} <span style={{ color: 'var(--muted)' }}>· n={item.count}</span></span>
            </div>
            <div style={{ height: 12, background: 'rgba(255,255,255,.05)', borderRadius: 999, overflow: 'hidden', border: '1px solid var(--line)' }}>
              <div style={{ width, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, var(--brand), #7dd3fc)' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
