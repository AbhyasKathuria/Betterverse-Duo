'use client';

import { type WorldId, WORLDS } from '@/lib/world-types';

interface WorldSelectorProps {
  currentWorld: WorldId;
  onSelectWorld: (world: WorldId) => void;
}

export default function WorldSelector({
  currentWorld,
  onSelectWorld,
}: WorldSelectorProps) {
  const worldList: { id: WorldId; label: string }[] = [
    { id: 'cyberGrid', label: 'Cyber Grid' },
    { id: 'studioStage', label: 'Studio Stage' },
    { id: 'sunsetTerrace', label: 'Sunset Terrace' },
    { id: 'starfieldVoid', label: 'Cosmic Void' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-black uppercase tracking-wider text-amber">
        3D World:
      </span>
      <div className="flex flex-wrap gap-1">
        {worldList.map((w) => {
          const isActive = currentWorld === w.id;
          return (
            <button
              key={w.id}
              type="button"
              onClick={() => onSelectWorld(w.id)}
              className={`px-3 py-1 text-xs font-black uppercase transition-transform cursor-pointer border-2 ${
                isActive
                  ? 'border-yellow bg-yellow text-blue shadow-none scale-105'
                  : 'border-amber bg-blue text-yellow hover:border-yellow'
              }`}
            >
              {w.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
