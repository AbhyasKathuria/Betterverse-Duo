export interface PeerPresenceState {
  userId: string;
  peerId: string;
  avatarId: string;
  displayName: string;
}

export type SignalingMessageType = 'offer' | 'answer' | 'ice-candidate' | 'peer-leave';

export interface SignalingPayload {
  type: SignalingMessageType;
  senderPeerId: string;
  targetPeerId: string;
  data: RTCSessionDescriptionInit | RTCIceCandidateInit | null;
}

export interface ControlHelloMessage {
  type: 'hello';
  peerId: string;
  avatarId: string;
  displayName: string;
  capabilities: string[];
}

export interface ControlPingMessage {
  type: 'ping';
  t: number;
}

export interface ControlPongMessage {
  type: 'pong';
  t: number;
}

export interface ControlActivityMessage {
  type: 'activity';
  action: 'heart' | 'sparkle' | 'high_five' | 'photo_countdown';
  timestamp: number;
}

export type ControlMessage =
  | ControlHelloMessage
  | ControlPingMessage
  | ControlPongMessage
  | ControlActivityMessage;

/**
 * Deterministic Role Selection:
 * The peer with the lexicographically smaller peerId creates the offer and DataChannels.
 */
export function isOfferer(localPeerId: string, remotePeerId: string): boolean {
  return localPeerId < remotePeerId;
}

/**
 * Checks if a received sequence number is newer than the last received sequence number,
 * accounting for 16-bit unsigned integer wraparound (0 to 65535).
 */
export function isNewerSequence(newSeq: number, lastSeq: number): boolean {
  if (lastSeq === -1) return true;
  const diff = (newSeq - lastSeq + 65536) % 65536;
  return diff > 0 && diff < 32768;
}
