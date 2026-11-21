import {
  FilterLayerInfo,
  PotabilityStatus,
  SensorTelemetry,
  SimulationParams,
  SimulationPresetId,
} from '../types/filtration';

export const SEVEN_FILTER_LAYERS: FilterLayerInfo[] = [
  {
    id: 1,
    name: '1. Tela delgada (superior)',
    material: 'Malla textil microperforada',
    retentionEfficiency: 0.24,
    role: 'Retiene sólidos suspendidos gruesos, hojas e insectos al ingreso del agua cruda.',
    color: '#F1F5F9',
    accentColor: '#94A3B8',
  },
  {
    id: 2,
    name: '2. Arena fina',
    material: 'Sílice lavada (0.15 – 0.35 mm)',
    retentionEfficiency: 0.42,
    role: 'Captura limos finos, quistes y micropartículas por tamizado mecánico.',
    color: '#EBD9B4',
    accentColor: '#C5A875',
  },
  {
    id: 3,
    name: '3. Arena gruesa',
    material: 'Grano silíceo medio (0.6 – 1.2 mm)',
    retentionEfficiency: 0.28,
    role: 'Estabiliza el lecho de arena fina y filtra sedimentos intermedios.',
    color: '#D7B98E',
    accentColor: '#A98756',
  },
  {
    id: 4,
    name: '4. Tela delgada (intermedia)',
    material: 'Separador textil poroso',
    retentionEfficiency: 0.16,
    role: 'Evita que la arena migre hacia el lecho de grava y distribuye el flujo uniforme.',
    color: '#E2E8F0',
    accentColor: '#64748B',
  },
  {
    id: 5,
    name: '5. Grava fina',
    material: 'Piedrilla lavada (3 – 6 mm)',
    retentionEfficiency: 0.18,
    role: 'Capa de transición hidráulica que reduce la velocidad de percolación.',
    color: '#94A3B8',
    accentColor: '#64748B',
  },
  {
    id: 6,
    name: '6. Grava gruesa',
    material: 'Cantos calibrados (8 – 16 mm)',
    retentionEfficiency: 0.12,
    role: 'Soporte estructural inferior que facilita el drenaje hacia la manguera de salida.',
    color: '#64748B',
    accentColor: '#475569',
  },
  {
    id: 7,
    name: '7. Carbón activo',
    material: 'Carbón granular activado',
    retentionEfficiency: 0.38,
    role: 'Adsorción química de compuestos orgánicos, olores, colorantes y trazas tóxicas.',
    color: '#1E293B',
    accentColor: '#0F172A',
  },
];

export const SIMULATION_PRESETS: Record<
  SimulationPresetId,
  { label: string; description: string; params: Partial<SimulationParams> }
> = {
  normal: {
    label: 'Operación Nominal',
    description: 'Agua cruda estándar con dosificación óptima de cloro por venoclisis.',
    params: {
      rawTurbidityNtu: 28,
      rawPh: 7.0,
      ambientTempC: 22.4,
      chlorineDripRate: 14,
      filterSaturationPct: 12,
    },
  },
  high_turbidity: {
    label: 'Turbidez Crítica (Lluvia)',
    description: 'Escorrentía intensa que satura las 7 capas y supera 10 NTU en la salida.',
    params: {
      rawTurbidityNtu: 112,
      rawPh: 6.7,
      ambientTempC: 24.1,
      chlorineDripRate: 12,
      filterSaturationPct: 74,
    },
  },
  acid_contamination: {
    label: 'Desbalance Ácido (pH Bajo)',
    description: 'Ingreso de agua con acidez extrema fuera de la banda 6.5–8.5 pH.',
    params: {
      rawTurbidityNtu: 36,
      rawPh: 4.5,
      ambientTempC: 25.8,
      chlorineDripRate: 14,
      filterSaturationPct: 22,
    },
  },
  no_chlorine: {
    label: 'Venoclisis Cerrado (Sin Cloro)',
    description: 'El filtro clarifica físicamente el agua, pero falta desinfección química.',
    params: {
      rawTurbidityNtu: 26,
      rawPh: 7.1,
      ambientTempC: 23.0,
      chlorineDripRate: 0,
      filterSaturationPct: 10,
    },
  },
};

export function formatSimMinutes(totalMinutes: number): string {
  const hrs = Math.floor(totalMinutes / 60);
  const mins = Math.floor(totalMinutes % 60);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function computeTelemetry(
  params: SimulationParams,
  jitterSeed = 0
): SensorTelemetry {
  // Subtle micro-jitter to mimic real ADC readings from ESP32 without destabilizing values
  const microA = Math.sin(jitterSeed * 1.7) * 0.04;
  const microB = Math.cos(jitterSeed * 2.3) * 0.08;
  const microC = Math.sin(jitterSeed * 0.9) * 0.12;

  // 7-layer physical reduction of turbidity (diminishes as filterSaturationPct rises)
  const effectiveFilterFactor = Math.max(0.18, 1 - (params.filterSaturationPct / 100) * 0.82);
  const turbidityRetention = 0.94 * effectiveFilterFactor;
  const filteredTurbidity = Math.max(
    0.4,
    Number((params.rawTurbidityNtu * (1 - turbidityRetention) + Math.abs(microB)).toFixed(2))
  );

  // Activated carbon & sand buffer pH mildly toward neutral (~7.1), chlorine shifts slightly upward
  const chlorineMgL = Number(((params.chlorineDripRate / 14) * 1.2 + Math.max(0, microA * 0.5)).toFixed(2));
  const phNeutralPull = (7.1 - params.rawPh) * (0.28 * effectiveFilterFactor);
  const chlorinePhShift = chlorineMgL * 0.08;
  const filteredPh = Number(
    Math.min(10.5, Math.max(3.5, params.rawPh + phNeutralPull + chlorinePhShift + microA)).toFixed(2)
  );

  // Temperature measured by submerged DS18B20 probe
  const temperatureC = Number((params.ambientTempC + microC).toFixed(1));

  // Flow rate through hose (mL/min) decreases with filter saturation
  const flowRateMlMin = Number((85 * (1 - (params.filterSaturationPct / 100) * 0.65)).toFixed(1));

  // Load Cell HX711 math: water density ~ 1000 g/L (slight thermal correction around 20°C)
  const waterDensityGPerL = 1000 - Math.max(0, temperatureC - 20) * 0.25;
  const netGrams = Math.round(params.waterVolumeLiters * waterDensityGPerL);
  const grossGrams = Math.round(params.bottleTareGrams + netGrams);
  // KPI formula directly from load cell gross & tare weight: (Gross - Tare) / 1000
  const estimatedLiters = Number(((grossGrams - params.bottleTareGrams) / 1000).toFixed(3));

  // Quality Index (ICA 0 - 100)
  let score = 100;
  const reasons: string[] = [];

  if (filteredTurbidity > 10) {
    score -= Math.min(48, (filteredTurbidity - 5) * 2.1);
    reasons.push(`Turbidez crítica (${filteredTurbidity.toFixed(1)} NTU > 5.0 NTU)`);
  } else if (filteredTurbidity > 5) {
    score -= (filteredTurbidity - 5) * 4.2;
    reasons.push(`Turbidez elevada (${filteredTurbidity.toFixed(1)} NTU > 5.0 NTU)`);
  } else if (filteredTurbidity > 2) {
    score -= (filteredTurbidity - 2) * 2.5;
  }

  if (filteredPh < 6.5 || filteredPh > 8.5) {
    const dist = filteredPh < 6.5 ? 6.5 - filteredPh : filteredPh - 8.5;
    score -= Math.min(42, dist * 20);
    reasons.push(`pH fuera de rango potable (${filteredPh.toFixed(2)} vs 6.5–8.5)`);
  }

  if (chlorineMgL < 0.2) {
    score -= 24;
    reasons.push(`Cloro residual insuficiente (${chlorineMgL.toFixed(2)} mg/L < 0.20 mg/L)`);
  } else if (chlorineMgL > 4.0) {
    score -= 22;
    reasons.push(`Exceso de cloro libre (${chlorineMgL.toFixed(2)} mg/L > 4.00 mg/L)`);
  }

  if (temperatureC > 32 || temperatureC < 8) {
    score -= 10;
    reasons.push(`Temperatura térmica anómala (${temperatureC.toFixed(1)} °C)`);
  }

  const qualityScore = Math.max(0, Math.min(100, Math.round(score)));

  let potabilityStatus: PotabilityStatus = 'APTA';
  if (qualityScore < 50 || filteredTurbidity > 10 || filteredPh < 5.8 || filteredPh > 9.2) {
    potabilityStatus = 'CRITICA';
  } else if (reasons.length > 0 || qualityScore < 75) {
    potabilityStatus = 'NO_APTA';
  }

  const greenLedOn = potabilityStatus === 'APTA';
  const redLedOn = !greenLedOn;

  if (greenLedOn && reasons.length === 0) {
    reasons.push('Parámetros dentro de norma OMS/RAS para consumo humano.');
  }

  return {
    temperatureC,
    ph: filteredPh,
    turbidityNtu: filteredTurbidity,
    residualChlorineMgL: chlorineMgL,
    loadCellGrossGrams: grossGrams,
    loadCellNetGrams: netGrams,
    estimatedLiters,
    flowRateMlMin,
    qualityScore,
    potabilityStatus,
    greenLedOn,
    redLedOn,
    diagnosticReasons: reasons,
  };
}
