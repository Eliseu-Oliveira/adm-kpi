import React, { useMemo } from 'react';
import { formatNumber } from '../utils';

function buildPath(points) {
  if (!points.length) return '';
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

function buildAreaPath(points, bottom) {
  if (!points.length) return '';
  const line = buildPath(points);
  const last = points[points.length - 1];
  const first = points[0];
  return `${line} L ${last.x} ${bottom} L ${first.x} ${bottom} Z`;
}

function getPointStatus(value, spec) {
  if (!Number.isFinite(value) || !spec) return 'neutral';

  if (Number.isFinite(spec.lsl) && Number.isFinite(spec.usl)) {
    if (value < spec.lsl || value > spec.usl) return 'bad';
    const margin = (spec.usl - spec.lsl) * 0.1;
    if (value < spec.lsl + margin || value > spec.usl - margin) return 'warn';
    return 'ok';
  }

  if (Number.isFinite(spec.target)) {
    if (spec.direction === 'up') {
      if (value >= spec.target) return 'ok';
      if (value >= spec.target * 0.95) return 'warn';
      return 'bad';
    }

    if (value <= spec.target) return 'ok';
    if (value <= spec.target * 1.05) return 'warn';
    return 'bad';
  }

  return 'neutral';
}

function trendText(delta) {
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.0001) return 'Estável';
  return delta > 0 ? 'Em alta' : 'Em queda';
}

export default function TrendChart({
  data,
  unit = '',
  emptyText = 'Sem dados suficientes para gerar o gráfico.',
  spec = null,
}) {
  const chart = useMemo(() => {
    const valid = data
      .map((item) => ({
        ...item,
        value: Number(item.value),
        count: Number(item.count) || 0,
      }))
      .filter((item) => Number.isFinite(item.value));

    if (!valid.length) return null;

    const values = valid.map((item) => item.value);
    if (Number.isFinite(spec?.target)) values.push(Number(spec.target));
    if (Number.isFinite(spec?.lsl)) values.push(Number(spec.lsl));
    if (Number.isFinite(spec?.usl)) values.push(Number(spec.usl));
    if (Number.isFinite(spec?.setpoint)) values.push(Number(spec.setpoint));

    let min = Math.min(...values);
    let max = Math.max(...values);

    if (min === max) {
      const padding = min === 0 ? 1 : Math.abs(min) * 0.08;
      min -= padding;
      max += padding;
    } else {
      const padding = Math.max((max - min) * 0.14, 0.2);
      min -= padding;
      max += padding;
    }

    const width = 900;
    const height = 400;
    const padding = { top: 26, right: 24, bottom: 62, left: 58 };
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;

    const yFor = (value) => {
      const ratio = (value - min) / (max - min || 1);
      return padding.top + innerHeight - ratio * innerHeight;
    };

    const xFor = (index) => {
      if (valid.length === 1) return padding.left + innerWidth / 2;
      return padding.left + (index / (valid.length - 1)) * innerWidth;
    };

    const points = valid.map((item, index) => ({
      ...item,
      x: xFor(index),
      y: yFor(item.value),
      status: getPointStatus(item.value, spec),
    }));

    const ticks = Array.from({ length: 6 }, (_, index) => {
      const ratio = index / 5;
      const value = max - ratio * (max - min);
      return {
        value,
        y: padding.top + ratio * innerHeight,
      };
    });

    const latest = valid[valid.length - 1];
    const previous = valid[valid.length - 2] || null;
    const average = valid.reduce((acc, item) => acc + item.value, 0) / valid.length;
    const peak = Math.max(...valid.map((item) => item.value));
    const trough = Math.min(...valid.map((item) => item.value));
    const range = peak - trough;
    const delta = previous ? latest.value - previous.value : 0;

    const statusCounts = points.reduce((acc, point) => {
      acc[point.status] = (acc[point.status] || 0) + 1;
      return acc;
    }, {});

    const compliance = points.length ? Math.round(((statusCounts.ok || 0) / points.length) * 100) : 0;

    return {
      width,
      height,
      padding,
      innerWidth,
      innerHeight,
      ticks,
      points,
      areaPath: buildAreaPath(points, padding.top + innerHeight),
      linePath: buildPath(points),
      upperLineY: Number.isFinite(spec?.usl) ? yFor(spec.usl) : null,
      lowerLineY: Number.isFinite(spec?.lsl) ? yFor(spec.lsl) : null,
      targetY: Number.isFinite(spec?.target) ? yFor(spec.target) : null,
      setpointY: Number.isFinite(spec?.setpoint) ? yFor(spec.setpoint) : null,
      latest,
      previous,
      average,
      peak,
      trough,
      range,
      delta,
      compliance,
      firstLabel: valid[0]?.label,
      lastLabel: latest?.label,
      sampleCount: valid.reduce((acc, item) => acc + item.count, 0),
      pointCount: valid.length,
    };
  }, [data, spec]);

  if (!chart) {
    return <div className="small" style={{ color: 'var(--muted)' }}>{emptyText}</div>;
  }

  const {
    width,
    height,
    padding,
    innerWidth,
    innerHeight,
    ticks,
    points,
    areaPath,
    linePath,
  } = chart;

  return (
    <div className="proChart">
      <div className="proChartTopbar">
        <div>
          <div className="proChartEyebrow">Painel analítico</div>
          <div className="proChartTitle">Tendência consolidada</div>
        </div>
        <div className="proChartStatusRow">
          <span className="proChartPill is-blue">{chart.pointCount} períodos</span>
          <span className="proChartPill is-green">{chart.compliance}% em conformidade</span>
          <span className="proChartPill is-neutral">{chart.sampleCount} amostras</span>
        </div>
      </div>

      <div className="proChartStats">
        <div className="proStatCard highlight">
          <span className="proStatLabel">Último valor</span>
          <strong>{formatNumber(chart.latest.value)} {unit}</strong>
          <small>{chart.lastLabel}</small>
        </div>
        <div className="proStatCard">
          <span className="proStatLabel">Média consolidada</span>
          <strong>{formatNumber(chart.average)} {unit}</strong>
          <small>{trendText(chart.delta)} · Δ {chart.previous ? formatNumber(chart.delta) : '0,00'} {unit}</small>
        </div>
        <div className="proStatCard">
          <span className="proStatLabel">Faixa observada</span>
          <strong>{formatNumber(chart.range)} {unit}</strong>
          <small>Min {formatNumber(chart.trough)} · Max {formatNumber(chart.peak)}</small>
        </div>
        <div className="proStatCard">
          <span className="proStatLabel">Referência operacional</span>
          <strong>
            {Number.isFinite(spec?.lsl) && Number.isFinite(spec?.usl)
              ? `${formatNumber(spec.lsl)} a ${formatNumber(spec.usl)}`
              : Number.isFinite(spec?.target)
                ? `${spec.direction === 'down' ? '≤' : '≥'} ${formatNumber(spec.target)}`
                : '—'} {unit}
          </strong>
          <small>{chart.firstLabel} → {chart.lastLabel}</small>
        </div>
      </div>

      <div className="proChartShell">
        <svg viewBox={`0 0 ${width} ${height}`} className="proChartSvg" role="img" aria-label="Gráfico de tendência operacional">
          <defs>
            <linearGradient id="proChartAreaFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgba(122,162,255,0.40)" />
              <stop offset="100%" stopColor="rgba(122,162,255,0.03)" />
            </linearGradient>
            <linearGradient id="proChartBandFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgba(46,229,157,0.14)" />
              <stop offset="100%" stopColor="rgba(46,229,157,0.05)" />
            </linearGradient>
          </defs>

          <rect x={padding.left} y={padding.top} width={innerWidth} height={innerHeight} rx="20" className="proChartPlotBg" />

          {ticks.map((tick, index) => (
            <g key={index}>
              <line x1={padding.left} x2={padding.left + innerWidth} y1={tick.y} y2={tick.y} className="proChartGrid" />
              <text x={padding.left - 10} y={tick.y + 4} textAnchor="end" className="proChartAxisText">
                {formatNumber(tick.value)}
              </text>
            </g>
          ))}

          {chart.upperLineY !== null && chart.lowerLineY !== null && (
            <rect
              x={padding.left}
              y={Math.min(chart.upperLineY, chart.lowerLineY)}
              width={innerWidth}
              height={Math.abs(chart.lowerLineY - chart.upperLineY)}
              rx="16"
              className="proChartBand"
            />
          )}

          {chart.upperLineY !== null && (
            <g>
              <line x1={padding.left} x2={padding.left + innerWidth} y1={chart.upperLineY} y2={chart.upperLineY} className="proChartLimit" />
              <text x={padding.left + innerWidth - 6} y={chart.upperLineY - 8} textAnchor="end" className="proChartLimitText">
                USL {formatNumber(spec.usl)} {unit}
              </text>
            </g>
          )}

          {chart.lowerLineY !== null && (
            <g>
              <line x1={padding.left} x2={padding.left + innerWidth} y1={chart.lowerLineY} y2={chart.lowerLineY} className="proChartLimit" />
              <text x={padding.left + innerWidth - 6} y={chart.lowerLineY - 8} textAnchor="end" className="proChartLimitText">
                LSL {formatNumber(spec.lsl)} {unit}
              </text>
            </g>
          )}

          {chart.targetY !== null && (
            <g>
              <line x1={padding.left} x2={padding.left + innerWidth} y1={chart.targetY} y2={chart.targetY} className="proChartTarget" />
              <text x={padding.left + 6} y={chart.targetY - 8} textAnchor="start" className="proChartTargetText">
                Meta {formatNumber(spec.target)} {unit}
              </text>
            </g>
          )}

          {chart.setpointY !== null && (
            <g>
              <line x1={padding.left} x2={padding.left + innerWidth} y1={chart.setpointY} y2={chart.setpointY} className="proChartSetpoint" />
              <text x={padding.left + 6} y={chart.setpointY - 8} textAnchor="start" className="proChartSetpointText">
                Setpoint {formatNumber(spec.setpoint)} {unit}
              </text>
            </g>
          )}

          {points.map((point, index) => (
            <line
              key={`v-${point.label}`}
              x1={point.x}
              x2={point.x}
              y1={padding.top}
              y2={padding.top + innerHeight}
              className={index === points.length - 1 ? 'proChartGuide is-last' : 'proChartGuide'}
            />
          ))}

          <path d={areaPath} className="proChartArea" />
          <path d={linePath} className="proChartLine" />

          {points.map((point, index) => {
            const showLabel = points.length <= 8 || index === 0 || index === points.length - 1 || index % 2 === 0;
            return (
              <g key={point.label}>
                <circle cx={point.x} cy={point.y} r={index === points.length - 1 ? '7' : '5'} className={`proChartPoint ${point.status}`} />
                {showLabel && (
                  <text x={point.x} y={height - 18} textAnchor="middle" className="proChartAxisText">
                    {point.label}
                  </text>
                )}
                {index === points.length - 1 && (
                  <g>
                    <rect x={point.x - 38} y={point.y - 42} width="76" height="24" rx="12" className="proChartCallout" />
                    <text x={point.x} y={point.y - 26} textAnchor="middle" className="proChartCalloutText">
                      {formatNumber(point.value)} {unit}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="proChartLegend">
        <span><i className="legendSwatch legendLine" />Média consolidada</span>
        {(chart.upperLineY !== null || chart.lowerLineY !== null) && <span><i className="legendSwatch legendBand" />Faixa operacional</span>}
        {chart.setpointY !== null && <span><i className="legendSwatch legendSetpoint" />Setpoint</span>}
        {chart.targetY !== null && <span><i className="legendSwatch legendTarget" />Meta</span>}
        <span><i className="legendDot ok" />Dentro da especificação</span>
        <span><i className="legendDot bad" />Fora da especificação</span>
      </div>
    </div>
  );
}
