// Room Code utilities for Betterverse Duo
// Generates unguessable room codes using crypto.getRandomValues
// Excludes look-alike characters: 0, O, o, 1, I, l, i

const SAFE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const ROOM_CODE_REGEX = /^[2-9A-HJ-NP-Za-km-np-z]{10,24}$/;

/**
 * Generates a cryptographically secure, unguessable room code.
 * Defaults to 12 characters from the safe alphabet.
 */
export function generateRoomCode(length = 12): string {
  if (length < 10) {
    throw new Error('Room code length must be at least 10 characters');
  }

  const values = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(values);
  } else {
    // Fallback if imported in node without webcrypto
    const nodeCrypto = require('node:crypto');
    nodeCrypto.randomFillSync(values);
  }

  const alphabetLen = SAFE_ALPHABET.length;
  let code = '';
  for (let i = 0; i < length; i++) {
    code += SAFE_ALPHABET[values[i] % alphabetLen];
  }
  return code;
}

/**
 * Normalizes user input (strips spaces and hyphens).
 */
export function normalizeRoomCode(input: string): string {
  return input.trim().replace(/[-\s]/g, '');
}

/**
 * Validates whether a room code is formatted correctly.
 * Must be at least 10 characters long and contain only safe characters.
 */
export function isValidRoomCode(code: string): boolean {
  if (!code) return false;
  const normalized = normalizeRoomCode(code);
  return ROOM_CODE_REGEX.test(normalized);
}
