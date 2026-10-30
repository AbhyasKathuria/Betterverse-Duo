'use client';

import { useEffect, useState } from 'react';

export interface AvatarOption {
  id: string;
  name: string;
  vrmUrl: string;
  version: string;
}

export const AVAILABLE_AVATARS: AvatarOption[] = [
  {
    id: 'seed-san',
    name: 'Seed-san',
    vrmUrl: '/avatars/seed-san.vrm',
    version: 'VRM 1.0',
  },
  {
    id: 'twist-sample',
    name: 'Twist Sample',
    vrmUrl: '/avatars/twist-sample.vrm',
    version: 'VRM 1.0',
  },
  {
    id: 'alicia-solid',
    name: 'Alicia Solid',
    vrmUrl: '/avatars/alicia-solid.vrm',
    version: 'VRM 0.x',
  },
];

interface AvatarPickerProps {
  selectedId: string;
  onSelect: (avatar: AvatarOption) => void;
}

export default function AvatarPicker({ selectedId, onSelect }: AvatarPickerProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const savedId = localStorage.getItem('betterverse_avatar_id');
      if (savedId) {
        const found = AVAILABLE_AVATARS.find((a) => a.id === savedId);
        if (found && found.id !== selectedId) {
          onSelect(found);
        }
      }
    } catch {
      // localStorage may be disabled or restricted
    }
  }, [onSelect, selectedId]);

  const handleSelect = (avatar: AvatarOption) => {
    try {
      localStorage.setItem('betterverse_avatar_id', avatar.id);
    } catch {
      // Ignored
    }
    onSelect(avatar);
  };

  if (!mounted) return null;

  return (
    <div
      role="radiogroup"
      aria-label="Select 3D Avatar"
      className="flex flex-wrap items-center gap-2"
    >
      <span className="text-amber text-xs font-black uppercase tracking-wider mr-1">
        Avatar:
      </span>

      {AVAILABLE_AVATARS.map((avatar) => {
        const isSelected = avatar.id === selectedId;

        return (
          <button
            key={avatar.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => handleSelect(avatar)}
            className={`min-h-[44px] px-4 py-2 text-sm font-black uppercase flex items-center gap-2 transition-none cursor-pointer ${
              isSelected
                ? 'bg-yellow text-blue border-4 border-yellow ring-2 ring-yellow'
                : 'bg-blue text-yellow border-4 border-amber hover:border-yellow'
            }`}
          >
            {isSelected && <span aria-hidden="true" className="text-base font-black">✓</span>}
            <span>{avatar.name}</span>
            <span
              className={`text-xs px-1 border-2 ${
                isSelected ? 'border-blue text-blue' : 'border-amber text-amber'
              }`}
            >
              {avatar.version}
            </span>
          </button>
        );
      })}
    </div>
  );
}
