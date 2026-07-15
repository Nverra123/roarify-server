const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;

const app = express();
const upload = multer({ dest: os.tmpdir() });

// Valores medidos sobre trex.mp4 (ver README.md para el detalle de cómo
// se midieron).
const TEMPLATE_VIDEO_PATH = path.join(__dirname, "trex.mp4");
const ROAR_START = 19.9;
const ROAR_DURATION = 3.47;
const FADE_SECONDS = 0.05;

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Guarda en memoria dónde quedó cada resultado ya procesado, para que el
// cliente lo pueda descargar en un segundo paso con FileSystem.downloadAsync
// (mucho más simple y confiable en React Native que recibir el binario
// directo en la respuesta del POST).
const results = new Map();

// Limpieza simple: si un resultado no se descarga en 10 minutos, se borra.
const RESULT_TTL_MS = 10 * 60 * 1000;

/**
 * POST /mix
 * Body: multipart/form-data con un campo "userRecording" (el video/audio
 * grabado por el usuario, cámara frontal, ~3s).
 * Responde con {"id": "..."} cuando termina de procesar.
 */
app.post("/mix", upload.single("userRecording"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Falta el archivo 'userRecording'." });
    return;
  }

  const userRecordingPath = req.file.path;
  const outputPath = path.join(os.tmpdir(), `roarify_${Date.now()}.mp4`);

  const roarEnd = Math.round((ROAR_START + ROAR_DURATION) * 100) / 100;
  const delayMs = Math.round(ROAR_START * 1000);
  const fadeOutStart = Math.max(0, ROAR_DURATION - FADE_SECONDS);

  const filterComplex =
    `[0:a]volume=0:enable='between(t,${ROAR_START},${roarEnd})'[base_muted];` +
    `[1:a]atrim=0:${ROAR_DURATION},apad,atrim=0:${ROAR_DURATION},` +
    `asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${FADE_SECONDS},` +
    `afade=t=out:st=${fadeOutStart}:d=${FADE_SECONDS},` +
    `adelay=${delayMs}|${delayMs}[user_roar];` +
    `[base_muted][user_roar]amix=inputs=2:duration=first:dropout_transition=0[aout]`;

  const args = [
    "-y",
    "-i", TEMPLATE_VIDEO_PATH,
    "-i", userRecordingPath,
    "-filter_complex", filterComplex,
    "-map", "0:v",
    "-map", "[aout]",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "128k",
    "-shortest",
    outputPath,
  ];

  const ffmpeg = spawn(ffmpegPath, args);

  let stderrLog = "";
  ffmpeg.stderr.on("data", (chunk) => {
    stderrLog += chunk.toString();
  });

  ffmpeg.on("close", (code) => {
    fs.unlink(userRecordingPath, () => {});

    if (code !== 0) {
      console.error("FFmpeg falló:", stderrLog);
      res.status(500).json({ error: "FFmpeg falló procesando el rugido." });
      return;
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    results.set(id, outputPath);

    setTimeout(() => {
      const stillThere = results.get(id);
      if (stillThere) {
        fs.unlink(stillThere, () => {});
        results.delete(id);
      }
    }, RESULT_TTL_MS);

    res.json({ id });
  });
});

/**
 * GET /result/:id
 * Descarga el MP4 ya procesado.
 */
app.get("/result/:id", (req, res) => {
  const outputPath = results.get(req.params.id);

  if (!outputPath || !fs.existsSync(outputPath)) {
    res.status(404).json({ error: "Resultado no encontrado o expirado." });
    return;
  }

  res.setHeader("Content-Type", "video/mp4");
  const stream = fs.createReadStream(outputPath);
  stream.pipe(res);
  stream.on("close", () => {
    fs.unlink(outputPath, () => {});
    results.delete(req.params.id);
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Roarify server escuchando en el puerto ${port}`);
});
