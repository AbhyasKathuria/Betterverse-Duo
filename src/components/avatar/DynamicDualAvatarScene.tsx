'use client';

import dynamic from 'next/dynamic';

export const DynamicDualAvatarScene = dynamic(
  () => import('./DualAvatarScene'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full min-h-[480px] bg-blue border-4 border-amber flex items-center justify-center p-6">
        <div className="border-4 border-yellow p-6 bg-blue text-center max-w-sm">
          <h3 className="text-xl font-black text-yellow uppercase mb-2">
            Loading 3D Duo Stage...
          </h3>
          <p className="text-sm font-bold text-amber">
            Initializing WebGL rendering context
          </p>
        </div>
      </div>
    ),
  }
);
