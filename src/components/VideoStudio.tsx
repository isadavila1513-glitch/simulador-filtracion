import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Download,
  Film,
  ImagePlus,
  Loader2,
  Trash2,
  Upload,
} from 'lucide-react';

interface VideoStudioProps {
  capturedFrameDataUrl: string | null;
  onClearCapturedFrame: () => void;
}

const SAMPLE_LAB_IMAGE = '/src/assets/images/filter_bottle_lab_1795225998431.jpg';
const SAMPLE_FIELD_IMAGE = '/src/assets/images/filter_field_vertical_1795226000853.jpg';

const DEFAULT_VIDEO_PROMPT =
  'Simulación científica realista del proceso de filtrado de agua: el agua entra a una botella invertida de 7 capas (tela delgada, arena fina, arena gruesa, tela delgada, grava fina, grava gruesa y carbón activo), sale purificada por una manguera hacia una segunda botella donde recibe goteo de cloro mediante un venoclisis. Tres sensores sumergidos (temperatura, pH y turbidez) envían lecturas a un ESP32 con LED verde y rojo encendidos según la aptitud del agua, mientras una celda de carga debajo de la botella muestra el peso convertido a litros y un tablero digital actualiza calidad y cantidad cada 3 minutos.';

export const VideoStudio: React.FC<VideoStudioProps> = ({
  capturedFrameDataUrl,
  onClearCapturedFrame,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoMimeType, setPhotoMimeType] = useState<string>('image/jpeg');
  const [photoSourceLabel, setPhotoSourceLabel] = useState<string>('');

  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [duration, setDuration] = useState<'5s' | '8s' | '10s'>('8s');
  const [prompt, setPrompt] = useState<string>(DEFAULT_VIDEO_PROMPT);

  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [generatedMeta, setGeneratedMeta] = useState<{
    aspectRatio: string;
    duration: string;
  } | null>(null);

  const [sampleLoadError, setSampleLoadError] = useState<Record<string, boolean>>({});

  // Pre-load the 16:9 laboratory photo on initial render so users can generate immediately or replace with their own photo
  useEffect(() => {
    if (!capturedFrameDataUrl && !photoPreviewUrl) {
      handleUseSampleImage(
        SAMPLE_LAB_IMAGE,
        'Referencia Laboratorio (16:9)',
        '16:9'
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync when user clicks "Capturar fotograma para Video IA" in FiltrationCanvas
  useEffect(() => {
    if (capturedFrameDataUrl) {
      setPhotoPreviewUrl(capturedFrameDataUrl);
      setPhotoBase64(capturedFrameDataUrl.split(',')[1] || capturedFrameDataUrl);
      setPhotoMimeType('image/png');
      setPhotoSourceLabel('Fotograma capturado del simulador');
      setAspectRatio('16:9');
      setErrorMessage(null);
    }
  }, [capturedFrameDataUrl]);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (generatedVideoUrl && generatedVideoUrl.startsWith('blob:')) {
        URL.revokeObjectURL(generatedVideoUrl);
      }
    };
  }, [generatedVideoUrl]);

  const handleFileUpload = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Por favor selecciona un archivo de imagen válido (PNG, JPG o WEBP).');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setErrorMessage('La imagen supera el límite de 15 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      setPhotoPreviewUrl(dataUrl);
      setPhotoBase64(base64);
      setPhotoMimeType(file.type || 'image/jpeg');
      setPhotoSourceLabel(file.name);
      setErrorMessage(null);
    };
    reader.readAsDataURL(file);
  };

  const handleUseSampleImage = async (
    url: string,
    label: string,
    suggestedRatio: '16:9' | '9:16'
  ) => {
    try {
      setErrorMessage(null);
      const res = await fetch(url);
      if (!res.ok) throw new Error('No se pudo cargar la imagen de referencia.');
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
        setPhotoPreviewUrl(url);
        setPhotoBase64(base64);
        setPhotoMimeType(blob.type || 'image/jpeg');
        setPhotoSourceLabel(label);
        setAspectRatio(suggestedRatio);
      };
      reader.readAsDataURL(blob);
    } catch {
      setErrorMessage('No se pudo cargar la foto de ejemplo.');
    }
  };

  const handleClearPhoto = () => {
    setPhotoPreviewUrl(null);
    setPhotoBase64(null);
    setPhotoSourceLabel('');
    onClearCapturedFrame();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleGenerateVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) {
      setErrorMessage('Escribe una descripción para animar el video.');
      return;
    }

    setIsGenerating(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          aspectRatio,
          duration,
          imageBase64: photoBase64 || undefined,
          imageMimeType: photoBase64 ? photoMimeType : undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'No se pudo generar el video.');
      }

      if (!data.videoBase64) {
        throw new Error('La respuesta no contiene datos de video.');
      }

      const binary = atob(data.videoBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: data.mimeType || 'video/mp4' });
      const blobUrl = URL.createObjectURL(blob);

      if (generatedVideoUrl && generatedVideoUrl.startsWith('blob:')) {
        URL.revokeObjectURL(generatedVideoUrl);
      }

      setGeneratedVideoUrl(blobUrl);
      setGeneratedMeta({
        aspectRatio: data.aspectRatio || aspectRatio,
        duration: data.duration || duration,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al generar el video.';
      setErrorMessage(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div id="estudio-video" className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Estudio de Video IA · Animar Fotografía de Filtración
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Sube una foto de tu prototipo, captura el simulador o usa una referencia de laboratorio para generar un video real en 16:9 o 9:16.
          </p>
        </div>
        <span className="text-xs font-mono text-slate-500">
          Salida MP4 · 720p · {aspectRatio}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-6">
        {/* Left Column: Photo Upload & Video Prompt Form */}
        <form onSubmit={handleGenerateVideo} className="lg:col-span-6 space-y-5">
          {/* Photo Upload Area */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-800">
                1. Fotografía base (opcional o requerida para animar imagen)
              </label>
              {photoPreviewUrl && (
                <button
                  type="button"
                  onClick={handleClearPhoto}
                  className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:text-rose-700 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Quitar foto
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
              }}
              className="hidden"
            />

            {!photoPreviewUrl ? (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleFileUpload(file);
                }}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-sky-500 rounded-xl p-6 text-center cursor-pointer transition-colors bg-slate-50/50"
              >
                <Upload className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-700">
                  Haz clic para subir una foto o arrástrala aquí
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  PNG, JPG o WEBP (máx. 15 MB) · También puedes usar el botón &quot;Capturar fotograma&quot; arriba
                </p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-950 flex flex-col">
                <div className="relative flex items-center justify-center max-h-56 overflow-hidden">
                  <img
                    src={photoPreviewUrl}
                    alt="Fotografía seleccionada para generar video"
                    referrerPolicy="no-referrer"
                    className="max-h-56 w-auto object-contain"
                  />
                </div>
                <div className="px-3.5 py-2 bg-slate-900 text-slate-200 text-xs font-mono flex items-center justify-between">
                  <span className="truncate">{photoSourceLabel}</span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-sky-400 hover:text-sky-300 ml-3 shrink-0 cursor-pointer"
                  >
                    Cambiar foto
                  </button>
                </div>
              </div>
            )}

            {/* Quick Sample Photos */}
            <div className="mt-3">
              <span className="block text-[11px] font-medium text-slate-500 mb-2">
                O selecciona una fotografía de referencia del sistema:
              </span>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() =>
                    handleUseSampleImage(
                      SAMPLE_LAB_IMAGE,
                      'Referencia Laboratorio (16:9)',
                      '16:9'
                    )
                  }
                  className="flex items-center gap-2.5 p-2 rounded-lg border border-slate-200 hover:border-sky-300 hover:bg-sky-50/40 transition-colors text-left cursor-pointer"
                >
                  {!sampleLoadError['lab'] ? (
                    <img
                      src={SAMPLE_LAB_IMAGE}
                      alt="Filtro de 7 capas en laboratorio"
                      referrerPolicy="no-referrer"
                      onError={() => setSampleLoadError((p) => ({ ...p, lab: true }))}
                      className="w-14 h-10 object-cover rounded shrink-0 bg-slate-100"
                    />
                  ) : (
                    <div className="w-14 h-10 rounded bg-slate-100 flex items-center justify-center shrink-0">
                      <ImagePlus className="w-4 h-4 text-slate-400" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <span className="block text-xs font-semibold text-slate-800 truncate">
                      Montaje Laboratorio
                    </span>
                    <span className="block text-[11px] font-mono text-slate-500">16:9 Horizontal</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleUseSampleImage(
                      SAMPLE_FIELD_IMAGE,
                      'Referencia Estación Campo (9:16)',
                      '9:16'
                    )
                  }
                  className="flex items-center gap-2.5 p-2 rounded-lg border border-slate-200 hover:border-sky-300 hover:bg-sky-50/40 transition-colors text-left cursor-pointer"
                >
                  {!sampleLoadError['field'] ? (
                    <img
                      src={SAMPLE_FIELD_IMAGE}
                      alt="Estación comunitaria de filtrado en campo"
                      referrerPolicy="no-referrer"
                      onError={() => setSampleLoadError((p) => ({ ...p, field: true }))}
                      className="w-14 h-10 object-cover rounded shrink-0 bg-slate-100"
                    />
                  ) : (
                    <div className="w-14 h-10 rounded bg-slate-100 flex items-center justify-center shrink-0">
                      <ImagePlus className="w-4 h-4 text-slate-400" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <span className="block text-xs font-semibold text-slate-800 truncate">
                      Estación Rural
                    </span>
                    <span className="block text-[11px] font-mono text-slate-500">9:16 Vertical</span>
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* Aspect Ratio & Duration */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="block text-xs font-semibold text-slate-800 mb-1.5">
                2. Relación de aspecto
              </span>
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                {(['16:9', '9:16'] as const).map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    onClick={() => setAspectRatio(ratio)}
                    className={`py-1.5 text-xs font-mono font-semibold rounded-md transition-colors cursor-pointer ${
                      aspectRatio === ratio
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {ratio} {ratio === '16:9' ? 'Horiz.' : 'Vert.'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-xs font-semibold text-slate-800 mb-1.5">
                3. Duración del clip
              </span>
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
                {(['5s', '8s', '10s'] as const).map((dur) => (
                  <button
                    key={dur}
                    type="button"
                    onClick={() => setDuration(dur)}
                    className={`py-1.5 text-xs font-mono font-semibold rounded-md transition-colors cursor-pointer ${
                      duration === dur
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {dur}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Motion Prompt */}
          <div>
            <label htmlFor="video-prompt" className="block text-xs font-semibold text-slate-800 mb-1.5">
              4. Descripción del movimiento y simulación
            </label>
            <textarea
              id="video-prompt"
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe cómo debe animarse la fotografía del sistema de filtración..."
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
            />
          </div>

          {errorMessage && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isGenerating}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generando video con Gemini Omni Flash...
              </>
            ) : (
              <>
                <Film className="w-4 h-4" />
                {photoBase64 ? 'Animar fotografía en video' : 'Generar video desde texto'}
              </>
            )}
          </button>
        </form>

        {/* Right Column: Generated Video Player */}
        <div className="lg:col-span-6 flex flex-col justify-between border border-slate-200 rounded-xl bg-slate-950 p-5 text-white min-h-[380px]">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-3">
            <span>Reproductor de Video Generado</span>
            {generatedMeta && (
              <span>
                {generatedMeta.aspectRatio} · {generatedMeta.duration} · MP4
              </span>
            )}
          </div>

          <div className="flex-1 flex items-center justify-center">
            {isGenerating ? (
              <div className="text-center max-w-xs space-y-3 py-10">
                <Loader2 className="w-8 h-8 text-sky-400 animate-spin mx-auto" />
                <p className="text-sm font-medium text-slate-200">
                  Renderizando animación de flujo y sensores...
                </p>
                <p className="text-xs text-slate-400">
                  Este proceso puede tardar entre 20 y 90 segundos mientras se procesan los fotogramas.
                </p>
              </div>
            ) : generatedVideoUrl ? (
              <video
                key={generatedVideoUrl}
                src={generatedVideoUrl}
                controls
                playsInline
                autoPlay
                loop
                className={`rounded-lg bg-black max-h-[420px] ${
                  (generatedMeta?.aspectRatio || aspectRatio) === '9:16'
                    ? 'aspect-[9/16] w-auto'
                    : 'aspect-video w-full'
                }`}
              />
            ) : (
              <div className="text-center max-w-sm space-y-2 py-10">
                <Film className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-sm font-medium text-slate-300">
                  Aún no has generado un video
                </p>
                <p className="text-xs text-slate-500">
                  Sube una foto o captura un fotograma de la simulación en vivo y pulsa &quot;Animar fotografía en video&quot; para obtener el clip en formato 16:9 o 9:16.
                </p>
              </div>
            )}
          </div>

          {generatedVideoUrl && (
            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Video listo para descargar o compartir
              </span>
              <a
                href={generatedVideoUrl}
                download={`simulacion_filtrado_${generatedMeta?.aspectRatio.replace(':', 'x') || 'video'}.mp4`}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-white text-slate-900 hover:bg-slate-100 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Descargar MP4
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
