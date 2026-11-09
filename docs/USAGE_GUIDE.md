# Betterverse Duo — Complete Usage Guide

> A private, encrypted 3D web sanctuary where two people in different cities embody custom VRM avatars, mirror their webcam movements in real time, talk with 3D spatial voice audio, and share interactive moments.

---

## 📑 Table of Contents
1. [Core Concepts & Design](#-core-concepts--design)
2. [Step-by-Step Walkthrough](#-step-by-step-walkthrough)
   - [Hosting a Session (Person A)](#1-hosting-a-session-person-a)
   - [Joining a Session (Person B)](#2-joining-a-session-person-b)
3. [Avatar Controls & Camera Tracking](#-avatar-controls--camera-tracking)
4. [Voice & 3D Spatial Audio](#-voice--3d-spatial-audio)
5. [Shared Activities & Couple Emotes](#-shared-activities--couple-emotes)
6. [Duo Polaroid Photo Booth](#-duo-polaroid-photo-booth)
7. [Keyboard Shortcuts Reference](#-keyboard-shortcuts-reference)
8. [Solo Testing & Diagnostic Modes](#-solo-testing--diagnostic-modes)
9. [Troubleshooting & FAQs](#-troubleshooting--faqs)

---

## 🎨 Core Concepts & Design

Betterverse Duo is built around three core pillars:

1. **Strict 4-Color Palette**:
   The entire visual world is rendered in four vibrant, high-contrast colors:
   - **Blue (`#2391FF`)**: World environment, canvas background, eye/mouth interiors.
   - **Yellow (`#FFF83F`)**: Primary text, action buttons, local avatar hair, partner clothing.
   - **Amber (`#FFCD54`)**: Chunky borders, secondary badges, avatar skin material, waiting pod.
   - **Pink (`#F70063`)**: Active hardware indicators, error alerts, inverted-hull silhouette outline, heart particles.

2. **Absolute Privacy by Design**:
   - **Webcam video NEVER leaves your device**.
   - Google MediaPipe executes machine learning inference inside your browser's WebAssembly sandbox.
   - Only anonymous bone rotations and facial blendshape coefficients (75 bytes per frame) are transmitted across an encrypted peer-to-peer WebRTC DataChannel.

3. **Sub-150ms Real-Time Latency**:
   - Inverse kinematics and bone angles are computed locally at 30 Hz.
   - WebRTC DataChannels operate with `ordered: false` and `maxRetransmits: 0` for ultra-fast motion mirroring.

---

## 🚀 Step-by-Step Walkthrough

### 1. Hosting a Session (Person A)

1. Open your live application URL:
   **`https://betterverse-duo-n1iq.vercel.app`**
2. **Select Your Avatar**:
   Choose your preferred 3D avatar on the home screen toolbar:
   - **Seed-san**: VRM 1.0 official sample (casual style)
   - **Twist Sample**: VRM 1.0 articulated sample
   - **Alicia Solid**: Classic VRM 0.x anime reference model
3. Click **`Create Private Room`**:
   - A unique 12-character alphanumeric room code is generated (e.g. `7X9K2P4M8W3Q`).
   - If prompted, click **`Continue as Guest`** (or sign in with email for persistent account identity).
4. **Invite Your Partner**:
   Click **`Copy Invite Link`** at the top right of the room page and send the copied URL to your partner via chat or messaging.

---

### 2. Joining a Session (Person B)

**Via Invite Link:**
1. Click the invite link shared by Person A.
2. If prompted, select **`Continue as Guest`** (or enter your email).
3. You will immediately enter the room berth opposite your partner.

**Via Room Code:**
1. Navigate to `https://betterverse-duo-n1iq.vercel.app`.
2. Under **Option 2: Join Partner's Room**, paste the 12-character room code.
3. Click **`Join Room`**.

---

## 📷 Avatar Controls & Camera Tracking

1. **Activate Webcam Tracking**:
   - In the bottom-right Picture-in-Picture (PiP) window, click **`Enable Tracking`**.
   - When the browser prompts for camera permission, click **Allow**.
   - The Pink **`CAMERA LIVE - VIDEO STAYS ON THIS DEVICE`** privacy banner will illuminate in the top bar.

2. **Camera Placement & Framing**:
   - Sit approximately 0.5m – 1.0m (arm's length) from your webcam.
   - Ensure your head, shoulders, and chest are visible within the frame.
   - Raise your hands into view to articulate fingers and wave.

3. **Recenter Avatar Pose (<kbd>R</kbd>)**:
   - Look straight ahead at your monitor with a natural posture.
   - Click the **`Recenter Pose`** button (or tap **`R`** on your keyboard) to recalibrate head neutral angle and posture.

4. **Toggle PiP Preview (<kbd>T</kbd>)**:
   - Click **`Hide Tracking PiP`** or press **`T`** to hide your skeletal webcam preview and immerse yourself entirely in the 3D stage.

---

## 🎙️ Voice & 3D Spatial Audio

Betterverse Duo features an integrated **HRTF (Head-Related Transfer Function)** 3D audio spatializer.

1. **Enable Microphone**:
   - In the toolbar above the avatar stage, click **`Enable Microphone`**.
   - Click **Allow** when prompted by your browser.
2. **Live Privacy Badge**:
   - When speaking, the Pink **`MIC LIVE`** badge is displayed.
   - Click **`Mute`** to instantly mute your microphone; the badge transitions to Amber **`MIC MUTED`**.
3. **Real-Time Audio Meters**:
   - **`Mic:`** 5-segment level meter monitoring your physical microphone volume.
   - **`Partner:`** 5-segment level meter monitoring incoming partner speech.
4. **Spatial Acoustics**:
   - Partner audio is positioned in 3D relative to their avatar.
   - Headphones are recommended for optimal binaural immersion and acoustic echo cancellation.

---

## ✨ Shared Activities & Couple Emotes

Send real-time synchronized reactions and audio chimes to your partner:

| Emote Button | Keyboard Shortcut | Visual Burst | Web Audio Sound Effect |
|---|---|---|---|
| **Send Heart** | <kbd>H</kbd> | Floating Pink geometric hearts | Ascending harmonic chime (440 Hz → 880 Hz) |
| **Sparkle** | <kbd>S</kbd> | Yellow & Amber starlight particles | Shimmering triangle arpeggio (587 Hz → 1174 Hz) |
| **High Five!** | <kbd>F</kbd> | Concentrated central particle blast | Percussive snap and celebratory chord |

---

## 📸 Duo Polaroid Photo Booth

Capture keepsake snapshots of both avatars together in real time:

1. Click **`Duo Photo`** on the toolbar or press **<kbd>P</kbd>**.
2. A synchronized **3-2-1 countdown** appears in bold Pink & Yellow on both screens.
3. Strike a pose with your partner!
4. At zero, an authentic camera shutter sound plays and a retro Polaroid frame is generated with:
   - Both avatars side-by-side.
   - Amber and Yellow card borders.
   - Room code and timestamp caption.
5. Click **`Download Polaroid`** to save the PNG image directly to your device.

---

## ⌨️ Keyboard Shortcuts Reference

Keep your hands free for avatar gestures using these global single-key shortcuts:

| Key | Function |
|---|---|
| <kbd>R</kbd> | **Recenter Pose**: Calibrates avatar head orientation to your current gaze |
| <kbd>H</kbd> | **Send Heart**: Triggers heart particle burst and chime on both screens |
| <kbd>S</kbd> | **Sparkle**: Triggers sparkle particle burst and shimmer audio |
| <kbd>F</kbd> | **High Five**: Triggers synchronized high-five snap effect |
| <kbd>P</kbd> | **Duo Photo**: Initiates 3-second synchronized photo booth countdown |
| <kbd>T</kbd> | **Toggle PiP**: Shows or hides the local tracking camera overlay |

---

## 🔬 Solo Testing & Diagnostic Modes

You can test every feature without needing a second computer or partner:

### 1. Loopback Test Mode (`?loopback=1`)
Append `?loopback=1` to any room URL:
```text
https://betterverse-duo-n1iq.vercel.app/room/my-test-room?loopback=1
```
- Your local avatar renders on the left (mirrored).
- The partner viewport renders on the right (unmirrored with Pink hair and Yellow clothing).
- Your motion is encoded into the 75-byte binary packet, decoded in real time, and drives the partner avatar side-by-side with 0 ms simulated network latency.

### 2. Pixel Palette Compliance Audit (`?audit`)
Append `&audit` to the URL:
```text
https://betterverse-duo-n1iq.vercel.app/room/my-test-room?loopback=1&audit
```
- Reads the WebGL framebuffer to verify that 100% of rendered pixels match the 4 palette colors.
- Displays a diagnostic card showing total pixel count and compliance percentage (Target: `0.00%` non-palette pixels).

### 3. One-Euro Filter Tuning (`?debug`)
Append `&debug` to the URL:
```text
https://betterverse-duo-n1iq.vercel.app/room/my-test-room?loopback=1&debug
```
- Opens interactive sliders for `minCutoff` (Hz) and `beta` (speed adaptation) to observe smoothing versus responsiveness in real time.

---

## ❓ Troubleshooting & FAQs

### Q: The camera won't start or shows an error.
- **`NotAllowedError`**: Camera permission was denied in your browser. Click the lock/tune icon in your browser address bar and set Camera to **Allow**, then refresh.
- **`NotReadableError`**: Another application (Zoom, Teams, Discord, or another browser tab) is holding exclusive access to your webcam. Close other webcam apps and retry.

### Q: My avatar head is tilted to one side.
- Look directly into your webcam with your head level and press <kbd>R</kbd> on your keyboard. This zeroes out rotation offsets.

### Q: How do I know if my partner is connected?
- Look at the top status bar:
  - **`Waiting For Partner`** (Amber): Partner has not yet entered the room. An Amber wireframe pod rotates in their berth.
  - **`Connecting...`** (Amber): WebRTC ICE candidate negotiation is in progress.
  - **`Peer Connected`** (Yellow): WebRTC peer-to-peer data and voice stream are live.

### Q: Why do Betterverse rooms hold only 2 people?
- Betterverse Duo is an intimate, private space engineered specifically for couples. The database enforces a strict 2-member maximum per room code via row-level database locks. Additional visitors will see a **"Room is Full"** notification.
