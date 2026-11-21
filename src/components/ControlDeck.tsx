import React from 'react';
import { SimulationParams, SimulationPresetId, SensorTelemetry } from '../types/filtration';
import { SIMULATION_PRESETS } from '../utils/waterPhysics';

interface ControlDeckProps {
  params: SimulationParams;
  activePreset: SimulationPresetId | null;
  telemetry: SensorTelemetry;
  onSelectPreset: (presetId: SimulationPresetId) => void;
  onChangeParam: <K extends keyof SimulationParams>(key: K, value: SimulationParams[K]) => void;
}

export const ControlDeck: React.FC<ControlDeckProps> = ({
  params,
  activePreset,
  telemetry,
  onSelectPreset,
  onChangeParam,
}) => {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between h-full">
      <div className="space-y-5">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Parámetros del Sistema
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Ajusta las variables físicas, el goteo de cloro y la carga de la botella.
          </p>
        </div>

        {/* Scenario Presets */}
        <div>
          <span className="block text-xs font-medium text-slate-700 mb-2">
            Escenarios de prueba rápida
          </span>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(SIMULATION_PRESETS) as SimulationPresetId[]).map((key) => {
              const preset = SIMULATION_PRESETS[key];
              const isSelected = activePreset === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelectPreset(key)}
                  className={`px-3 py-2 text-left text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-sky-50 border-sky-300 text-sky-900'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="block truncate font-semibold">{preset.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Labeled Sliders */}
        <div className="space-y-4 pt-2 border-t border-slate-100">
          {/* Raw Turbidity */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <label htmlFor="slider-turbidity" className="font-medium text-slate-700">
                Turbidez agua cruda
              </label>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {params.rawTurbidityNtu} NTU
              </span>
            </div>
            <input
              id="slider-turbidity"
              type="range"
              min={5}
              max={120}
              step={1}
              value={params.rawTurbidityNtu}
              onChange={(e) => onChangeParam('rawTurbidityNtu', Number(e.target.value))}
              className="w-full accent-sky-600 cursor-pointer"
            />
          </div>

          {/* Raw pH */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <label htmlFor="slider-ph" className="font-medium text-slate-700">
                pH de entrada
              </label>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {params.rawPh.toFixed(1)} pH
              </span>
            </div>
            <input
              id="slider-ph"
              type="range"
              min={4.0}
              max={9.8}
              step={0.1}
              value={params.rawPh}
              onChange={(e) => onChangeParam('rawPh', Number(e.target.value))}
              className="w-full accent-sky-600 cursor-pointer"
            />
          </div>

          {/* Chlorine Drip Rate */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <label htmlFor="slider-cloro" className="font-medium text-slate-700">
                Venoclisis de cloro (NaClO)
              </label>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {params.chlorineDripRate} gotas/min
              </span>
            </div>
            <input
              id="slider-cloro"
              type="range"
              min={0}
              max={40}
              step={1}
              value={params.chlorineDripRate}
              onChange={(e) => onChangeParam('chlorineDripRate', Number(e.target.value))}
              className="w-full accent-sky-600 cursor-pointer"
            />
          </div>

          {/* Temperature */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <label htmlFor="slider-temp" className="font-medium text-slate-700">
                Temperatura del agua
              </label>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {params.ambientTempC.toFixed(1)} °C
              </span>
            </div>
            <input
              id="slider-temp"
              type="range"
              min={8}
              max={38}
              step={0.2}
              value={params.ambientTempC}
              onChange={(e) => onChangeParam('ambientTempC', Number(e.target.value))}
              className="w-full accent-sky-600 cursor-pointer"
            />
          </div>

          {/* Water Volume on Load Cell */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <label htmlFor="slider-volume" className="font-medium text-slate-700">
                Volumen en Botella 2 (Celda de carga)
              </label>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {params.waterVolumeLiters.toFixed(2)} L
              </span>
            </div>
            <input
              id="slider-volume"
              type="range"
              min={0.2}
              max={5.0}
              step={0.05}
              value={params.waterVolumeLiters}
              onChange={(e) => onChangeParam('waterVolumeLiters', Number(e.target.value))}
              className="w-full accent-sky-600 cursor-pointer"
            />
          </div>

          {/* Filter Saturation */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <label htmlFor="slider-sat" className="font-medium text-slate-700">
                Saturación del filtro (7 capas)
              </label>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {params.filterSaturationPct} %
              </span>
            </div>
            <input
              id="slider-sat"
              type="range"
              min={0}
              max={95}
              step={1}
              value={params.filterSaturationPct}
              onChange={(e) => onChangeParam('filterSaturationPct', Number(e.target.value))}
              className="w-full accent-sky-600 cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* ESP32 Diagnostic Summary */}
      <div className="mt-5 pt-4 border-t border-slate-200">
        <div className="flex items-center justify-between text-xs font-mono mb-1.5">
          <span className="text-slate-500 uppercase">Diagnóstico ESP32</span>
          <span
            className={`font-semibold ${
              telemetry.greenLedOn ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {telemetry.greenLedOn ? '● LED VERDE (APTA)' : '▲ LED ROJO (NO APTA)'}
          </span>
        </div>
        <ul className="space-y-1 text-xs text-slate-600">
          {telemetry.diagnosticReasons.map((r, i) => (
            <li key={i} className="leading-snug">
              · {r}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
