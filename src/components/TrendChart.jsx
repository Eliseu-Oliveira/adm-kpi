import React, { useMemo } from 'react';
import { formatNumber } from '../utils';

function buildPath(points) {
  if (!points.length) return '';
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

function getPointStatus(value, spec) {
  if (!Number.isFinite(value) || !spec) return 'neutral';

  const lsl = Number(spec?.lsl);
  const usl = Number(spec?.usl);
  const target = Number(spec?.target);

  if (Number.isFinite(lsl) && Number.isFinite(usl)) {
    if (value < lsl || value > usl) return 'bad';
    const margin = (usl - lsl) * 0.1;
    if (value < lsl + margin || value > usl - margin) return 'warn';
    return 'ok';
  }

  if (Number.isFinite(target)) {
    if (spec.direction === 'up') {
      if (value >= target) return 'ok';
      if (value >= target * 0.95) return 'warn';
      return 'bad';
    }

    if (value <= target) return 'ok';
    if (value <= target * 1.05) return 'warn';
    return 'bad';
  }

  return 'neutral';
}

function trendText(delta) {
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.0001) return 'Estável';
  return delta > 0 ? 'Em alta' : 'Em queda';
}

function getTargetValue(spec) {
  const lsl = Number(spec?.lsl);
  const usl = Number(spec?.usl);
  const setpoint = Number(spec?.setpoint);
  const target = Number(spec?.target);

  if (Number.isFinite(setpoint)) return setpoint;
  if (Number.isFinite(lsl) && Number.isFinite(usl)) return (lsl + usl) / 2;
  if (Number.isFinite(target)) return target;
  return null;
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

    const targetValue = getTargetValue(spec);
    const lsl = Number(spec?.lsl);
    const usl = Number(spec?.usl);

    const values = valid.map((item) => item.value);
    if (Number.isFinite(targetValue)) values.push(targetValue);
    if (Number.isFinite(lsl)) values.push(lsl);
    if (Number.isFinite(usl)) values.push(usl);

    let min = Math.min(...values);
    let max = Math.max(...values);

    if (min === max) {
      const padding = min === 0 ? 1 : Math.abs(min) * 0.08;
      min -= padding;
      max += padding;
    } else {
      const padding = Math.max((max - min) * 0.16, 0.2);
      min -= padding;
      max += padding;
    }

    const width = 920;
    const height = 420;
    const padding = { top: 28, right: 26, bottom: 72, left: 58 };
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;

    const yFor = (value) => {
      const ratio = (value - min) / (max - min || 1);
      return padding.top + innerHeight - ratio * innerHeight;
    };

    const slotWidth = innerWidth / valid.length;
    const barWidth = Math.max(Math.min(slotWidth * 0.52, 52), 18);

    const bars = valid.map((item, index) => {
      const centerX = padding.left + slotWidth * index + slotWidth / 2;
      const topY = yFor(item.value);
      const baseY = padding.top + innerHeight;
      return {
        ...item,
        centerX,
        x: centerX - barWidth / 2,
        y: topY,
        width: barWidth,
        height: Math.max(baseY - topY, 2),
        status: getPointStatus(item.value, spec),
      };
    });

    const linePoints = bars.map((bar) => ({
      x: bar.centerX,
      y: Number.isFinite(targetValue) ? yFor(targetValue) : bar.y,
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

    const statusCounts = bars.reduce((acc, bar) => {
      acc[bar.status] = (acc[bar.status] || 0) + 1;
      return acc;
    }, {});

    const compliance = bars.length ? Math.round(((statusCounts.ok || 0) / bars.length) * 100) : 0;

    return {
      width,
      height,
      padding,
      innerWidth,
      innerHeight,
      ticks,
      bars,
      linePoints,
      linePath: Number.isFinite(targetValue) ? buildPath(linePoints) : '',
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
      targetValue,
      lsl,
      usl,
      lowerLineY: Number.isFinite(lsl) ? yFor(lsl) : null,
      upperLineY: Number.isFinite(usl) ? yFor(usl) : null,
      targetY: Number.isFinite(targetValue) ? yFor(targetValue) : null,
      baseY: padding.top + innerHeight,
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
    bars,
    linePath,
    linePoints,
  } = chart;

  return (
    <div className="proChart">
      <div className="proChartTopbar">
        <div>
          <div className="proChartEyebrow">Painel analítico</div>
          <div className="proChartTitle">Resultado real x meta</div>
        </div>
        <div className="proChartStatusRow">
          <span className="proChartPill is-blue">{chart.pointCount} períodos</span>
          <span className="proChartPill is-green">{chart.compliance}% em conformidade</span>
          <span className="proChartPill is-neutral">{chart.sampleCount} amostras</span>
        </div>
      </div>

      <div className="proChartStats">
        <div className="proStatCard highlight">
          <span className="proStatLabel">Último resultado</span>
          <strong>{formatNumber(chart.latest.value)} {unit}</strong>
          <small>{chart.lastLabel}</small>
        </div>
        <div className="proStatCard">
          <span className="proStatLabel">Meta de referência</span>
          <strong>{Number.isFinite(chart.targetValue) ? `${formatNumber(chart.targetValue)} ${unit}` : '—'}</strong>
          <small>
            {Number.isFinite(chart.lowerLineY) && Number.isFinite(chart.upperLineY)
              ? `Faixa ${formatNumber(chart.lsl)} a ${formatNumber(chart.usl)} ${unit}`
              : 'Linha de meta aplicada ao gráfico'}
          </small>
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
      </div>

      <div className="proChartShell">
        <svg viewBox={`0 0 ${width} ${height}`} className="proChartSvg" role="img" aria-label="Gráfico comparativo entre resultado e meta">
          <defs>
            <linearGradient id="proChartBarFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#35d3ff" />
              <stop offset="100%" stopColor="#19c7b5" />
            </linearGradient>
            <linearGradient id="proChartBandFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgba(109,190,69,0.16)" />
              <stop offset="100%" stopColor="rgba(109,190,69,0.05)" />
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

          {Number.isFinite(chart.lowerLineY) && Number.isFinite(chart.upperLineY) ? (
            <rect
              x={padding.left}
              y={Math.min(chart.upperLineY, chart.lowerLineY)}
              width={innerWidth}
              height={Math.abs(chart.lowerLineY - chart.upperLineY)}
              className="proChartBand"
              rx="18"
            />
          ) : null}

          {Number.isFinite(chart.lowerLineY) ? (
            <>
              <line x1={padding.left} x2={padding.left + innerWidth} y1={chart.lowerLineY} y2={chart.lowerLineY} className="proChartLimit" />
              <text x={padding.left + 10} y={chart.lowerLineY - 8} className="proChartLimitText">LSL {formatNumber(chart.lsl)}</text>
            </>
          ) : null}

          {Number.isFinite(chart.upperLineY) ? (
            <>
              <line x1={padding.left} x2={padding.left + innerWidth} y1={chart.upperLineY} y2={chart.upperLineY} className="proChartLimit" />
              <text x={padding.left + 10} y={chart.upperLineY - 8} className="proChartLimitText">USL {formatNumber(chart.usl)}</text>
            </>
          ) : null}

          {bars.map((bar, index) => (
            <g key={`${bar.label}-${index}`}>
              <rect
                x={bar.x}
                y={bar.y}
                width={bar.width}
                height={bar.height}
                rx="10"
                fill="url(#proChartBarFill)"
                opacity={bar.status === 'bad' ? 0.78 : 1}
              />
              <text x={bar.centerX} y={chart.baseY + 24} textAnchor="middle" className="proChartAxisText">
                {bar.label}
              </text>
            </g>
          ))}

          {linePath ? <path d={linePath} className="proChartTargetLine" /> : null}

          {linePoints.map((point, index) => (
            <circle key={`meta-${index}`} cx={point.x} cy={point.y} r="4.5" className="proChartTargetDot" />
          ))}

          {bars.map((bar, index) => (
            <circle
              key={`value-${index}`}
              cx={bar.centerX}
              cy={bar.y}
              r="5.5"
              className={`proChartPoint ${bar.status}`}
            />
          ))}

          {bars.length ? (
            <g transform={`translate(${bars[bars.length - 1].centerX - 54}, ${bars[bars.length - 1].y - 58})`}>
              <rect width="108" height="42" rx="12" className="proChartCallout" />
              <text x="54" y="18" textAnchor="middle" className="proChartCalloutText">Atual</text>
              <text x="54" y="31" textAnchor="middle" className="proChartCalloutText">
                {formatNumber(bars[bars.length - 1].value)} {unit}
              </text>
            </g>
          ) : null}
        </svg>
      </div>

      <div className="proChartLegend">
        <span><i className="legendSwatch legendBar" /> Resultado realizado</span>
        <span><i className="legendSwatch legendMeta" /> Meta / referência</span>
        {Number.isFinite(chart.lowerLineY) && Number.isFinite(chart.upperLineY) ? (
          <span><i className="legendSwatch legendBand" /> Faixa de especificação</span>
        ) : null}
        <span><i className="legendDot ok" /> Dentro da especificação</span>
        <span><i className="legendDot bad" /> Fora da especificação</span>
      </div>
    </div>
  );
}
