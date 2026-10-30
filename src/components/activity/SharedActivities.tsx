'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { ControlActivityMessage } from '@/lib/webrtc/types';

interface SharedActivitiesProps {
  roomId: string;
  onSendActivity?: (action: ControlActivityMessage['action']) => void;
  incomingActivity?: ControlActivityMessage | null;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  type: 'heart' | 'sparkle' | 'star';
  color: string;
  size: number;
}

export default function SharedActivities({
  roomId,
  onSendActivity,
  incomingActivity,
}: SharedActivitiesProps) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [polaroidUrl, setPolaroidUrl] = useState<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Synthesize chimes using Web Audio API (Zero external assets, 100% reliable)
  const playSoundEffect = useCallback((type: 'heart' | 'sparkle' | 'high_five' | 'shutter') => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      if (type === 'heart') {
        // Ascending harmonic chime
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now); // A4
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.3); // A5
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.4);
      } else if (type === 'sparkle') {
        // Shimmering arpeggio
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.exponentialRampToValueAtTime(1174.66, now + 0.25); // D6
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (type === 'high_five') {
        // Crisp percussive snap & high chord
        osc.type = 'square';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(700, now + 0.15);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === 'shutter') {
        // Camera snap
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.08);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.1);
      }
    } catch {
      // Audio autoplay policy fallback
    }
  }, []);

  // Spawn visual particle bursts
  const triggerParticles = useCallback((type: 'heart' | 'sparkle' | 'high_five') => {
    const newParticles: Particle[] = [];
    const count = type === 'heart' ? 12 : 16;
    const colors = type === 'heart' ? ['#F70063', '#FFCD54'] : ['#FFF83F', '#FFCD54', '#F70063'];

    for (let i = 0; i < count; i++) {
      newParticles.push({
        id: Date.now() + Math.random(),
        x: 30 + Math.random() * 40, // Centered in screen width
        y: 40 + Math.random() * 30, // Centered vertically
        type: type === 'heart' ? 'heart' : 'sparkle',
        color: colors[i % colors.length],
        size: 16 + Math.random() * 20,
      });
    }

    setParticles((prev) => [...prev, ...newParticles]);

    // Clean up particles after animation completes (1.5s)
    setTimeout(() => {
      setParticles((prev) => prev.filter((p) => !newParticles.includes(p)));
    }, 1500);
  }, []);

  // Handle Synchronized Photo Booth Countdown & Snapshot
  const capturePolaroid = useCallback(() => {
    playSoundEffect('shutter');
    try {
      const canvases = Array.from(document.querySelectorAll('canvas'));
      if (canvases.length === 0) return;

      // Filter WebGL canvases (exclude 1px tracking canvas)
      const stageCanvases = canvases.filter((c) => c.width > 100 && c.height > 100);
      if (stageCanvases.length === 0) return;

      const polaroidCanvas = document.createElement('canvas');
      const cardWidth = 720;
      const cardHeight = 560;
      polaroidCanvas.width = cardWidth;
      polaroidCanvas.height = cardHeight;
      const ctx = polaroidCanvas.getContext('2d');
      if (!ctx) return;

      // 1. Polaroid Outer Frame (Amber)
      ctx.fillStyle = '#FFCD54';
      ctx.fillRect(0, 0, cardWidth, cardHeight);

      // 2. Polaroid Inner Card (Yellow)
      ctx.fillStyle = '#FFF83F';
      ctx.fillRect(16, 16, cardWidth - 32, cardHeight - 32);

      // 3. Inner Photo Area (Blue background)
      const photoX = 32;
      const photoY = 32;
      const photoW = cardWidth - 64;
      const photoH = cardHeight - 140;
      ctx.fillStyle = '#2391FF';
      ctx.fillRect(photoX, photoY, photoW, photoH);

      // Draw Avatars (Split 50/50)
      if (stageCanvases.length >= 2) {
        const halfW = photoW / 2;
        // Local avatar (left)
        ctx.save();
        ctx.translate(photoX + halfW, photoY);
        ctx.scale(-1, 1); // Mirrored representation
        ctx.drawImage(stageCanvases[0], 0, 0, halfW, photoH);
        ctx.restore();

        // Partner avatar (right)
        ctx.drawImage(stageCanvases[1], photoX + halfW, photoY, halfW, photoH);
      } else if (stageCanvases.length === 1) {
        ctx.drawImage(stageCanvases[0], photoX, photoY, photoW, photoH);
      }

      // 4. Photo Inner Amber Border
      ctx.strokeStyle = '#FFCD54';
      ctx.lineWidth = 4;
      ctx.strokeRect(photoX, photoY, photoW, photoH);

      // 5. Retro Caption Text in Pink
      ctx.fillStyle = '#F70063';
      ctx.font = '900 22px system-ui, sans-serif';
      ctx.fillText('BETTERVERSE DUO • MOMENT IN TIME', 36, cardHeight - 65);

      ctx.fillStyle = '#2391FF';
      ctx.font = '700 14px system-ui, sans-serif';
      const dateStr = new Date().toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      ctx.fillText(`ROOM: ${roomId} • ${dateStr}`, 36, cardHeight - 38);

      const dataUrl = polaroidCanvas.toDataURL('image/png');
      setPolaroidUrl(dataUrl);
    } catch (err) {
      console.warn('Failed to capture polaroid snapshot:', err);
    }
  }, [roomId, playSoundEffect]);

  // Execute countdown loop
  const startCountdown = useCallback(() => {
    setCountdown(3);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          capturePolaroid();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, [capturePolaroid]);

  // Respond to incoming partner activities over WebRTC DataChannel
  useEffect(() => {
    if (!incomingActivity) return;
    const { action } = incomingActivity;

    if (action === 'heart') {
      playSoundEffect('heart');
      triggerParticles('heart');
    } else if (action === 'sparkle') {
      playSoundEffect('sparkle');
      triggerParticles('sparkle');
    } else if (action === 'high_five') {
      playSoundEffect('high_five');
      triggerParticles('high_five');
    } else if (action === 'photo_countdown') {
      startCountdown();
    }
  }, [incomingActivity, playSoundEffect, triggerParticles, startCountdown]);

  // Trigger Local Activity and Broadcast to Partner
  const handleTriggerAction = (action: ControlActivityMessage['action']) => {
    if (action === 'heart') {
      playSoundEffect('heart');
      triggerParticles('heart');
    } else if (action === 'sparkle') {
      playSoundEffect('sparkle');
      triggerParticles('sparkle');
    } else if (action === 'high_five') {
      playSoundEffect('high_five');
      triggerParticles('high_five');
    } else if (action === 'photo_countdown') {
      startCountdown();
    }

    onSendActivity?.(action);
  };

  return (
    <>
      {/* Action Toolbar Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => handleTriggerAction('heart')}
          className="min-h-[44px] bg-pink text-yellow border-4 border-pink hover:border-yellow px-3 py-2 text-sm font-black uppercase cursor-pointer"
        >
          Send Heart
        </button>

        <button
          type="button"
          onClick={() => handleTriggerAction('sparkle')}
          className="min-h-[44px] bg-yellow text-blue border-4 border-yellow hover:border-amber px-3 py-2 text-sm font-black uppercase cursor-pointer"
        >
          Sparkle
        </button>

        <button
          type="button"
          onClick={() => handleTriggerAction('high_five')}
          className="min-h-[44px] bg-amber text-blue border-4 border-amber hover:border-yellow px-3 py-2 text-sm font-black uppercase cursor-pointer"
        >
          High Five!
        </button>

        <button
          type="button"
          onClick={() => handleTriggerAction('photo_countdown')}
          className="min-h-[44px] bg-blue text-yellow border-4 border-amber hover:border-yellow px-3 py-2 text-sm font-black uppercase cursor-pointer"
        >
          Duo Photo
        </button>
      </div>

      {/* Synchronized 3-2-1 Countdown Overlay */}
      {countdown !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="border-4 border-yellow bg-pink p-8 text-center animate-bounce">
            <span className="text-6xl font-black text-yellow tracking-widest uppercase block">
              {countdown}
            </span>
            <span className="text-lg font-black text-yellow uppercase mt-2 block">
              Pose Together!
            </span>
          </div>
        </div>
      )}

      {/* Floating 4-Color Particles Overlay */}
      {particles.length > 0 && (
        <div className="fixed inset-0 z-40 pointer-events-none overflow-hidden">
          {particles.map((p) => (
            <div
              key={p.id}
              style={{
                left: `${p.x}%`,
                top: `${p.y}%`,
                transform: 'translate(-50%, -50%)',
              }}
              className="absolute animate-ping"
            >
              {p.type === 'heart' ? (
                <svg
                  width={p.size}
                  height={p.size}
                  viewBox="0 0 24 24"
                  fill={p.color}
                  className="drop-shadow"
                >
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
              ) : (
                <svg
                  width={p.size}
                  height={p.size}
                  viewBox="0 0 24 24"
                  fill={p.color}
                >
                  <polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9" />
                </svg>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Captured Polaroid Modal */}
      {polaroidUrl && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-blue"
        >
          <div className="border-4 border-amber p-6 bg-blue max-w-lg w-full text-center space-y-4">
            <h3 className="text-2xl font-black text-yellow uppercase">
              Duo Moment Captured!
            </h3>

            {/* Polaroid Snapshot Image */}
            <div className="border-4 border-yellow bg-yellow p-2 inline-block shadow-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={polaroidUrl}
                alt="Captured Betterverse Duo Moment"
                className="w-full max-h-[380px] object-contain border-2 border-amber"
              />
            </div>

            <div className="flex justify-center gap-4 pt-2">
              <a
                href={polaroidUrl}
                download={`betterverse-duo-${roomId}-${Date.now()}.png`}
                className="bg-yellow text-blue border-4 border-yellow hover:border-amber px-6 py-2 text-base font-black uppercase inline-block cursor-pointer"
              >
                Download Polaroid
              </a>
              <button
                type="button"
                onClick={() => setPolaroidUrl(null)}
                className="bg-pink text-yellow border-4 border-pink hover:border-yellow px-6 py-2 text-base font-black uppercase cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
