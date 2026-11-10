'use client';

import { type ThemeId, THEMES } from '@/lib/colors';

interface ThemeSelectorProps {
  currentTheme: ThemeId;
  onSelectTheme: (theme: ThemeId) => void;
}

export default function ThemeSelector({
  currentTheme,
  onSelectTheme,
}: ThemeSelectorProps) {
  const themes: { id: ThemeId; label: string; badge: string; colorDot: string }[] = [
    { id: 'classic', label: 'Retro Duo', badge: 'Blue & Yellow', colorDot: 'bg-yellow' },
    { id: 'cyberCrimson', label: 'Cyber Crimson', badge: 'Black & Red', colorDot: 'bg-crimson' },
    { id: 'bloodMoon', label: 'Blood Moon', badge: 'Maroon & Orange', colorDot: 'bg-orange' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-black uppercase tracking-wider text-amber">
        Palette Theme:
      </span>
      <div className="flex flex-wrap gap-1">
        {themes.map((t) => {
          const isActive = currentTheme === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelectTheme(t.id)}
              className={`px-3 py-1 text-xs font-black uppercase transition-transform flex items-center gap-1.5 cursor-pointer border-2 ${
                isActive
                  ? 'border-yellow bg-yellow text-blue shadow-none scale-105'
                  : 'border-amber bg-blue text-yellow hover:border-yellow'
              }`}
            >
              <span className={`w-2.5 h-2.5 inline-block border border-blue ${t.colorDot}`} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
