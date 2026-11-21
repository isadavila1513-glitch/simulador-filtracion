import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  Send,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import {
  AlertDispatchStatus,
  PublicHealthAlert,
  SensorTelemetry,
  SimulationParams,
  TelemetrySample,
} from '../types/filtration';

interface TelemetryDashboardProps {
  params: SimulationParams;
  telemetry: SensorTelemetry;
  samples: TelemetrySample[];
  alerts: PublicHealthAlert[];
  autoDispatchHealth: boolean;
  onToggleAutoDispatch: (val: boolean) => void;
  onSimulateThreeMinutes: () => void;
  onDispatchAlert: (alertId: string) => void;
  onAdvanceAlertStatus: (alertId: string, nextStatus: AlertDispatchStatus) => void;
}

export const TelemetryDashboard: React.FC<TelemetryDashboardProps> = ({
  params,
  telemetry,
  samples,
  alerts,
  autoDispatchHealth,
  onToggleAutoDispatch,
  onSimulateThreeMinutes,
  onDispatchAlert,
  onAdvanceAlertStatus,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const exportCsv = () => {
    const header =
      'Muestra,Tiempo_Sim,Calidad_ICA,Volumen_L,Peso_Bruto_g,pH,Turbidez_NTU,Temp_C,Cloro_mgL,Estado,Alerta_Salud\n';
    const rows = samples
      .map(
        (s) =>
          `${s.sampleIndex},${s.timeLabel},${s.qualityScore},${s.estimatedLiters},${s.loadCellGrossGrams},${s.ph},${s.turbidityNtu},${s.temperatureC},${s.residualChlorineMgL},${s.potabilityStatus},${s.alertGenerated ? 'SI' : 'NO'}`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'telemetria_filtracion_3min.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Dual-axis SVG chart geometry
  const chartW = 720;
  const chartH = 220;
  const padL = 44;
  const padR = 48;
  const padT = 18;
  const padB = 30;
  const innerW = chartW - padL - padR;
  const innerH = chartH - padT - padB;

  const visibleSamples = samples.slice(-16);
  const maxLiters = Math.max(5.5, ...visibleSamples.map((s) => s.estimatedLiters + 0.5));

  const getX = (i: number) =>
    visibleSamples.length <= 1
      ? padL + innerW / 2
      : padL + (i / (visibleSamples.length - 1)) * innerW;

  const getYQuality = (q: number) => padT + (1 - q / 100) * innerH;
  const getYLiters = (l: number) => padT + (1 - l / maxLiters) * innerH;

  const qualityPath = visibleSamples
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getYQuality(s.qualityScore).toFixed(1)}`)
    .join(' ');

  const litersPath = visibleSamples
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getYLiters(s.estimatedLiters).toFixed(1)}`)
    .join(' ');

  const hoveredSample = hoveredIdx !== null ? visibleSamples[hoveredIdx] : null;

  const statusConfig = {
    APTA: {
      text: 'Apta para ingesta',
      color: 'text-emerald-700',
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />,
      ledText: 'LED Verde encendido',
    },
    NO_APTA: {
      text: 'No apta · Precaución',
      color: 'text-amber-700',
      icon: <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />,
      ledText: 'LED Rojo encendido',
    },
    CRITICA: {
      text: 'Calidad crítica · Alerta',
      color: 'text-rose-700',
      icon: <XCircle className="w-4 h-4 text-rose-600 shrink-0" />,
      ledText: 'LED Rojo encendido · Intervención',
    },
  }[telemetry.potabilityStatus];

  return (
    <div className="space-y-8">
      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Load Cell -> Liters */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-mono tracking-wide text-slate-500 uppercase">
            KPI Volumen Estimado (Celda de Carga)
          </p>
          <div className="mt-2 flex items-baseline">
            <span className="text-3xl font-mono font-bold tabular-nums text-slate-900">
              {telemetry.estimatedLiters.toFixed(3)}
            </span>
            <span className="text-xs font-mono uppercase text-slate-500 ml-1.5">L</span>
          </div>
          <p className="mt-2 text-xs font-mono tabular-nums text-slate-600">
            Bruto: {telemetry.loadCellGrossGrams} g · Tara: {params.bottleTareGrams} g · Neto: {telemetry.loadCellNetGrams} g
          </p>
        </div>

        {/* KPI 2: Water Quality Index + ESP32 LED State */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-mono tracking-wide text-slate-500 uppercase">
            Calidad del Agua (ICA) · ESP32
          </p>
          <div className="mt-2 flex items-baseline">
            <span className="text-3xl font-mono font-bold tabular-nums text-slate-900">
              {telemetry.qualityScore}
            </span>
            <span className="text-xs font-mono uppercase text-slate-500 ml-1.5">/ 100</span>
          </div>
          <div className={`mt-2 flex items-center gap-1.5 text-xs font-semibold ${statusConfig.color}`}>
            {statusConfig.icon}
            <span>{statusConfig.text}</span>
          </div>
        </div>

        {/* KPI 3: 3 Submerged Sensors */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-mono tracking-wide text-slate-500 uppercase">
            Sensores Sumergidos + Cloro
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2 font-mono tabular-nums">
            <div>
              <span className="block text-[11px] text-slate-500">pH</span>
              <span className="text-lg font-semibold text-slate-900">{telemetry.ph.toFixed(2)}</span>
            </div>
            <div>
              <span className="block text-[11px] text-slate-500">Turbidez</span>
              <span className="text-lg font-semibold text-slate-900">{telemetry.turbidityNtu.toFixed(1)}</span>
              <span className="text-[10px] text-slate-500 ml-0.5">NTU</span>
            </div>
            <div>
              <span className="block text-[11px] text-slate-500">Temp</span>
              <span className="text-lg font-semibold text-slate-900">{telemetry.temperatureC.toFixed(1)}</span>
              <span className="text-[10px] text-slate-500 ml-0.5">°C</span>
            </div>
          </div>
          <p className="mt-2 text-xs font-mono tabular-nums text-slate-600">
            Cloro residual: {telemetry.residualChlorineMgL.toFixed(2)} mg/L · Flujo: {telemetry.flowRateMlMin} mL/min
          </p>
        </div>

        {/* KPI 4: 3-Minute Sampling Trigger */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <p className="text-xs font-mono tracking-wide text-slate-500 uppercase">
              Tablero de Control (Cada 3 min)
            </p>
            <div className="mt-2 flex items-baseline">
              <span className="text-3xl font-mono font-bold tabular-nums text-slate-900">
                {samples.length}
              </span>
              <span className="text-xs font-mono text-slate-500 ml-2">muestras registradas</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onSimulateThreeMinutes}
            className="mt-3 w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Clock className="w-3.5 h-3.5" />
            Registrar corte (+3 min)
          </button>
        </div>
      </div>

      {/* Main Split: Dual-Axis 3-Minute Chart + Public Health Alert Dispatch */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Dual-Axis SVG Chart */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Tendencia de Calidad y Cantidad cada 3 minutos
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Línea azul sólida: Calidad ICA (0–100) · Línea esmeralda discontinua: Volumen estimado (L) · Umbral crítico: 50
              </p>
            </div>
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar CSV
            </button>
          </div>

          <div className="relative">
            <svg
              viewBox={`0 0 ${chartW} ${chartH}`}
              className="w-full h-auto overflow-visible"
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {/* Horizontal grid lines */}
              {[0, 25, 50, 75, 100].map((val) => {
                const y = getYQuality(val);
                return (
                  <g key={val}>
                    <line
                      x1={padL}
                      y1={y}
                      x2={chartW - padR}
                      y2={y}
                      stroke={val === 50 ? '#FCA5A5' : '#E2E8F0'}
                      strokeDasharray={val === 50 ? '4 4' : undefined}
                      strokeWidth={1}
                    />
                    <text
                      x={padL - 8}
                      y={y + 4}
                      textAnchor="end"
                      className="fill-slate-400 text-[10px] font-mono tabular-nums"
                    >
                      {val}
                    </text>
                  </g>
                );
              })}

              {/* Right Y-axis Liters labels */}
              {[0, maxLiters / 2, maxLiters].map((litersVal, idx) => {
                const y = getYLiters(litersVal);
                return (
                  <text
                    key={idx}
                    x={chartW - padR + 8}
                    y={y + 4}
                    textAnchor="start"
                    className="fill-emerald-600 text-[10px] font-mono tabular-nums"
                  >
                    {litersVal.toFixed(1)}L
                  </text>
                );
              })}

              {/* Critical threshold label */}
              <text
                x={padL + 6}
                y={getYQuality(50) - 5}
                className="fill-rose-600 text-[9px] font-mono font-semibold"
              >
                UMBRAL ALERTA SALUD PÚBLICA (ICA &lt; 50)
              </text>

              {/* Liters curve */}
              {visibleSamples.length > 1 && (
                <path
                  d={litersPath}
                  fill="none"
                  stroke="#059669"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                />
              )}

              {/* Quality curve */}
              {visibleSamples.length > 1 && (
                <path
                  d={qualityPath}
                  fill="none"
                  stroke="#0284C7"
                  strokeWidth={2.5}
                />
              )}

              {/* Data points & X-axis time labels */}
              {visibleSamples.map((s, i) => {
                const cx = getX(i);
                const cyQ = getYQuality(s.qualityScore);
                const cyL = getYLiters(s.estimatedLiters);
                const isAlert = s.qualityScore < 50 || s.potabilityStatus === 'CRITICA';

                return (
                  <g key={s.id}>
                    <text
                      x={cx}
                      y={chartH - 8}
                      textAnchor="middle"
                      className="fill-slate-500 text-[10px] font-mono tabular-nums"
                    >
                      {s.timeLabel}
                    </text>

                    <circle
                      cx={cx}
                      cy={cyL}
                      r={hoveredIdx === i ? 5 : 3.5}
                      fill="#059669"
                    />
                    <circle
                      cx={cx}
                      cy={cyQ}
                      r={hoveredIdx === i ? 5.5 : 4}
                      fill={isAlert ? '#DC2626' : '#0284C7'}
                      stroke="#FFFFFF"
                      strokeWidth={1.5}
                    />

                    {/* Invisible hover column */}
                    <rect
                      x={cx - innerW / Math.max(visibleSamples.length, 4) / 2}
                      y={padT}
                      width={innerW / Math.max(visibleSamples.length, 4)}
                      height={innerH}
                      fill="transparent"
                      className="cursor-crosshair"
                      onMouseEnter={() => setHoveredIdx(i)}
                    />
                  </g>
                );
              })}

              {/* Crosshair */}
              {hoveredIdx !== null && visibleSamples[hoveredIdx] && (
                <line
                  x1={getX(hoveredIdx)}
                  y1={padT}
                  x2={getX(hoveredIdx)}
                  y2={chartH - padB}
                  stroke="#94A3B8"
                  strokeWidth={1}
                  strokeDasharray="2 2"
                />
              )}
            </svg>

            {hoveredSample && (
              <div className="mt-2 px-3 py-2 bg-slate-900 text-white rounded-lg text-xs font-mono tabular-nums flex flex-wrap items-center gap-4">
                <span>Muestra #{hoveredSample.sampleIndex} ({hoveredSample.timeLabel})</span>
                <span>ICA: {hoveredSample.qualityScore}/100</span>
                <span>Volumen: {hoveredSample.estimatedLiters.toFixed(3)} L</span>
                <span>pH: {hoveredSample.ph}</span>
                <span>Turbidez: {hoveredSample.turbidityNtu} NTU</span>
              </div>
            )}
          </div>
        </div>

        {/* Public Health Intervention Panel */}
        <div
          id="salud-publica"
          className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Alertas a Salud Pública
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Remisión automática o manual ante calidad crítica (ICA &lt; 50 o turbidez/pH críticos).
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={autoDispatchHealth}
                  onChange={(e) => onToggleAutoDispatch(e.target.checked)}
                  className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                Auto-remitir
              </label>
            </div>

            <div className="mt-4 space-y-3 max-h-[260px] overflow-y-auto pr-1">
              {alerts.length === 0 ? (
                <div className="border border-dashed border-slate-200 rounded-lg p-5 text-center">
                  <ShieldAlert className="w-5 h-5 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm font-medium text-slate-700">
                    Sin alertas críticas registradas
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Prueba los escenarios de Turbidez Crítica o Desbalance Ácido para activar una alerta de intervención.
                  </p>
                </div>
              ) : (
                alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/60"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-mono font-semibold text-rose-700">
                        {alert.id} · {alert.createdAtLabel}
                      </span>
                      <span className="text-xs font-mono text-slate-600">
                        ICA {alert.qualityScore}/100 · {alert.estimatedLiters.toFixed(2)} L
                      </span>
                    </div>

                    <p className="mt-1.5 text-xs text-slate-700">
                      {alert.causes.join(' · ')}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-slate-200">
                      <span className="text-xs font-medium text-slate-700">
                        Estado:{' '}
                        <span
                          className={
                            alert.dispatchStatus === 'RESUELTA'
                              ? 'text-emerald-700 font-semibold'
                              : alert.dispatchStatus === 'PENDIENTE'
                              ? 'text-rose-700 font-semibold'
                              : 'text-sky-700 font-semibold'
                          }
                        >
                          {alert.dispatchStatus === 'PENDIENTE' && 'Pendiente de remisión'}
                          {alert.dispatchStatus === 'REMITIDA' && 'Remitida a Salud Pública'}
                          {alert.dispatchStatus === 'EN_INTERVENCION' && 'Equipo en intervención'}
                          {alert.dispatchStatus === 'RESUELTA' && 'Intervención resuelta'}
                        </span>
                      </span>

                      {alert.dispatchStatus === 'PENDIENTE' && (
                        <button
                          type="button"
                          onClick={() => onDispatchAlert(alert.id)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-rose-600 text-white hover:bg-rose-700 transition-colors cursor-pointer"
                        >
                          <Send className="w-3 h-3" />
                          Remitir a Salud Pública
                        </button>
                      )}
                      {alert.dispatchStatus === 'REMITIDA' && (
                        <button
                          type="button"
                          onClick={() => onAdvanceAlertStatus(alert.id, 'EN_INTERVENCION')}
                          className="px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
                        >
                          Marcar en intervención
                        </button>
                      )}
                      {alert.dispatchStatus === 'EN_INTERVENCION' && (
                        <button
                          type="button"
                          onClick={() => onAdvanceAlertStatus(alert.id, 'RESUELTA')}
                          className="px-2.5 py-1 text-xs font-medium rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer"
                        >
                          Confirmar resolución
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3-Minute Sampling Log Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            Bitácora de Muestreo cada 3 minutos
          </h3>
          <span className="text-xs font-mono text-slate-500">
            Fórmula KPI: L = (Peso_Bruto_g − Tara_g) / 1000
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-mono uppercase text-slate-500">
                <th className="py-2.5 px-4">Tiempo</th>
                <th className="py-2.5 px-4">Calidad (ICA)</th>
                <th className="py-2.5 px-4">Peso Celda</th>
                <th className="py-2.5 px-4">Cantidad (KPI)</th>
                <th className="py-2.5 px-4">pH</th>
                <th className="py-2.5 px-4">Turbidez</th>
                <th className="py-2.5 px-4">Temp</th>
                <th className="py-2.5 px-4">Cloro</th>
                <th className="py-2.5 px-4">Estado ESP32</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-mono tabular-nums">
              {[...samples].reverse().slice(0, 8).map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/80">
                  <td className="py-2.5 px-4 font-semibold text-slate-900">{s.timeLabel}</td>
                  <td className="py-2.5 px-4">{s.qualityScore} / 100</td>
                  <td className="py-2.5 px-4">{s.loadCellGrossGrams} g</td>
                  <td className="py-2.5 px-4 font-semibold text-sky-700">{s.estimatedLiters.toFixed(3)} L</td>
                  <td className="py-2.5 px-4">{s.ph.toFixed(2)}</td>
                  <td className="py-2.5 px-4">{s.turbidityNtu.toFixed(1)} NTU</td>
                  <td className="py-2.5 px-4">{s.temperatureC.toFixed(1)} °C</td>
                  <td className="py-2.5 px-4">{s.residualChlorineMgL.toFixed(2)} mg/L</td>
                  <td
                    className={`py-2.5 px-4 font-sans font-semibold ${
                      s.potabilityStatus === 'APTA'
                        ? 'text-emerald-700'
                        : s.potabilityStatus === 'NO_APTA'
                        ? 'text-amber-700'
                        : 'text-rose-700'
                    }`}
                  >
                    {s.potabilityStatus === 'APTA'
                      ? 'Apta (LED Verde)'
                      : s.potabilityStatus === 'NO_APTA'
                      ? 'No apta (LED Rojo)'
                      : 'Crítica · Alerta'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
