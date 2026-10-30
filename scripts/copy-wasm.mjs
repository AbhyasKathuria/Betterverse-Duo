import fs from 'node:fs';
import path from 'node:path';

const srcDir = path.join(process.cwd(), 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const destDir = path.join(process.cwd(), 'public', 'mediapipe', 'wasm');

if (fs.existsSync(srcDir)) {
  fs.mkdirSync(destDir, { recursive: true });
  const files = fs.readdirSync(srcDir);
  for (const file of files) {
    const srcFile = path.join(srcDir, file);
    const destFile = path.join(destDir, file);
    fs.copyFileSync(srcFile, destFile);
  }
  console.log(`✅ Successfully copied ${files.length} MediaPipe WASM files to ${destDir}`);
} else {
  console.warn(`⚠️ Source WASM directory not found: ${srcDir}`);
}
