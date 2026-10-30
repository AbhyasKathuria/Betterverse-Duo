import { Suspense } from 'react';
import Link from 'next/link';
import { isValidRoomCode, normalizeRoomCode } from '@/lib/room-code';
import RoomView from './RoomView';

async function RoomContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const normalizedId = normalizeRoomCode(id);
  const isValid = isValidRoomCode(normalizedId);

  if (!isValid) {
    return (
      <main className="min-h-screen bg-blue text-yellow p-6 sm:p-12 flex flex-col justify-center items-center">
        <div className="border-4 border-pink bg-pink p-8 max-w-lg w-full text-center">
          <h1 className="text-3xl font-black text-yellow mb-4 uppercase">
            Invalid Room Code
          </h1>
          <p className="text-lg font-bold text-yellow mb-6">
            The code &ldquo;{id}&rdquo; is invalid. Room codes must be at least 10 valid characters and cannot contain look-alikes (0, O, 1, I, l).
          </p>
          <Link
            href="/"
            className="inline-block bg-yellow text-blue border-4 border-yellow hover:border-amber px-6 py-3 text-lg font-black uppercase"
          >
            Return to Home
          </Link>
        </div>
      </main>
    );
  }

  return <RoomView roomId={normalizedId} />;
}

export default function RoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-blue text-yellow p-6 sm:p-12 flex flex-col justify-center items-center">
          <div className="border-4 border-amber p-8 max-w-lg w-full text-center bg-blue">
            <h1 className="text-2xl font-black text-yellow uppercase mb-2">
              Entering Room...
            </h1>
            <p className="text-base font-bold text-amber">
              Verifying room security parameters
            </p>
          </div>
        </main>
      }
    >
      <RoomContent params={params} />
    </Suspense>
  );
}
