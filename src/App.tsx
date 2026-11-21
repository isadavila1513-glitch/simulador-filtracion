import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiltrationCanvas } from './components/FiltrationCanvas';
import { ControlDeck } from './components/ControlDeck';
import { TelemetryDashboard } from './components/TelemetryDashboard';
import { VideoStudio } from './components/VideoStudio';
import {
  AlertDispatchStatus,
  PublicHealthAlert,
  SimulationParams,
  SimulationPresetId,
  TelemetrySample,
} from './types/filtration';
import {
  computeTelemetry,
  formatSimMinutes,
  SIMULATION_PRESETS,
} from './utils/waterPhysics';

const DEFAULT_PARAMS: SimulationParams = {
  rawTurbidityNtu: 28,
  rawPh: 7.0,
  ambientTempC: 22.4,
  chlorineDripRate: 14,
  bottleTareGrams: 120,
  waterVolumeLiters: 1.45,
  filterSaturationPct: 12,
  flowSpeedMultiplier: 10,
};

function buildInitialSamples(initialParams: SimulationParams): TelemetrySample[] {
  const baseTimes = [0, 3, 6, 9, 12];
  return baseTimes.map((min, idx) => {
    const vol = Number((0.45 + idx * 0.25).toFixed(3));
    const t = computeTelemetry({ ...initialParams, waterVolumeLiters: vol }, idx * 0.4);
    return {
      id: `init-${min}`,
      sampleIndex: idx + 1,
      simMinute: min,
      timeLabel: formatSimMinutes(min),
      qualityScore: t.qualityScore,
      estimatedLiters: t.estimatedLiters,
      loadCellGrossGrams: t.loadCellGrossGrams,
      ph: t.ph,
      turbidityNtu: t.turbidityNtu,
      temperatureC: t.temperatureC,
      residualChlorineMgL: t.residualChlorineMgL,
      potabilityStatus: t.potabilityStatus,
      alertGenerated: t.potabilityStatus === 'CRITICA',
    };
  });
}

export default function App() {
  const [params, setParams] = useState<SimulationParams>(DEFAULT_PARAMS);
  const [activePreset, setActivePreset] = useState<SimulationPresetId | null>('normal');
  const [isPlaying, setIsPlaying] = useState(true);
  const [jitterSeed, setJitterSeed] = useState(0);

  // Simulation time in minutes (starts at 12 min matching initial 5 samples)
  const [simSeconds, setSimSeconds] = useState(12 * 60);
  const [samples, setSamples] = useState<TelemetrySample[]>(() =>
    buildInitialSamples(DEFAULT_PARAMS)
  );
  const [alerts, setAlerts] = useState<PublicHealthAlert[]>([]);
  const [autoDispatchHealth, setAutoDispatchHealth] = useState(false);

  const [capturedFrameDataUrl, setCapturedFrameDataUrl] = useState<string | null>(null);

  const telemetry = useMemo(
    () => computeTelemetry(params, jitterSeed),
    [params, jitterSeed]
  );

  // Keep refs for 1s tick interval without resetting timers
  const latestRef = useRef({
    params,
    telemetry,
    samples,
    autoDispatchHealth,
    simSeconds,
  });
  latestRef.current = {
    params,
    telemetry,
    samples,
    autoDispatchHealth,
    simSeconds,
  };

  const recordThreeMinuteSample = useCallback((forcedMinute?: number) => {
    const {
      telemetry: tel,
      samples: curSamples,
      autoDispatchHealth: autoDispatch,
      simSeconds: curSec,
    } = latestRef.current;

    const lastMin = curSamples[curSamples.length - 1]?.simMinute ?? 0;
    const nextMin = forcedMinute ?? Math.max(lastMin + 3, Math.floor(curSec / 60));
    const isCritical = tel.potabilityStatus === 'CRITICA' || tel.qualityScore < 50;

    const newSample: TelemetrySample = {
      id: `sample-${Date.now()}-${curSamples.length + 1}`,
      sampleIndex: curSamples.length + 1,
      simMinute: nextMin,
      timeLabel: formatSimMinutes(nextMin),
      qualityScore: tel.qualityScore,
      estimatedLiters: tel.estimatedLiters,
      loadCellGrossGrams: tel.loadCellGrossGrams,
      ph: tel.ph,
      turbidityNtu: tel.turbidityNtu,
      temperatureC: tel.temperatureC,
      residualChlorineMgL: tel.residualChlorineMgL,
      potabilityStatus: tel.potabilityStatus,
      alertGenerated: isCritical,
    };

    setSamples((prev) => [...prev, newSample]);

    if (isCritical) {
      const alertId = `ALR-${String(Math.floor(1000 + Math.random() * 9000))}`;
      const newAlert: PublicHealthAlert = {
        id: alertId,
        createdAtLabel: `T+${formatSimMinutes(nextMin)}`,
        simMinute: nextMin,
        stationId: 'EST-ESP32-01',
        severity: tel.qualityScore < 35 ? 'CRITICA' : 'ALTA',
        qualityScore: tel.qualityScore,
        ph: tel.ph,
        turbidityNtu: tel.turbidityNtu,
        temperatureC: tel.temperatureC,
        estimatedLiters: tel.estimatedLiters,
        residualChlorineMgL: tel.residualChlorineMgL,
        causes: tel.diagnosticReasons,
        dispatchStatus: autoDispatch ? 'REMITIDA' : 'PENDIENTE',
        dispatchedAt: autoDispatch ? new Date().toLocaleTimeString('es-CO') : undefined,
        assignedUnit: autoDispatch ? 'Equipo Vigilancia Salud Pública' : undefined,
      };
      setAlerts((prev) => [newAlert, ...prev]);
    }
  }, []);

  // Main simulation clock tick (500ms real-time interval)
  useEffect(() => {
    if (!isPlaying) return;

    const timer = setInterval(() => {
      setJitterSeed((s) => s + 0.35);

      const speed = latestRef.current.params.flowSpeedMultiplier;
      const deltaSimSeconds = 0.5 * speed;

      setSimSeconds((prevSec) => {
        const nextSec = prevSec + deltaSimSeconds;
        const prevSlot = Math.floor(prevSec / 180);
        const nextSlot = Math.floor(nextSec / 180);
        if (nextSlot > prevSlot) {
          // Trigger 3-minute telemetry sample
          setTimeout(() => recordThreeMinuteSample(nextSlot * 3), 0);
        }
        return nextSec;
      });

      // Gentle accumulation of filtered water volume inside Bottle 2
      setParams((prev) => {
        const flowLitersPerSec = (latestRef.current.telemetry.flowRateMlMin / 1000) / 60;
        const addedLiters = flowLitersPerSec * deltaSimSeconds;
        const nextVol = Math.min(5.0, Number((prev.waterVolumeLiters + addedLiters).toFixed(4)));
        if (nextVol === prev.waterVolumeLiters) return prev;
        return { ...prev, waterVolumeLiters: nextVol };
      });
    }, 500);

    return () => clearInterval(timer);
  }, [isPlaying, recordThreeMinuteSample]);

  const handleSelectPreset = (presetId: SimulationPresetId) => {
    setActivePreset(presetId);
    const preset = SIMULATION_PRESETS[presetId];
    setParams((prev) => ({
      ...prev,
      ...preset.params,
    }));
  };

  const handleChangeParam = <K extends keyof SimulationParams>(
    key: K,
    value: SimulationParams[K]
  ) => {
    setActivePreset(null);
    setParams((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleReset = () => {
    setParams(DEFAULT_PARAMS);
    setActivePreset('normal');
    setSimSeconds(12 * 60);
    setSamples(buildInitialSamples(DEFAULT_PARAMS));
    setAlerts([]);
    setIsPlaying(true);
  };

  const handleSimulateThreeMinutes = () => {
    const nextMin = Math.floor(simSeconds / 180) * 3 + 3;
    setSimSeconds(nextMin * 60);
    recordThreeMinuteSample(nextMin);
  };

  const handleDispatchAlert = (alertId: string) => {
    setAlerts((prev) =>
      prev.map((a) =>
        a.id === alertId
          ? {
              ...a,
              dispatchStatus: 'REMITIDA',
              dispatchedAt: new Date().toLocaleTimeString('es-CO'),
              assignedUnit: 'Equipo Vigilancia Salud Pública',
            }
          : a
      )
    );
  };

  const handleAdvanceAlertStatus = (alertId: string, nextStatus: AlertDispatchStatus) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === alertId ? { ...a, dispatchStatus: nextStatus } : a))
    );
  };

  const handleCaptureFrame = (dataUrl: string) => {
    setCapturedFrameDataUrl(dataUrl);
    const el = document.getElementById('estudio-video');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const secondsUntilNextSample = Math.max(1, 180 - Math.floor(simSeconds % 180));

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-[1400px] mx-auto px-6 py-3.5 flex items-center justify-between gap-8">
          <a
            href="#simulacion"
            className="text-lg font-display font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            HidroLab IoT
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a
              href="#simulacion"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Simulación
            </a>
            <a
              href="#telemetria"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Telemetría 3 min
            </a>
            <a
              href="#salud-publica"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Salud Pública
            </a>
            <a
              href="#estudio-video"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Estudio de Video
            </a>
          </nav>

          <div className="shrink-0">
            <a
              href="#estudio-video"
              className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              Crear Video IA
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-8 space-y-10">
        {/* Hero / Header Section */}
        <section id="simulacion" className="space-y-6">
          <div className="max-w-3xl">
            <p className="text-xs font-mono text-slate-500">
              Botella 7 capas · Manguera · Venoclisis NaClO · Sensores ESP32 · Celda de Carga HX711
            </p>
            <h1 className="mt-2 text-2xl sm:text-3xl font-display font-bold tracking-tight text-slate-900 [text-wrap:balance]">
              Simulador de Filtrado de Agua, Telemetría IoT y Estudio de Video
            </h1>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Observa en tiempo real el paso del agua cruda por las 7 capas de filtración, la cloración controlada por venoclisis, los tres sensores conectados al ESP32 con indicadores LED verde/rojo, el cálculo de litros mediante celda de carga y la remisión de alertas a Salud Pública.
            </p>
          </div>

          {/* Two-Zone Sandbox Stage */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
            <div className="xl:col-span-8">
              <FiltrationCanvas
                params={params}
                telemetry={telemetry}
                samples={samples}
                isPlaying={isPlaying}
                onTogglePlay={() => setIsPlaying((p) => !p)}
                onReset={handleReset}
                onSpeedChange={(spd) => handleChangeParam('flowSpeedMultiplier', spd)}
                onCaptureFrame={handleCaptureFrame}
                simTimeMinutes={simSeconds / 60}
                secondsUntilNextSample={secondsUntilNextSample}
              />
            </div>

            <div className="xl:col-span-4">
              <ControlDeck
                params={params}
                activePreset={activePreset}
                telemetry={telemetry}
                onSelectPreset={handleSelectPreset}
                onChangeParam={handleChangeParam}
              />
            </div>
          </div>
        </section>

        {/* Telemetry Dashboard & Public Health Dispatch */}
        <section id="telemetria" className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <h2 className="text-xl font-display font-bold text-slate-900">
              Tablero de Control cada 3 minutos y Salud Pública
            </h2>
            <p className="text-xs font-mono text-slate-500">
              Conversión de masa a volumen · 1,000 g ≈ 1.000 L
            </p>
          </div>

          <TelemetryDashboard
            params={params}
            telemetry={telemetry}
            samples={samples}
            alerts={alerts}
            autoDispatchHealth={autoDispatchHealth}
            onToggleAutoDispatch={setAutoDispatchHealth}
            onSimulateThreeMinutes={handleSimulateThreeMinutes}
            onDispatchAlert={handleDispatchAlert}
            onAdvanceAlertStatus={handleAdvanceAlertStatus}
          />
        </section>

        {/* AI Video Studio (Photo Upload -> Gemini Omni Flash 16:9 / 9:16 Video) */}
        <section>
          <VideoStudio
            capturedFrameDataUrl={capturedFrameDataUrl}
            onClearCapturedFrame={() => setCapturedFrameDataUrl(null)}
          />
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-[1400px] mx-auto px-6 py-5 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span>HidroLab IoT · Simulación de Purificación y Monitoreo Comunitario</span>
          <span>Filtro de 7 capas · ESP32 · Celda de carga · Video IA</span>
        </div>
      </footer>
    </div>
  );
}
