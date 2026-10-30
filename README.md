# Betterverse Duo

> **A private 3D web room for couples in different cities.**
> Mirror your real upper-body presence via webcam tracking onto custom VRM avatars in real time, with WebRTC peer-to-peer data channels, HRTF spatial voice audio, and interactive couple activities.

---

## 🎨 Strict 4-Color Palette Architecture

Betterverse Duo strictly adheres to a stylized **4-color palette** across the entire stack — user interface, 3D materials, skeletal drawing, overlays, particles, and retro Polaroid photo booth. No white, black, gray, transparency/opacity, or gradients are permitted.

| Color Name | Hex Code | RGB | Three.js Hex | Usage |
|---|---|---|---|---|
| **Blue** | `#2391FF` | `rgb(35, 145, 255)` | `0x2391ff` | Primary background, viewport canvas, sky, eye/mouth interiors |
| **Yellow** | `#FFF83F` | `rgb(255, 248, 63)` | `0xfff83f` | Main text, primary action buttons, local avatar hair, partner clothing |
| **Amber** | `#FFCD54` | `rgb(255, 205, 84)` | `0xffcd54` | Thick borders, secondary badges, avatar skin material, waiting pod |
| **Pink** | `#F70063` | `rgb(247, 0, 99)` | `0xf70063` | Live indicators, error banners, avatar inverted-hull outline, heart emote |

An automated scanner (`npm run check:palette`) runs automatically before every build (`prebuild`) to guarantee 100% color compliance.

---

## 🚀 Key Features

1. **Webcam Tracking & Privacy First**:
   - Google MediaPipe (`@mediapipe/tasks-vision`) runs 100% locally in your browser with GPU acceleration and automatic CPU fallback.
   - Raw video pixels are never streamed, stored, or sent to any server. Only anonymous bone rotations and blendshapes are transmitted.
   - Dedicated Pink privacy badges (`CAMERA LIVE`, `MIC LIVE`) illuminate only when hardware devices are actively in use.

2. **Full VRM Humanoid Rigging**:
   - Built on Three.js and `@pixiv/three-vrm` with React Three Fiber (`@react-three/fiber`).
   - Retargets upper-body pose (landmarks 0–24), dual 5-finger articulation, and facial blendshapes (`blinkLeft`, `blinkRight`, `aa`, `happy`).
   - 1€ (One-Euro) adaptive filtering dynamically suppresses high-frequency jitter at rest while preserving low-latency response during rapid movement.
   - Graceful 0.5s easing back to neutral rest pose if tracking is obstructed or the connection drops.

3. **Ultra-Low Latency Networking (< 150 ms)**:
   - Client-side humanoid inverse kinematics solver extracts 6 quantized bone quaternions, 10 finger curls, and 10 blendshape weights into a compact **75-byte binary packet** at 30 Hz.
   - Transmitted via WebRTC DataChannel (`ordered: false, maxRetransmits: 0`) for near-zero latency.
   - Supabase Realtime Authorization handles private peer signaling (`room:<id>`) with deterministic offerer role selection (`localPeerId < remotePeerId`) and 16-bit sequence wraparound handling.

4. **Voice & HRTF Spatial Audio**:
   - Web Audio API `PannerNode` with **HRTF** (Head-Related Transfer Function) spatialization and inverse distance attenuation.
   - Partner audio is positioned in 3D relative to the listener.
   - Real-time segmented RMS volume meters monitor microphone and partner audio levels.

5. **Couple Activities & Retro Polaroid Booth**:
   - Send Hearts (`H`), Sparkles (`S`), or High Fives (`F`) with real-time 4-color geometric particles and Web Audio harmonic chimes.
   - Synchronized 3-second countdown Duo Photo Booth (`P`) that composes both avatars into a downloadable retro Polaroid keepsake.

---

## 🛠️ Quick Start

### 1. Prerequisites
- Node.js 20+ (Node 24 supported)
- npm 10+

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/your-username/betterverse-duo.git
cd betterverse-duo

# Install dependencies (runs postinstall script to set up WASM, models, and avatars)
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env.local` and add your Supabase credentials:

```bash
cp .env.example .env.local
```

Edit `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-publishable-key
NEXT_PUBLIC_ENABLE_GUEST=true
NEXT_PUBLIC_STUN_SERVER=stun:stun.l.google.com:19302
```

> **Security Note:** Betterverse Duo never uses `SUPABASE_SERVICE_ROLE_KEY`. Only the public `anon` key is needed.

### 4. Supabase Database Setup
Execute [`supabase/schema.sql`](supabase/schema.sql) in your Supabase project's **SQL Editor**. This creates:
- `public.rooms` and `public.room_memberships` tables with RLS policies (max 2 members per room).
- `create_room(p_room_id)` and `join_room(p_room_id)` atomic functions with row locks.
- Realtime Authorization policies on `realtime.messages` restricting subscription to room members.

### 5. Run the Local Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Testing & Verification

```bash
# Run unit tests (avatar math, binary packet serialization, sequence wraparound, spatial audio, activity messages)
npm test

# Run strict 4-color palette compliance checker
npm run check:palette

# Run Next.js production build
npm run build
```

---

## 🎮 Interactive Dev Modes

- **Single-User Loopback Test**:
  Visit `http://localhost:3000/room/test-room?loopback=1` to mirror your tracking directly into the remote partner avatar side-by-side.
- **Pixel Palette Audit**:
  Append `&audit` to test that the WebGL framebuffer renders with 0.00% non-palette pixels.
- **1€ Filter Tuning Panel**:
  Append `&debug` to access real-time sliders for `minCutoff` and `beta` smoothing parameters.

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|---|---|
| <kbd>R</kbd> | Recenter head and upper body |
| <kbd>H</kbd> | Send Heart emote with ascending harmonic chime |
| <kbd>S</kbd> | Send Sparkle emote with shimmer arpeggio |
| <kbd>F</kbd> | High Five! with percussive snap chord |
| <kbd>P</kbd> | Start 3-second Duo Polaroid photo countdown |
| <kbd>T</kbd> | Toggle webcam tracking PiP window |

---

## 📜 Avatar Licenses

Sample VRM models are licensed under open-source and public domain terms:
- **Seed-san**: CC0 1.0 Universal (VRM Consortium)
- **Twist Sample**: MIT License (Pixiv Inc.)
- **Alicia Solid**: CC BY 4.0 (Dwango Co., Ltd.)

Detailed attribution and terms are recorded in [`public/avatars/LICENSES.md`](public/avatars/LICENSES.md).
