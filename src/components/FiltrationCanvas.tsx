import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Download,
  FastForward,
  Pause,
  Play,
  RotateCcw,
  Square,
  Video,
} from 'lucide-react';
import { SensorTelemetry, SimulationParams, TelemetrySample } from '../types/filtration';
import { SEVEN_FILTER_LAYERS } from '../utils/waterPhysics';

interface FiltrationCanvasProps {
  params: SimulationParams;
  telemetry: SensorTelemetry;
  samples: TelemetrySample[];
  isPlaying: boolean;
  onTogglePlay: () => void;
  onReset: () => void;
  onSpeedChange: (speed: number) => void;
  onCaptureFrame: (dataUrl: string) => void;
  simTimeMinutes: number;
  secondsUntilNextSample: number;
}

interface WaterParticle {
  t: number; // 0..1 progress through filter+hose
  xOffset: number;
  speed: number;
  radius: number;
}

interface ChlorineDrop {
  y: number; // 0..1 inside drip chamber & tube
  active: boolean;
}

const LOGICAL_W = 1080;
const LOGICAL_H = 540;

export const FiltrationCanvas: React.FC<FiltrationCanvasProps> = ({
  params,
  telemetry,
  samples,
  isPlaying,
  onTogglePlay,
  onReset,
  onSpeedChange,
  onCaptureFrame,
  simTimeMinutes,
  secondsUntilNextSample,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const [selectedLayerId, setSelectedLayerId] = useState<number>(7);
  const [captureFlash, setCaptureFlash] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);

  // Store latest props in refs so 60fps animation loop stays smooth without restarting
  const stateRef = useRef({
    params,
    telemetry,
    samples,
    isPlaying,
    selectedLayerId,
    simTimeMinutes,
  });
  stateRef.current = {
    params,
    telemetry,
    samples,
    isPlaying,
    selectedLayerId,
    simTimeMinutes,
  };

  const particlesRef = useRef<WaterParticle[]>(
    Array.from({ length: 42 }, (_, i) => ({
      t: i / 42,
      xOffset: Math.sin(i * 19.7) * 0.65,
      speed: 0.14 + (i % 5) * 0.015,
      radius: 2.2 + (i % 3) * 0.7,
    }))
  );

  const chlorineDropsRef = useRef<ChlorineDrop[]>(
    Array.from({ length: 5 }, (_, i) => ({
      y: i * 0.2,
      active: true,
    }))
  );

  useEffect(() => {
    return () => {
      if (recordedVideoUrl && recordedVideoUrl.startsWith('blob:')) {
        URL.revokeObjectURL(recordedVideoUrl);
      }
    };
  }, [recordedVideoUrl]);

  useEffect(() => {
    if (!isRecording) {
      setRecordingSeconds(0);
      return;
    }
    const timer = setInterval(() => {
      setRecordingSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isRecording]);

  const handleToggleRecordVideo = () => {
    if (isRecording) {
      recorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    setRecordingError(null);

    if (typeof canvas.captureStream !== 'function' || typeof MediaRecorder === 'undefined') {
      setRecordingError(
        'Tu navegador no soporta grabación directa desde canvas. Usa el Estudio de Video IA abajo para generar el MP4.'
      );
      return;
    }

    try {
      if (!isPlaying) {
        onTogglePlay();
      }
      const stream = canvas.captureStream(30);
      const mimeTypes = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4',
      ];
      const supportedMime = mimeTypes.find((m) => MediaRecorder.isTypeSupported(m));
      const recorder = supportedMime
        ? new MediaRecorder(stream, { mimeType: supportedMime, videoBitsPerSecond: 3500000 })
        : new MediaRecorder(stream);

      recordedChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          recordedChunksRef.current.push(ev.data);
        }
      };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, {
          type: supportedMime || 'video/webm',
        });
        const url = URL.createObjectURL(blob);
        setRecordedVideoUrl((prev) => {
          if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
          return url;
        });
        setIsRecording(false);
      };

      recorderRef.current = recorder;
      recorder.start(250);
      setIsRecording(true);
    } catch {
      setRecordingError('No se pudo iniciar la grabación de video del lienzo.');
      setIsRecording(false);
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * LOGICAL_W;
    const y = ((e.clientY - rect.top) / rect.height) * LOGICAL_H;

    if (x >= 70 && x <= 355 && y >= 120 && y <= 365) {
      const layerHeight = (365 - 120) / 7;
      const idx = Math.min(6, Math.max(0, Math.floor((y - 120) / layerHeight)));
      setSelectedLayerId(idx + 1);
    }
  };

  const handleCapture = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    setCaptureFlash(true);
    setTimeout(() => setCaptureFlash(false), 260);
    onCaptureFrame(dataUrl);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let lastTime = performance.now();
    let elapsedAnim = 0;

    const drawRoundRect = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
    };

    const render = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const {
        params: p,
        telemetry: tel,
        samples: samps,
        isPlaying: playing,
        selectedLayerId: activeLayer,
        simTimeMinutes: curMin,
      } = stateRef.current;

      const visualSpeedFactor =
        p.flowSpeedMultiplier >= 60 ? 2.4 : p.flowSpeedMultiplier >= 10 ? 1.55 : 1.0;

      if (playing) {
        elapsedAnim += dt * visualSpeedFactor;

        const flowScale = (tel.flowRateMlMin / 85) * visualSpeedFactor;
        for (const pt of particlesRef.current) {
          pt.t += dt * pt.speed * Math.max(0.25, flowScale);
          if (pt.t > 1) {
            pt.t -= 1;
          }
        }

        const dripScale = (p.chlorineDripRate / 14) * visualSpeedFactor;
        for (const drop of chlorineDropsRef.current) {
          if (p.chlorineDripRate > 0) {
            drop.y += dt * 0.42 * dripScale;
            if (drop.y > 1) drop.y -= 1;
          }
        }
      }

      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== LOGICAL_W * dpr || canvas.height !== LOGICAL_H * dpr) {
        canvas.width = LOGICAL_W * dpr;
        canvas.height = LOGICAL_H * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      // 1. Clean laboratory backdrop with subtle engineering grid
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

      ctx.strokeStyle = '#F1F5F9';
      ctx.lineWidth = 1;
      for (let gx = 20; gx < LOGICAL_W; gx += 28) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, LOGICAL_H);
        ctx.stroke();
      }
      for (let gy = 20; gy < LOGICAL_H; gy += 28) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(LOGICAL_W, gy);
        ctx.stroke();
      }

      // Section headers inside schematic
      ctx.fillStyle = '#475569';
      ctx.font = '600 11px "IBM Plex Mono", monospace';
      ctx.fillText('ETAPA 1 · BOTELLA FILTRO (7 CAPAS)', 160, 32);
      ctx.fillText('VENOCLISIS · CLORO (NaClO)', 432, 32);
      ctx.fillText('ETAPA 2 · AGUA PURIFICADA + CELDA DE CARGA', 515, 198);
      ctx.fillText('MICROCONTROLADOR ESP32 + LEDs', 822, 134);

      // ================================================================
      // MINI TABLERO DE CONTROL CADA 3 MIN (TOP-RIGHT OF CANVAS)
      // ================================================================
      const hudX = 768;
      const hudY = 16;
      const hudW = 292;
      const hudH = 98;
      drawRoundRect(hudX, hudY, hudW, hudH, 8);
      ctx.fillStyle = '#F8FAFC';
      ctx.fill();
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.fillStyle = '#0F172A';
      ctx.font = '600 10px "IBM Plex Mono", monospace';
      ctx.fillText(`TABLERO 3 MIN · T+${Math.floor(curMin)}m`, hudX + 12, hudY + 18);

      ctx.fillStyle = '#0284C7';
      ctx.font = '600 11px "IBM Plex Mono", monospace';
      ctx.fillText(`ICA: ${tel.qualityScore}/100`, hudX + 12, hudY + 36);
      ctx.fillStyle = '#059669';
      ctx.fillText(`Vol: ${tel.estimatedLiters.toFixed(2)} L`, hudX + 120, hudY + 36);
      ctx.fillStyle = '#475569';
      ctx.fillText(`${tel.loadCellGrossGrams} g`, hudX + 225, hudY + 36);

      // Mini sparkline of last samples inside canvas HUD
      const recent = samps.slice(-8);
      if (recent.length > 1) {
        const spX = hudX + 12;
        const spY = hudY + 46;
        const spW = hudW - 24;
        const spH = 40;
        ctx.strokeStyle = '#E2E8F0';
        ctx.lineWidth = 1;
        ctx.strokeRect(spX, spY, spW, spH);

        ctx.beginPath();
        recent.forEach((s, idx) => {
          const px = spX + (idx / (recent.length - 1)) * spW;
          const py = spY + (1 - s.qualityScore / 100) * spH;
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.strokeStyle = '#0284C7';
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }

      // ================================================================
      // BOTTLE 1: 7-LAYER INVERTED FILTER BOTTLE
      // ================================================================
      const b1X = 185;
      const b1W = 160;
      const b1TopY = 58;
      const layersTopY = 120;
      const layersBotY = 365;
      const layerH = (layersBotY - layersTopY) / 7;

      const rawTurbNorm = Math.min(1, p.rawTurbidityNtu / 120);
      const rawR = Math.round(115 + rawTurbNorm * 50);
      const rawG = Math.round(145 - rawTurbNorm * 40);
      const rawB = Math.round(150 - rawTurbNorm * 85);
      const rawWaterColor = `rgba(${rawR}, ${rawG}, ${rawB}, 0.85)`;

      ctx.fillStyle = rawWaterColor;
      const streamW = 6 + Math.sin(elapsedAnim * 6) * 0.7;
      ctx.fillRect(b1X + b1W / 2 - streamW / 2, 42, streamW, 38);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(b1X, b1TopY);
      ctx.lineTo(b1X + b1W, b1TopY);
      ctx.lineTo(b1X + b1W, layersBotY);
      ctx.quadraticCurveTo(b1X + b1W, layersBotY + 34, b1X + b1W / 2 + 16, layersBotY + 42);
      ctx.lineTo(b1X + b1W / 2 + 16, layersBotY + 58);
      ctx.lineTo(b1X + b1W / 2 - 16, layersBotY + 58);
      ctx.lineTo(b1X + b1W / 2 - 16, layersBotY + 42);
      ctx.quadraticCurveTo(b1X, layersBotY + 34, b1X, layersBotY);
      ctx.closePath();
      ctx.clip();

      ctx.fillStyle = rawWaterColor;
      ctx.fillRect(b1X, 74, b1W, layersTopY - 74);

      ctx.beginPath();
      ctx.moveTo(b1X, 74);
      for (let wx = 0; wx <= b1W; wx += 8) {
        const wy = 74 + Math.sin(wx * 0.08 + elapsedAnim * 4) * 2.2;
        ctx.lineTo(b1X + wx, wy);
      }
      ctx.lineTo(b1X + b1W, layersTopY);
      ctx.lineTo(b1X, layersTopY);
      ctx.closePath();
      ctx.fillStyle = rawWaterColor;
      ctx.fill();

      SEVEN_FILTER_LAYERS.forEach((layer, idx) => {
        const ly = layersTopY + idx * layerH;
        ctx.fillStyle = layer.color;
        ctx.fillRect(b1X, ly, b1W, layerH);

        if (idx === 0 || idx === 3) {
          ctx.strokeStyle = layer.accentColor;
          ctx.lineWidth = 0.8;
          for (let tx = b1X + 4; tx < b1X + b1W; tx += 8) {
            ctx.beginPath();
            ctx.moveTo(tx, ly);
            ctx.lineTo(tx, ly + layerH);
            ctx.stroke();
          }
          for (let ty = ly + 5; ty < ly + layerH; ty += 6) {
            ctx.beginPath();
            ctx.moveTo(b1X, ty);
            ctx.lineTo(b1X + b1W, ty);
            ctx.stroke();
          }
        } else if (idx === 1 || idx === 2) {
          const step = idx === 1 ? 7 : 10;
          const rad = idx === 1 ? 1.1 : 1.9;
          ctx.fillStyle = layer.accentColor;
          for (let gy = ly + 4; gy < ly + layerH - 2; gy += step) {
            for (let gx = b1X + 5; gx < b1X + b1W - 4; gx += step) {
              const jitter = ((gx * 13 + gy * 7) % 5) - 2;
              ctx.beginPath();
              ctx.arc(gx + jitter, gy + (jitter % 2), rad, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        } else if (idx === 4 || idx === 5) {
          const step = idx === 4 ? 13 : 19;
          const rad = idx === 4 ? 3.5 : 5.6;
          ctx.fillStyle = layer.accentColor;
          for (let gy = ly + 6; gy < ly + layerH - 4; gy += step) {
            for (let gx = b1X + 8; gx < b1X + b1W - 8; gx += step) {
              const jx = ((gx * 7 + gy * 11) % 7) - 3;
              const jy = ((gx * 3 + gy * 5) % 5) - 2;
              ctx.beginPath();
              ctx.ellipse(gx + jx, gy + jy, rad, rad * 0.72, (gx % 3) * 0.5, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        } else if (idx === 6) {
          ctx.fillStyle = '#334155';
          for (let gy = ly + 5; gy < ly + layerH - 3; gy += 9) {
            for (let gx = b1X + 6; gx < b1X + b1W - 6; gx += 10) {
              const jx = ((gx * 17 + gy * 3) % 6) - 3;
              ctx.beginPath();
              ctx.arc(gx + jx, gy, 2.5, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }

        if (activeLayer === layer.id) {
          ctx.strokeStyle = '#0284C7';
          ctx.lineWidth = 2;
          ctx.strokeRect(b1X + 1, ly + 1, b1W - 2, layerH - 2);
        } else {
          ctx.strokeStyle = 'rgba(15, 23, 42, 0.14)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(b1X, ly + layerH);
          ctx.lineTo(b1X + b1W, ly + layerH);
          ctx.stroke();
        }
      });

      const cleanTurbNorm = Math.min(1, tel.turbidityNtu / 25);
      const cleanWaterColor = `rgba(${Math.round(14 + cleanTurbNorm * 130)}, ${Math.round(165 - cleanTurbNorm * 35)}, ${Math.round(233 - cleanTurbNorm * 110)}, 0.78)`;
      ctx.fillStyle = cleanWaterColor;
      ctx.fillRect(b1X, layersBotY, b1W, 60);

      for (const pt of particlesRef.current) {
        if (pt.t <= 0.55) {
          const frac = pt.t / 0.55;
          const py = 78 + frac * (layersBotY + 42 - 78);
          const px = b1X + b1W / 2 + pt.xOffset * (b1W * 0.38) * (1 - frac * 0.55);
          const r = Math.round(rawR + (14 - rawR) * frac);
          const g = Math.round(rawG + (165 - rawG) * frac);
          const b = Math.round(rawB + (233 - rawB) * frac);
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.92)`;
          ctx.beginPath();
          ctx.arc(px, py, pt.radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();

      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(b1X, b1TopY);
      ctx.lineTo(b1X + b1W, b1TopY);
      ctx.lineTo(b1X + b1W, layersBotY);
      ctx.quadraticCurveTo(b1X + b1W, layersBotY + 34, b1X + b1W / 2 + 16, layersBotY + 42);
      ctx.lineTo(b1X + b1W / 2 + 16, layersBotY + 58);
      ctx.lineTo(b1X + b1W / 2 - 16, layersBotY + 58);
      ctx.lineTo(b1X + b1W / 2 - 16, layersBotY + 42);
      ctx.quadraticCurveTo(b1X, layersBotY + 34, b1X, layersBotY);
      ctx.closePath();
      ctx.stroke();

      SEVEN_FILTER_LAYERS.forEach((layer, idx) => {
        const midY = layersTopY + idx * layerH + layerH / 2;
        const isSelected = activeLayer === layer.id;

        ctx.strokeStyle = isSelected ? '#0284C7' : '#CBD5E1';
        ctx.lineWidth = isSelected ? 1.8 : 1;
        ctx.beginPath();
        ctx.moveTo(156, midY);
        ctx.lineTo(b1X - 4, midY);
        ctx.stroke();

        ctx.fillStyle = isSelected ? '#0284C7' : '#334155';
        ctx.font = isSelected
          ? '600 11px "IBM Plex Sans", sans-serif'
          : '500 11px "IBM Plex Sans", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(layer.name, 150, midY + 4);
      });
      ctx.textAlign = 'left';

      // ================================================================
      // CONNECTING HOSE (MANGUERA) FROM BOTTLE 1 TO BOTTLE 2
      // ================================================================
      const hoseStart = { x: b1X + b1W / 2, y: layersBotY + 58 };
      const hoseCp1 = { x: b1X + b1W / 2, y: 495 };
      const hoseCp2 = { x: 430, y: 495 };
      const hoseMid = { x: 430, y: 315 };
      const hoseCp3 = { x: 430, y: 210 };
      const hoseCp4 = { x: 560, y: 210 };
      const hoseEnd = { x: 575, y: 248 };

      const drawHosePath = () => {
        ctx.beginPath();
        ctx.moveTo(hoseStart.x, hoseStart.y);
        ctx.bezierCurveTo(hoseCp1.x, hoseCp1.y, hoseCp2.x, hoseCp2.y, hoseMid.x, hoseMid.y);
        ctx.bezierCurveTo(hoseCp3.x, hoseCp3.y, hoseCp4.x, hoseCp4.y, hoseEnd.x, hoseEnd.y);
      };

      drawHosePath();
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 14;
      ctx.lineCap = 'round';
      ctx.stroke();

      drawHosePath();
      ctx.strokeStyle = cleanWaterColor;
      ctx.lineWidth = 8;
      ctx.stroke();

      const evalCubic = (
        p0: { x: number; y: number },
        p1: { x: number; y: number },
        p2: { x: number; y: number },
        p3: { x: number; y: number },
        t: number
      ) => {
        const u = 1 - t;
        return {
          x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
          y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
        };
      };

      for (const pt of particlesRef.current) {
        if (pt.t > 0.55) {
          const u = (pt.t - 0.55) / 0.45;
          const pos =
            u < 0.5
              ? evalCubic(hoseStart, hoseCp1, hoseCp2, hoseMid, u * 2)
              : evalCubic(hoseMid, hoseCp3, hoseCp4, hoseEnd, (u - 0.5) * 2);
          ctx.fillStyle = '#0284C7';
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.fillStyle = '#475569';
      ctx.font = '500 11px "IBM Plex Mono", monospace';
      ctx.fillText('Manguera de salida', 286, 488);

      // ================================================================
      // VENOCLISIS DE CLORO (IV DRIP SYSTEM)
      // ================================================================
      const ivX = 480;
      const ivY = 48;
      drawRoundRect(ivX - 28, ivY, 56, 74, 10);
      ctx.fillStyle = '#F0F9FF';
      ctx.fill();
      ctx.strokeStyle = '#64748B';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      drawRoundRect(ivX - 24, ivY + 22, 48, 48, 6);
      ctx.fillStyle = 'rgba(14, 165, 233, 0.25)';
      ctx.fill();

      ctx.fillStyle = '#0F172A';
      ctx.font = '600 9px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('NaClO', ivX, ivY + 46);
      ctx.fillText(`${p.chlorineDripRate} gts/m`, ivX, ivY + 59);
      ctx.textAlign = 'left';

      drawRoundRect(ivX - 8, ivY + 78, 16, 36, 4);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.strokeStyle = '#64748B';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(ivX, ivY + 114);
      ctx.bezierCurveTo(ivX, 200, 622, 185, 622, 248);
      ctx.strokeStyle = p.chlorineDripRate > 0 ? '#38BDF8' : '#CBD5E1';
      ctx.lineWidth = 3;
      ctx.stroke();

      drawRoundRect(ivX - 7, 178, 14, 22, 3);
      ctx.fillStyle = p.chlorineDripRate > 0 ? '#0284C7' : '#DC2626';
      ctx.fill();

      if (p.chlorineDripRate > 0) {
        for (const drop of chlorineDropsRef.current) {
          if (drop.y < 0.35) {
            const dy = ivY + 82 + (drop.y / 0.35) * 28;
            ctx.fillStyle = '#0284C7';
            ctx.beginPath();
            ctx.arc(ivX, dy, 2.4, 0, Math.PI * 2);
            ctx.fill();
          } else if (drop.y > 0.72) {
            const dy = 248 + ((drop.y - 0.72) / 0.28) * 58;
            ctx.fillStyle = '#0EA5E9';
            ctx.beginPath();
            ctx.arc(622, dy, 2.6, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // ================================================================
      // BOTTLE 2: PURIFIED WATER + 3 SUBMERGED SENSORS + LOAD CELL
      // ================================================================
      const b2X = 532;
      const b2W = 165;
      const b2TopY = 236;
      const b2BotY = 432;

      const fillFrac = Math.min(0.88, Math.max(0.14, p.waterVolumeLiters / 5.0));
      const waterTopY = b2BotY - fillFrac * (b2BotY - b2TopY - 22);

      ctx.save();
      drawRoundRect(b2X, b2TopY, b2W, b2BotY - b2TopY, 14);
      ctx.clip();

      ctx.beginPath();
      ctx.moveTo(b2X, waterTopY);
      for (let wx = 0; wx <= b2W; wx += 8) {
        const wy = waterTopY + Math.sin(wx * 0.06 + elapsedAnim * 3.5) * 2.0;
        ctx.lineTo(b2X + wx, wy);
      }
      ctx.lineTo(b2X + b2W, b2BotY);
      ctx.lineTo(b2X, b2BotY);
      ctx.closePath();
      ctx.fillStyle = cleanWaterColor;
      ctx.fill();

      ctx.restore();

      drawRoundRect(b2X + 32, b2TopY - 16, b2W - 64, 16, 4);
      ctx.fillStyle = '#F8FAFC';
      ctx.fill();
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 2;
      ctx.stroke();

      drawRoundRect(b2X, b2TopY, b2W, b2BotY - b2TopY, 14);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 2.2;
      ctx.stroke();

      const probes = [
        { x: b2X + 36, label: 'Temp', val: `${tel.temperatureC.toFixed(1)}°C`, color: '#D97706' },
        { x: b2X + 82, label: 'pH', val: `${tel.ph.toFixed(2)}`, color: '#0284C7' },
        { x: b2X + 128, label: 'NTU', val: `${tel.turbidityNtu.toFixed(1)}`, color: '#059669' },
      ];

      probes.forEach((probe, i) => {
        const probeBottom = b2BotY - 24;
        ctx.fillStyle = '#1E293B';
        ctx.fillRect(probe.x - 3, b2TopY - 6, 6, probeBottom - b2TopY + 6);
        ctx.fillStyle = probe.color;
        ctx.fillRect(probe.x - 4, probeBottom - 10, 8, 12);

        const targetPinY = 195 + i * 24;
        ctx.beginPath();
        ctx.moveTo(probe.x, b2TopY - 6);
        ctx.bezierCurveTo(probe.x, 155 + i * 16, 755, targetPinY, 822, targetPinY);
        ctx.strokeStyle = probe.color;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#0F172A';
        ctx.font = '600 10px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(probe.label, probe.x, b2TopY + 20);
        ctx.fillText(probe.val, probe.x, b2TopY + 33);
      });
      ctx.textAlign = 'left';

      // ================================================================
      // LOAD CELL PLATFORM (CELDA DE CARGA + HX711) UNDER BOTTLE 2
      // ================================================================
      const lcX = 508;
      const lcY = b2BotY + 2;
      const lcW = 214;
      const lcH = 54;

      drawRoundRect(lcX + 8, lcY, lcW - 16, 8, 3);
      ctx.fillStyle = '#94A3B8';
      ctx.fill();

      drawRoundRect(lcX, lcY + 10, lcW, lcH - 10, 8);
      ctx.fillStyle = '#0F172A';
      ctx.fill();
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      drawRoundRect(lcX + 12, lcY + 18, lcW - 24, 28, 4);
      ctx.fillStyle = '#064E3B';
      ctx.fill();

      ctx.fillStyle = '#6EE7B7';
      ctx.font = '600 11px "IBM Plex Mono", monospace';
      ctx.fillText(`PESO: ${tel.loadCellGrossGrams} g`, lcX + 20, lcY + 36);
      ctx.fillStyle = '#A7F3D0';
      ctx.textAlign = 'right';
      ctx.fillText(`${tel.estimatedLiters.toFixed(2)} L`, lcX + lcW - 20, lcY + 36);
      ctx.textAlign = 'left';

      ctx.beginPath();
      ctx.moveTo(lcX + lcW, lcY + 32);
      ctx.bezierCurveTo(775, lcY + 32, 775, 290, 822, 290);
      ctx.strokeStyle = '#64748B';
      ctx.lineWidth = 2.2;
      ctx.stroke();

      // ================================================================
      // ESP32 MICROCONTROLLER + GREEN / RED LEDs
      // ================================================================
      const espX = 822;
      const espY = 148;
      const espW = 218;
      const espH = 212;

      drawRoundRect(espX, espY, espW, espH, 10);
      ctx.fillStyle = '#1E293B';
      ctx.fill();
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 2;
      ctx.stroke();

      drawRoundRect(espX + 24, espY + 18, 86, 64, 4);
      ctx.fillStyle = '#CBD5E1';
      ctx.fill();
      ctx.fillStyle = '#1E293B';
      ctx.font = '600 10px "IBM Plex Mono", monospace';
      ctx.fillText('ESP32-WROOM', espX + 32, espY + 46);
      ctx.font = '500 9px "IBM Plex Mono", monospace';
      ctx.fillText('Wi-Fi · ADC', espX + 36, espY + 62);

      const pinLabels = ['GPIO4 Temp', 'GPIO34 pH', 'GPIO35 NTU', 'HX711 Peso'];
      pinLabels.forEach((lbl, idx) => {
        const py = 195 + idx * 24 + (idx === 3 ? 23 : 0);
        ctx.fillStyle = '#F59E0B';
        ctx.beginPath();
        ctx.arc(espX + 6, py, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#94A3B8';
        ctx.font = '500 9px "IBM Plex Mono", monospace';
        ctx.fillText(lbl, espX + 14, py + 3);
      });

      drawRoundRect(espX + 122, espY + 18, 82, 64, 5);
      ctx.fillStyle = '#020617';
      ctx.fill();
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#38BDF8';
      ctx.font = '600 10px "IBM Plex Mono", monospace';
      ctx.fillText(`ICA: ${tel.qualityScore}%`, espX + 130, espY + 38);
      ctx.fillStyle = tel.greenLedOn ? '#34D399' : '#FB7185';
      ctx.fillText(tel.greenLedOn ? 'AGUA APTA' : 'NO APTA', espX + 130, espY + 54);
      ctx.fillStyle = '#94A3B8';
      ctx.fillText(`${tel.estimatedLiters.toFixed(2)} L`, espX + 130, espY + 70);

      const greenCx = espX + 146;
      const redCx = espX + 146;
      const greenCy = espY + 124;
      const redCy = espY + 170;

      if (tel.greenLedOn) {
        const grad = ctx.createRadialGradient(greenCx, greenCy, 2, greenCx, greenCy, 24);
        grad.addColorStop(0, 'rgba(16, 185, 129, 0.9)');
        grad.addColorStop(1, 'rgba(16, 185, 129, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(greenCx, greenCy, 24, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = tel.greenLedOn ? '#10B981' : '#064E3B';
      ctx.beginPath();
      ctx.arc(greenCx, greenCy, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#6EE7B7';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = tel.greenLedOn ? '#6EE7B7' : '#64748B';
      ctx.font = '600 10px "IBM Plex Mono", monospace';
      ctx.fillText('LED VERDE', greenCx + 16, greenCy - 1);
      ctx.font = '500 9px "IBM Plex Sans", sans-serif';
      ctx.fillText(tel.greenLedOn ? 'Apta p/ ingesta' : 'Inactivo', greenCx + 16, greenCy + 11);

      if (tel.redLedOn) {
        const grad = ctx.createRadialGradient(redCx, redCy, 2, redCx, redCy, 24);
        grad.addColorStop(0, 'rgba(239, 68, 68, 0.92)');
        grad.addColorStop(1, 'rgba(239, 68, 68, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(redCx, redCy, 24, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = tel.redLedOn ? '#EF4444' : '#450A0A';
      ctx.beginPath();
      ctx.arc(redCx, redCy, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FCA5A5';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = tel.redLedOn ? '#FCA5A5' : '#64748B';
      ctx.font = '600 10px "IBM Plex Mono", monospace';
      ctx.fillText('LED ROJO', redCx + 16, redCy - 1);
      ctx.font = '500 9px "IBM Plex Sans", sans-serif';
      ctx.fillText(tel.redLedOn ? 'No apta · Alerta' : 'Inactivo', redCx + 16, redCy + 11);

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  const activeLayer =
    SEVEN_FILTER_LAYERS.find((l) => l.id === selectedLayerId) ?? SEVEN_FILTER_LAYERS[0];

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between h-full">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-200 bg-slate-50/70">
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onTogglePlay}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-sky-600 text-white hover:bg-sky-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {isPlaying ? 'Pausar' : 'Reproducir'}
          </button>

          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reiniciar
          </button>

          <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
            {[1, 10, 60].map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => onSpeedChange(spd)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  params.flowSpeedMultiplier === spd
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {spd > 1 && <FastForward className="w-3 h-3" />}
                {spd}x
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="text-xs font-mono tabular-nums text-slate-600 whitespace-nowrap">
            <span className="font-semibold text-slate-900">{Math.floor(simTimeMinutes)} min</span>
            <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
            Corte 3m: <span className="font-semibold text-sky-700">{secondsUntilNextSample}s</span>
          </div>

          <button
            type="button"
            onClick={handleToggleRecordVideo}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              isRecording
                ? 'bg-rose-600 border-rose-600 text-white hover:bg-rose-700'
                : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
            }`}
          >
            {isRecording ? <Square className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
            {isRecording ? `Detener (${recordingSeconds}s)` : 'Grabar video'}
          </button>

          <button
            type="button"
            onClick={handleCapture}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5" />
            Enviar a Video IA
          </button>
        </div>
      </div>

      {/* Interactive Canvas */}
      <div className="relative bg-white">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className="w-full h-auto block cursor-crosshair select-none"
          style={{ aspectRatio: `${LOGICAL_W} / ${LOGICAL_H}` }}
        />
        {captureFlash && (
          <div className="absolute inset-0 bg-sky-500/20 pointer-events-none transition-opacity" />
        )}
      </div>

      {/* Recorded Simulation Video Preview Bar (appears when user records directly from canvas) */}
      {(recordedVideoUrl || recordingError) && (
        <div className="px-5 py-4 border-t border-slate-200 bg-slate-950 text-white">
          {recordingError ? (
            <p className="text-xs text-rose-300">{recordingError}</p>
          ) : (
            recordedVideoUrl && (
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <video
                  src={recordedVideoUrl}
                  controls
                  playsInline
                  loop
                  className="w-full sm:w-72 rounded-lg border border-slate-800 bg-black aspect-video"
                />
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-semibold text-white">
                    Video de la simulación grabado correctamente
                  </p>
                  <p className="text-xs text-slate-400">
                    Incluye las 7 capas, manguera, venoclisis de cloro, sensores ESP32, LEDs, celda de carga y tablero cada 3 minutos.
                  </p>
                  <a
                    href={recordedVideoUrl}
                    download="simulacion_filtracion_7_capas.webm"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-sky-600 text-white hover:bg-sky-700 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Descargar video de simulación
                  </a>
                </div>
              </div>
            )
          )}
        </div>
      )}

      {/* Layer Inspector Footer Strip */}
      <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-slate-900">{activeLayer.name}</span>
          <span className="text-slate-300" aria-hidden="true">·</span>
          <span className="font-mono text-slate-600">{activeLayer.material}</span>
          <span className="text-slate-300" aria-hidden="true">·</span>
          <span className="text-slate-600">{activeLayer.role}</span>
        </div>
        <div className="flex items-center gap-1">
          {SEVEN_FILTER_LAYERS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setSelectedLayerId(l.id)}
              title={l.name}
              className={`w-6 h-6 text-xs font-mono font-semibold rounded transition-colors cursor-pointer ${
                selectedLayerId === l.id
                  ? 'bg-sky-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              {l.id}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
