import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';

const MODELS = [
  {
    name: 'pose_landmarker_lite.task',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
  },
  {
    name: 'hand_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
  },
  {
    name: 'face_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task',
  },
];

async function downloadModels() {
  const destDir = path.join(process.cwd(), 'public', 'models');
  fs.mkdirSync(destDir, { recursive: true });

  console.log(`Downloading MediaPipe models to ${destDir}...`);

  for (const model of MODELS) {
    const destPath = path.join(destDir, model.name);
    if (fs.existsSync(destPath)) {
      const stats = fs.statSync(destPath);
      if (stats.size > 1000000) {
        console.log(`ℹ️ ${model.name} already exists (${(stats.size / (1024 * 1024)).toFixed(2)} MB). Skipping.`);
        continue;
      }
    }

    console.log(`Fetching ${model.name} from ${model.url}...`);
    const res = await fetch(model.url);
    if (!res.ok) {
      throw new Error(`Failed to download ${model.name}: ${res.status} ${res.statusText}`);
    }

    const fileStream = fs.createWriteStream(destPath);
    await finished(Readable.fromWeb(res.body).pipe(fileStream));

    const stats = fs.statSync(destPath);
    console.log(`✅ Downloaded ${model.name}: ${(stats.size / (1024 * 1024)).toFixed(2)} MB (${stats.size} bytes)`);
  }
}

downloadModels().catch((err) => {
  console.error('❌ Failed to download models:', err);
  process.exit(1);
});
