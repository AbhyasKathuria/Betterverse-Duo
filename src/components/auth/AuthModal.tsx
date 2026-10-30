'use client';

import { useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';

interface AuthModalProps {
  onSuccess: () => void;
}

export default function AuthModal({ onSuccess }: AuthModalProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isGuestEnabled = process.env.NEXT_PUBLIC_ENABLE_GUEST === 'true';

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const supabase = getSupabase();
      const redirectUrl = typeof window !== 'undefined' ? window.location.href : undefined;

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectUrl,
        },
      });

      if (error) throw error;
      setMagicLinkSent(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGuestSignIn = async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const supabase = getSupabase();
      const { error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-blue"
    >
      <div className="border-4 border-amber p-8 bg-blue max-w-md w-full text-center space-y-6">
        <div>
          <span className="text-amber text-xs font-black uppercase tracking-widest block mb-1">
            2-Person Private Room
          </span>
          <h2 id="auth-modal-title" className="text-3xl font-black text-yellow uppercase">
            Sign In to Enter
          </h2>
          <p className="text-sm font-bold text-yellow mt-2">
            Rooms are private and invite-only. Sign in with a magic link or continue as guest.
          </p>
        </div>

        {magicLinkSent ? (
          <div className="border-4 border-yellow bg-blue p-4 space-y-3">
            <h3 className="text-lg font-black text-yellow uppercase">
              Magic Link Sent!
            </h3>
            <p className="text-sm font-bold text-yellow">
              Check your inbox at <span className="text-amber">{email}</span>. Click the link to step into this private room.
            </p>
            <button
              type="button"
              onClick={() => setMagicLinkSent(false)}
              className="bg-yellow text-blue border-2 border-yellow px-4 py-2 text-xs font-black uppercase cursor-pointer"
            >
              Use Another Method
            </button>
          </div>
        ) : (
          <form onSubmit={handleMagicLink} className="space-y-4 text-left">
            <div>
              <label htmlFor="auth-email-input" className="block text-xs font-black uppercase text-yellow mb-1">
                Your Email Address
              </label>
              <input
                id="auth-email-input"
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="partner@example.com"
                className="w-full bg-blue text-yellow border-4 border-amber px-4 py-3 text-base font-bold placeholder:text-amber"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[44px] bg-yellow text-blue border-4 border-yellow hover:border-amber py-3 px-4 text-base font-black uppercase cursor-pointer"
            >
              {loading ? 'Sending Magic Link...' : 'Send Magic Link'}
            </button>
          </form>
        )}

        {isGuestEnabled && !magicLinkSent && (
          <div className="pt-2 border-t-2 border-amber space-y-3">
            <p className="text-xs font-bold text-amber">
              Fast Testing Option (Bypasses email rate limits):
            </p>
            <button
              type="button"
              onClick={handleGuestSignIn}
              disabled={loading}
              className="w-full min-h-[44px] bg-blue text-yellow border-4 border-amber hover:border-yellow py-3 px-4 text-base font-black uppercase cursor-pointer"
            >
              Continue as Guest
            </button>
          </div>
        )}

        {errorMessage && (
          <div role="alert" className="border-4 border-pink bg-pink p-3 text-xs font-black text-yellow">
            {errorMessage}
          </div>
        )}
      </div>
    </div>
  );
}
