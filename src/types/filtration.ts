export type PotabilityStatus = 'APTA' | 'NO_APTA' | 'CRITICA';

export type SimulationPresetId =
  | 'normal'
  | 'high_turbidity'
  | 'acid_contamination'
  | 'no_chlorine';

export interface FilterLayerInfo {
  id: number;
  name: string;
  material: string;
  retentionEfficiency: number; // 0-1
  role: string;
  color: string;
  accentColor: string;
}

export interface SimulationParams {
  rawTurbidityNtu: number; // 5 - 120 NTU
  rawPh: number; // 4.0 - 9.8
  ambientTempC: number; // 8 - 40 °C
  chlorineDripRate: number; // 0 - 40 gotas/min
  bottleTareGrams: number; // default 120g
  waterVolumeLiters: number; // 0.1 - 5.0 L
  filterSaturationPct: number; // 0 - 100 %
  flowSpeedMultiplier: number; // 1x, 10x, 60x
}

export interface SensorTelemetry {
  temperatureC: number;
  ph: number;
  turbidityNtu: number;
  residualChlorineMgL: number;
  loadCellGrossGrams: number;
  loadCellNetGrams: number;
  estimatedLiters: number;
  flowRateMlMin: number;
  qualityScore: number; // 0 - 100 ICA
  potabilityStatus: PotabilityStatus;
  greenLedOn: boolean;
  redLedOn: boolean;
  diagnosticReasons: string[];
}

export interface TelemetrySample {
  id: string;
  sampleIndex: number;
  simMinute: number; // 0, 3, 6, 9, ...
  timeLabel: string; // e.g. "00:03"
  qualityScore: number;
  estimatedLiters: number;
  loadCellGrossGrams: number;
  ph: number;
  turbidityNtu: number;
  temperatureC: number;
  residualChlorineMgL: number;
  potabilityStatus: PotabilityStatus;
  alertGenerated: boolean;
}

export type AlertDispatchStatus = 'PENDIENTE' | 'REMITIDA' | 'EN_INTERVENCION' | 'RESUELTA';

export interface PublicHealthAlert {
  id: string;
  createdAtLabel: string;
  simMinute: number;
  stationId: string;
  severity: 'ALTA' | 'CRITICA';
  qualityScore: number;
  ph: number;
  turbidityNtu: number;
  temperatureC: number;
  estimatedLiters: number;
  residualChlorineMgL: number;
  causes: string[];
  dispatchStatus: AlertDispatchStatus;
  dispatchedAt?: string;
  assignedUnit?: string;
}
