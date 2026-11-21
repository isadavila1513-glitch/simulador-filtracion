import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/generate-video', async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({
        error:
          'La clave GEMINI_API_KEY no está configurada en el servidor. Configúrela en Secrets para generar videos.',
      });
      return;
    }

    try {
      const {
        prompt,
        aspectRatio = '16:9',
        duration = '8s',
        imageBase64,
        imageMimeType = 'image/jpeg',
      } = req.body ?? {};

      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        res.status(400).json({ error: 'Se requiere una descripción (prompt) para generar el video.' });
        return;
      }

      const validAspectRatio = aspectRatio === '9:16' ? '9:16' : '16:9';
      const allowedDurations = new Set([
        '3s', '4s', '5s', '6s', '7s', '8s', '9s', '10s', '11s', '12s', '13s', '14s', '15s',
      ]);
      const validDuration = allowedDurations.has(duration) ? duration : '8s';

      const ai = new GoogleGenAI({ apiKey });

      let inputPayload:
        | string
        | Array<
            | { type: 'image'; mime_type: string; data: string }
            | { type: 'text'; text: string }
          >;

      if (imageBase64 && typeof imageBase64 === 'string') {
        const cleanBase64 = imageBase64.includes(',')
          ? imageBase64.split(',')[1]
          : imageBase64;
        inputPayload = [
          {
            type: 'image',
            mime_type: typeof imageMimeType === 'string' && imageMimeType ? imageMimeType : 'image/jpeg',
            data: cleanBase64,
          },
          {
            type: 'text',
            text: prompt.trim(),
          },
        ];
      } else {
        inputPayload = prompt.trim();
      }

      const interaction = await ai.interactions.create(
        {
          model: 'gemini-omni-1.2-flash',
          input: inputPayload,
          background: false,
          store: false,
          stream: false,
          response_format: {
            type: 'video',
            aspect_ratio: validAspectRatio,
            duration: validDuration,
            resolution: '720p',
          },
        },
        { timeout: 300000 }
      );

      const videoPart = interaction.output_video;
      if (!videoPart) {
        res.status(502).json({
          error: 'El modelo no devolvió un archivo de video en la respuesta.',
        });
        return;
      }

      if (videoPart.data) {
        res.json({
          videoBase64: videoPart.data,
          mimeType: videoPart.mime_type || 'video/mp4',
          aspectRatio: validAspectRatio,
          duration: validDuration,
        });
        return;
      }

      if (videoPart.uri) {
        const upstream = await fetch(videoPart.uri, {
          headers: { 'x-goog-api-key': apiKey },
        });
        if (!upstream.ok) {
          res.status(502).json({
            error: `No se pudo descargar el video generado (${upstream.status}).`,
          });
          return;
        }
        const arrayBuf = await upstream.arrayBuffer();
        const base64 = Buffer.from(arrayBuf).toString('base64');
        res.json({
          videoBase64: base64,
          mimeType: videoPart.mime_type || upstream.headers.get('content-type') || 'video/mp4',
          aspectRatio: validAspectRatio,
          duration: validDuration,
        });
        return;
      }

      res.status(502).json({
        error: 'La respuesta de video no incluyó datos binarios ni URI válida.',
      });
    } catch (err: unknown) {
      const errorObj = err as { status?: number; message?: string };
      const status = typeof errorObj?.status === 'number' ? errorObj.status : 500;
      const rawMessage = errorObj?.message || 'Error inesperado al generar el video.';

      let friendlyMessage = rawMessage;
      if (status === 403 || rawMessage.includes('PERMISSION_DENIED') || rawMessage.includes('API_KEY_INVALID')) {
        friendlyMessage =
          'Acceso denegado o clave API inválida. Verifica una clave de facturación habilitada en Settings > Secrets.';
      } else if (status === 429 || rawMessage.includes('RESOURCE_EXHAUSTED')) {
        friendlyMessage =
          'Cuota agotada o modelo exclusivo de nivel de pago (gemini-omni-1.2-flash). Selecciona una clave API con facturación activa en Settings > Secrets.';
      }

      res.status(status >= 400 && status < 600 ? status : 500).json({
        error: friendlyMessage,
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`HidroLab IoT server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
