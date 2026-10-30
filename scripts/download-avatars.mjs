import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';

const AVATARS = [
  {
    id: 'seed-san',
    filename: 'seed-san.vrm',
    url: 'https://raw.githubusercontent.com/vrm-c/vrm-specification/master/samples/Seed-san/vrm/Seed-san.vrm',
    name: 'Seed-san (VRM 1.0 Sample)',
    source: 'https://github.com/vrm-c/vrm-specification/tree/master/samples/Seed-san',
    license: 'CC0 1.0 Universal (Public Domain Dedication)',
    author: 'VRM Consortium',
    redistribution: 'Allowed without restriction (Public Domain)',
  },
  {
    id: 'twist-sample',
    filename: 'twist-sample.vrm',
    url: 'https://raw.githubusercontent.com/pixiv/three-vrm/release/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm',
    name: 'VRM1 Constraint Twist Sample (VRM 1.0)',
    source: 'https://github.com/pixiv/three-vrm/tree/release/packages/three-vrm/examples/models',
    license: 'MIT License',
    author: 'Pixiv Inc.',
    redistribution: 'Allowed under MIT License terms',
  },
  {
    id: 'alicia-solid',
    filename: 'alicia-solid.vrm',
    url: 'https://raw.githubusercontent.com/vrm-c/UniVRM/master/Tests/Models/Alicia_vrm-0.51/AliciaSolid_vrm-0.51.vrm',
    name: 'Alicia Solid (VRM 0.x Standard Reference)',
    source: 'https://github.com/vrm-c/UniVRM/tree/master/Tests/Models/Alicia_vrm-0.51',
    license: 'CC BY 4.0 (Dwango Media License)',
    author: 'Dwango Co., Ltd.',
    redistribution: 'Allowed for non-commercial and demonstration testing with attribution',
  },
];

async function downloadAvatars() {
  const destDir = path.join(process.cwd(), 'public', 'avatars');
  fs.mkdirSync(destDir, { recursive: true });

  console.log(`Downloading verified VRM sample models to ${destDir}...`);

  for (const avatar of AVATARS) {
    const destPath = path.join(destDir, avatar.filename);
    let shouldDownload = true;

    if (fs.existsSync(destPath)) {
      const stats = fs.statSync(destPath);
      if (stats.size > 1000000) {
        // Check magic bytes
        const fd = fs.openSync(destPath, 'r');
        const buf = Buffer.alloc(4);
        fs.readSync(fd, buf, 0, 4, 0);
        fs.closeSync(fd);
        if (buf.toString('utf8') === 'glTF') {
          console.log(`ℹ️ ${avatar.filename} already downloaded and verified (${(stats.size / (1024 * 1024)).toFixed(2)} MB).`);
          shouldDownload = false;
        }
      }
    }

    if (shouldDownload) {
      console.log(`Fetching ${avatar.filename} from ${avatar.url}...`);
      const res = await fetch(avatar.url);
      if (!res.ok) {
        throw new Error(`Failed to download ${avatar.filename}: ${res.status} ${res.statusText}`);
      }

      const fileStream = fs.createWriteStream(destPath);
      await finished(Readable.fromWeb(res.body).pipe(fileStream));

      // Verification checks
      const stats = fs.statSync(destPath);
      if (stats.size > 15 * 1024 * 1024) {
        throw new Error(`Downloaded file ${avatar.filename} exceeds 15 MB limit: ${stats.size} bytes`);
      }

      const fd = fs.openSync(destPath, 'r');
      const magicBuf = Buffer.alloc(4);
      fs.readSync(fd, magicBuf, 0, 4, 0);
      fs.closeSync(fd);
      const magicStr = magicBuf.toString('utf8');

      if (magicStr !== 'glTF') {
        throw new Error(`Downloaded file ${avatar.filename} has invalid magic header "${magicStr}" (expected "glTF")`);
      }

      console.log(`✅ Verified ${avatar.filename}: ${(stats.size / (1024 * 1024)).toFixed(2)} MB, magic: "glTF"`);
    }
  }

  // Generate public/avatars/LICENSES.md
  let licenseDoc = '# VRM Sample Model Licenses & Attribution\n\n';
  licenseDoc += 'This directory contains open-source sample VRM models for Betterverse Duo.\n\n';

  for (const avatar of AVATARS) {
    licenseDoc += `## ${avatar.name}\n`;
    licenseDoc += `- **File**: \`${avatar.filename}\`\n`;
    licenseDoc += `- **Source**: [${avatar.source}](${avatar.source})\n`;
    licenseDoc += `- **Author / Rights Holder**: ${avatar.author}\n`;
    licenseDoc += `- **License**: ${avatar.license}\n`;
    licenseDoc += `- **Redistribution Status**: ${avatar.redistribution}\n\n`;
  }

  const licensePath = path.join(destDir, 'LICENSES.md');
  fs.writeFileSync(licensePath, licenseDoc, 'utf8');
  console.log(`✅ Generated ${licensePath}`);
}

downloadAvatars().catch((err) => {
  console.error('❌ Failed to download avatars:', err);
  process.exit(1);
});
