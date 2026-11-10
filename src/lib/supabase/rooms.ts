import { getSupabase } from './client';

export type RoomErrorType =
  | 'not_authenticated'
  | 'room_not_found'
  | 'room_full'
  | 'invalid_room_id'
  | 'network_error';

export function mapRoomError(err: unknown): { type: RoomErrorType; message: string } {
  const msg = err instanceof Error ? err.message : String(err);

  if (msg.includes('not_authenticated')) {
    return {
      type: 'not_authenticated',
      message: 'Authentication required. Please sign in with email or continue as guest.',
    };
  }
  if (msg.includes('room_not_found')) {
    return {
      type: 'room_not_found',
      message: 'This room does not exist. Please verify your room code or create a new room.',
    };
  }
  if (msg.includes('room_full')) {
    return {
      type: 'room_full',
      message: 'This room is full. Betterverse Duo rooms allow a maximum of 2 participants.',
    };
  }
  if (msg.includes('invalid_room_id')) {
    return {
      type: 'invalid_room_id',
      message: 'Invalid room code format. Room codes must be at least 10 alphanumeric characters.',
    };
  }

  return {
    type: 'network_error',
    message: msg || 'Unable to connect to room server. Please check your network.',
  };
}

export async function createRoomRpc(roomId: string): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('create_room', { p_room_id: roomId });
  if (error) {
    const msg = error.message?.toLowerCase() || '';
    // If room already exists or conflict occurred (409), cleanly rejoin
    if (
      error.code === '23505' ||
      msg.includes('duplicate') ||
      msg.includes('conflict') ||
      msg.includes('already exists')
    ) {
      return joinRoomRpc(roomId);
    }
    throw new Error(error.message);
  }
  return data as string;
}

export async function joinRoomRpc(roomId: string): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('join_room', { p_room_id: roomId });
  if (error) throw new Error(error.message);
  return data as string;
}
