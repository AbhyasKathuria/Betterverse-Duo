'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { generateRoomCode, isValidRoomCode, normalizeRoomCode } from '@/lib/room-code';
import AvatarPicker, { AVAILABLE_AVATARS, type AvatarOption } from '@/components/avatar/AvatarPicker';

export default function HomePage() {
  const router = useRouter();
  const [selectedAvatar, setSelectedAvatar] = useState<AvatarOption>(AVAILABLE_AVATARS[0]);
  const [joinInput, setJoinInput] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleCreateRoom = () => {
    const newCode = generateRoomCode();
    router.push(`/room/${newCode}?create=1`);
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const normalized = normalizeRoomCode(joinInput);
    if (!normalized) {
      setErrorMessage('Please enter a room code.');
      return;
    }

    if (!isValidRoomCode(normalized)) {
      setErrorMessage(
        'Invalid room code. Codes must be 10-24 characters and cannot contain look-alike characters (0, O, 1, I, l).'
      );
      return;
    }

    router.push(`/room/${normalized}`);
  };

  return (
    <main className="min-h-screen bg-blue text-yellow p-6 sm:p-12 flex flex-col justify-between">
      {/* Top Header */}
      <header className="border-4 border-amber p-6 mb-8 bg-blue">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-5xl font-black tracking-wider text-yellow">
              BETTERVERSE DUO
            </h1>
            <p className="text-lg sm:text-xl font-bold text-yellow mt-2">
              Private 3D space for two. Mirror your real presence with webcam tracking.
            </p>
          </div>
          <div className="border-4 border-pink bg-pink p-3 text-center sm:text-right">
            <span className="text-yellow text-base font-black tracking-wide uppercase">
              V1 Prototype
            </span>
          </div>
        </div>
      </header>

      {/* Pre-Room Avatar Selector */}
      <section className="border-4 border-amber p-4 mb-8 bg-blue flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-amber text-xs font-black uppercase tracking-wider block">
            Avatar Identity
          </span>
          <span className="text-yellow text-sm font-bold">
            Select your 3D avatar before entering:
          </span>
        </div>
        <AvatarPicker
          selectedId={selectedAvatar.id}
          onSelect={setSelectedAvatar}
        />
      </section>

      {/* Main Action Section */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-8 my-auto">
        {/* Card 1: Create a Room */}
        <div className="border-4 border-amber p-8 bg-blue flex flex-col justify-between">
          <div>
            <span className="text-amber text-lg font-black tracking-widest uppercase">
              Option 1
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-yellow mt-2 mb-4">
              Create New Room
            </h2>
            <p className="text-base sm:text-lg text-yellow font-bold mb-6">
              Generate a secure, private room code. Share the invite code with your partner to start your session together.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCreateRoom}
            className="w-full bg-yellow text-blue border-4 border-yellow hover:border-amber py-4 px-6 text-xl font-black tracking-wide uppercase"
          >
            Create Private Room
          </button>
        </div>

        {/* Card 2: Join Existing Room */}
        <div className="border-4 border-amber p-8 bg-blue flex flex-col justify-between">
          <div>
            <span className="text-amber text-lg font-black tracking-widest uppercase">
              Option 2
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-yellow mt-2 mb-4">
              Join Partner&apos;s Room
            </h2>
            <p className="text-base sm:text-lg text-yellow font-bold mb-4">
              Enter the room code shared by your partner to step into the room together.
            </p>

            <form onSubmit={handleJoinRoom} className="space-y-4">
              <div>
                <label htmlFor="room-code-input" className="block text-base font-bold text-yellow mb-2">
                  Room Code (minimum 10 characters)
                </label>
                <input
                  id="room-code-input"
                  type="text"
                  value={joinInput}
                  onChange={(e) => {
                    setJoinInput(e.target.value);
                    if (errorMessage) setErrorMessage('');
                  }}
                  placeholder="e.g. 7X9K2P4M8W3Q"
                  className="w-full bg-blue text-yellow border-4 border-amber px-4 py-3 text-lg font-bold placeholder:text-amber uppercase"
                />
              </div>

              {errorMessage && (
                <div
                  role="alert"
                  className="border-4 border-pink bg-pink p-4 text-yellow text-base font-black"
                >
                  {errorMessage}
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-yellow text-blue border-4 border-yellow hover:border-amber py-4 px-6 text-xl font-black tracking-wide uppercase"
              >
                Join Room
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* Safety & Privacy Notice */}
      <footer className="border-4 border-amber p-6 mt-8 bg-blue">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="max-w-3xl">
            <h3 className="text-lg font-black text-yellow uppercase tracking-wider mb-1">
              Privacy First Architecture
            </h3>
            <p className="text-base font-bold text-yellow">
              Webcam video never leaves your computer. MediaPipe processes body and hand landmarks locally in your browser. No photos or video streams are ever stored on servers.
            </p>
          </div>
          <div className="border-4 border-amber p-2 text-center">
            <span className="text-amber text-sm font-black uppercase">
              2-Person Encrypted P2P
            </span>
          </div>
        </div>
      </footer>
    </main>
  );
}
