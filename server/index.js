import cors from 'cors';
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectBibNumbers } from './detection/pipeline.js';

const app = express();
const port = process.env.PORT ?? 3001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDistPath = path.resolve(__dirname, '..', 'dist');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

app.use(cors());
app.use(express.json());

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.post('/api/detect', upload.single('image'), async (request, response, next) => {
  try {
    if (!request.file) {
      response.status(400).send('Expected a multipart upload field named "image".');
      return;
    }

    const detections = await detectBibNumbers({
      buffer: request.file.buffer,
      mimeType: request.file.mimetype,
      originalName: request.file.originalname,
    });

    response.json({ detections });
  } catch (error) {
    next(error);
  }
});

app.use(express.static(clientDistPath));

app.get(/.*/, (_request, response) => {
  response.sendFile(path.join(clientDistPath, 'index.html'));
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).send('Unable to process image.');
});

app.listen(port, () => {
  console.log(`Number detector listening on http://localhost:${port}`);
});
