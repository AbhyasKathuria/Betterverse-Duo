// Betterverse Duo - Palette System
// Supports Classic 4-Color Duo, Cyber Crimson, and Blood Moon themes.

export const PALETTE = {
  // Classic Duo
  blue: {
    hex: '#2391FF',
    rgb: 'rgb(35, 145, 255)',
    hexNum: 0x2391ff,
    r: 35,
    g: 145,
    b: 255,
    role: 'Classic sky & retro background',
  },
  yellow: {
    hex: '#FFF83F',
    rgb: 'rgb(255, 248, 63)',
    hexNum: 0xfff83f,
    r: 255,
    g: 248,
    b: 63,
    role: 'Classic text & primary buttons',
  },
  amber: {
    hex: '#FFCD54',
    rgb: 'rgb(255, 205, 84)',
    hexNum: 0xffcd54,
    r: 255,
    g: 205,
    b: 84,
    role: 'Classic surfaces, borders & highlights',
  },
  pink: {
    hex: '#F70063',
    rgb: 'rgb(247, 0, 99)',
    hexNum: 0xf70063,
    r: 247,
    g: 0,
    b: 99,
    role: 'Classic alerts & inverted-hull outlines',
  },

  // Cyber Crimson & Dark Palette
  black: {
    hex: '#000000',
    rgb: 'rgb(0, 0, 0)',
    hexNum: 0x000000,
    r: 0,
    g: 0,
    b: 0,
    role: 'Cyber Noir background, dark hair & deep contrast',
  },
  maroon: {
    hex: '#830000',
    rgb: 'rgb(131, 0, 0)',
    hexNum: 0x830000,
    r: 131,
    g: 0,
    b: 0,
    role: 'Blood Moon background & deep red surfaces',
  },
  darkRed: {
    hex: '#BC0202',
    rgb: 'rgb(188, 2, 2)',
    hexNum: 0xbc0202,
    r: 188,
    g: 2,
    b: 2,
    role: 'Ruby crimson clothing & accent borders',
  },
  red: {
    hex: '#FF0000',
    rgb: 'rgb(255, 0, 0)',
    hexNum: 0xff0000,
    r: 255,
    g: 0,
    b: 0,
    role: 'Pure red alerts & vivid outlines',
  },
  charcoal: {
    hex: '#323232',
    rgb: 'rgb(50, 50, 50)',
    hexNum: 0x323232,
    r: 50,
    g: 50,
    b: 50,
    role: 'Dark slate cards, secondary surfaces & hair',
  },
  crimson: {
    hex: '#FF1E56',
    rgb: 'rgb(255, 30, 86)',
    hexNum: 0xff1e56,
    r: 255,
    g: 30,
    b: 86,
    role: 'Neon crimson pink buttons & facial features',
  },
  orange: {
    hex: '#FFAC41',
    rgb: 'rgb(255, 172, 65)',
    hexNum: 0xffac41,
    r: 255,
    g: 172,
    b: 65,
    role: 'Warm sunset orange text, highlights & avatar skin',
  },
} as const;

export const ALLOWED_HEX = [
  '#2391FF',
  '#FFF83F',
  '#FFCD54',
  '#F70063',
  '#000000',
  '#830000',
  '#BC0202',
  '#FF0000',
  '#323232',
  '#FF1E56',
  '#FFAC41',
] as const;

export const ALLOWED_NUMBERS = [
  0x2391ff,
  0xfff83f,
  0xffcd54,
  0xf70063,
  0x000000,
  0x830000,
  0xbc0202,
  0xff0000,
  0x323232,
  0xff1e56,
  0xffac41,
] as const;

export type PaletteColor = keyof typeof PALETTE;

export type ThemeId = 'classic' | 'cyberCrimson' | 'bloodMoon';

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  ui: {
    bg: string;
    text: string;
    border: string;
    cardBg: string;
    buttonBg: string;
    buttonText: string;
    alertBg: string;
    alertText: string;
  };
  sceneBg: number;
  localAvatar: {
    skin: number;
    hair: number;
    clothing: number;
    facialFeatures: number;
    outline: number;
  };
  remoteAvatar: {
    skin: number;
    hair: number;
    clothing: number;
    facialFeatures: number;
    outline: number;
  };
}

export const THEMES: Record<ThemeId, ThemeConfig> = {
  classic: {
    id: 'classic',
    name: 'Retro Duo',
    ui: {
      bg: 'bg-blue',
      text: 'text-yellow',
      border: 'border-amber',
      cardBg: 'bg-blue',
      buttonBg: 'bg-yellow',
      buttonText: 'text-blue',
      alertBg: 'bg-pink',
      alertText: 'text-yellow',
    },
    sceneBg: 0x2391ff,
    localAvatar: {
      skin: 0xffcd54,          // Amber
      hair: 0xfff83f,          // Yellow
      clothing: 0xf70063,      // Pink
      facialFeatures: 0x2391ff,// Blue
      outline: 0xf70063,       // Pink
    },
    remoteAvatar: {
      skin: 0xffcd54,          // Amber
      hair: 0xf70063,          // Pink (swapped)
      clothing: 0xfff83f,      // Yellow (swapped)
      facialFeatures: 0x2391ff,// Blue
      outline: 0xf70063,       // Pink
    },
  },
  cyberCrimson: {
    id: 'cyberCrimson',
    name: 'Cyber Crimson',
    ui: {
      bg: 'bg-black',
      text: 'text-orange',
      border: 'border-dark-red',
      cardBg: 'bg-charcoal',
      buttonBg: 'bg-crimson',
      buttonText: 'text-black',
      alertBg: 'bg-red',
      alertText: 'text-orange',
    },
    sceneBg: 0x000000,
    localAvatar: {
      skin: 0xffac41,          // Orange
      hair: 0x000000,          // Black
      clothing: 0xbc0202,      // Dark Red
      facialFeatures: 0xff1e56,// Crimson
      outline: 0xff0000,       // Red
    },
    remoteAvatar: {
      skin: 0xffac41,          // Orange
      hair: 0xff1e56,          // Crimson (swapped)
      clothing: 0x323232,      // Charcoal (swapped)
      facialFeatures: 0xff0000,// Red
      outline: 0xbc0202,       // Dark Red
    },
  },
  bloodMoon: {
    id: 'bloodMoon',
    name: 'Blood Moon',
    ui: {
      bg: 'bg-maroon',
      text: 'text-orange',
      border: 'border-crimson',
      cardBg: 'bg-black',
      buttonBg: 'bg-orange',
      buttonText: 'text-maroon',
      alertBg: 'bg-red',
      alertText: 'text-orange',
    },
    sceneBg: 0x830000,
    localAvatar: {
      skin: 0xffcd54,          // Amber
      hair: 0x323232,          // Charcoal
      clothing: 0x830000,      // Maroon
      facialFeatures: 0x000000,// Black
      outline: 0xff1e56,       // Crimson
    },
    remoteAvatar: {
      skin: 0xffac41,          // Orange
      hair: 0x000000,          // Black (swapped)
      clothing: 0xff1e56,      // Crimson (swapped)
      facialFeatures: 0x830000,// Maroon
      outline: 0xff0000,       // Red
    },
  },
};
