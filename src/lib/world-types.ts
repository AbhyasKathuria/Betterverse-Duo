export type WorldId = 'cyberGrid' | 'studioStage' | 'sunsetTerrace' | 'starfieldVoid';

export interface WorldConfig {
  id: WorldId;
  name: string;
  description: string;
  badge: string;
}

export const WORLDS: Record<WorldId, WorldConfig> = {
  cyberGrid: {
    id: 'cyberGrid',
    name: 'Cyber Grid',
    description: 'Infinite perspective neon grid with cyber monoliths',
    badge: 'Matrix Horizon',
  },
  studioStage: {
    id: 'studioStage',
    name: 'Studio Stage',
    description: 'Sleek architectural pedestal with geometric rings',
    badge: 'Pro Pedestal',
  },
  sunsetTerrace: {
    id: 'sunsetTerrace',
    name: 'Sunset Terrace',
    description: 'Open sky terrace with low-poly horizon sun disc',
    badge: 'Warm Sky',
  },
  starfieldVoid: {
    id: 'starfieldVoid',
    name: 'Cosmic Void',
    description: 'Floating zero-G geometric crystals and starfield',
    badge: 'Deep Space',
  },
};
