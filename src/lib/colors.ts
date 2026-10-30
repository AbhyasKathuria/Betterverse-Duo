// Betterverse Duo - Strict 4-Color Palette System
// Only Blue, Yellow, Amber, and Pink are permitted across UI, 3D, and tracking.

export const PALETTE = {
  blue: {
    hex: '#2391FF',
    rgb: 'rgb(35, 145, 255)',
    hexNum: 0x2391ff,
    r: 35,
    g: 145,
    b: 255,
    role: 'Main background and scene sky',
  },
  yellow: {
    hex: '#FFF83F',
    rgb: 'rgb(255, 248, 63)',
    hexNum: 0xfff83f,
    r: 255,
    g: 248,
    b: 63,
    role: 'Primary text and primary buttons',
  },
  amber: {
    hex: '#FFCD54',
    rgb: 'rgb(255, 205, 84)',
    hexNum: 0xffcd54,
    r: 255,
    g: 205,
    b: 84,
    role: 'Secondary surfaces and highlights',
  },
  pink: {
    hex: '#F70063',
    rgb: 'rgb(247, 0, 99)',
    hexNum: 0xf70063,
    r: 247,
    g: 0,
    b: 99,
    role: 'Alerts, leave/block actions, and live-tracking indicator',
  },
} as const;

export const ALLOWED_HEX = ['#2391FF', '#FFF83F', '#FFCD54', '#F70063'] as const;
export const ALLOWED_NUMBERS = [0x2391ff, 0xfff83f, 0xffcd54, 0xf70063] as const;

export type PaletteColor = keyof typeof PALETTE;
