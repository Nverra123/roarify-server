# Roarify Server

Servidor chiquito que hace la mezcla de audio del rugido (silencia el
rugido original del T-Rex e inserta el del usuario, exactamente
sincronizado). Ver `GUIA_COMPLETA.md` en el paquete de la app para los
pasos de despliegue en Render.

## Por qué existe esto

La forma "ideal" (todo en el celular, sin servidor) dependía de una
librería llamada FFmpegKit para React Native, que fue discontinuada por
completo en 2025-2026: sus archivos binarios ya no están disponibles en
ningún repositorio público, y no hay ningún reemplazo confiable al día de
hoy. Este servidor hace exactamente la misma tarea (con el mismo FFmpeg,
los mismos parámetros de sincronización), pero corriendo en una máquina
en internet en lugar de en el celular — porque ahí FFmpeg sí se puede
instalar sin problemas.

## Probarlo localmente (opcional, para quien sepa)

```bash
npm install
node server.js
```

Después:

```bash
curl -X POST http://localhost:3000/mix -F "userRecording=@algun_audio.wav"
# devuelve {"id": "..."}
curl http://localhost:3000/result/EL_ID -o resultado.mp4
```

## Endpoints

- `GET /health` — chequeo simple, responde `{"ok": true}`.
- `POST /mix` — recibe un archivo (campo `userRecording`, video o audio de
  ~3 segundos) y devuelve `{"id": "..."}` cuando termina de procesar.
- `GET /result/:id` — descarga el MP4 final. El archivo se borra del
  servidor después de descargarse (o a los 10 minutos si nadie lo pide).
