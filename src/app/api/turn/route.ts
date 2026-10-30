import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  // 1. Verify caller has a valid Supabase access token
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized: missing authorization bearer token' }, { status: 401 });
  }

  const token = authHeader.replace('Bearer ', '');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ error: 'Supabase configuration missing on server' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, anonKey);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized: invalid token' }, { status: 401 });
  }

  // 2. Fetch short-lived TURN credentials if Metered.ca credentials are configured
  const meteredApiKey = process.env.METERED_API_KEY;
  const meteredAppName = process.env.METERED_APP_NAME;

  if (meteredApiKey && meteredAppName) {
    try {
      const res = await fetch(`https://${meteredAppName}.metered.live/api/v1/turn/credentials?apiKey=${meteredApiKey}`);
      if (res.ok) {
        const iceServers = await res.json();
        return NextResponse.json({
          iceServers,
          hasTurn: true,
        });
      }
    } catch (err) {
      console.warn('Failed to fetch Metered TURN credentials, falling back to STUN:', err);
    }
  }

  // Fallback: STUN only
  const stunUrl = process.env.NEXT_PUBLIC_STUN_SERVER || 'stun:stun.l.google.com:19302';
  return NextResponse.json({
    iceServers: [{ urls: stunUrl }],
    hasTurn: false,
    note: 'Connections across strict mobile / symmetric NATs may require TURN relay.',
  });
}
