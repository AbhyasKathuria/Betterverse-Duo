'use client';

import dynamic from 'next/dynamic';

export const DynamicAvatarScene = dynamic(() => import('./AvatarScene'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[440px] bg-blue border-4 border-amber flex flex-col justify-center items-center">
      <div className="p-6 bg-blue border-4 border-amber text-center">
        <h3 className="text-2xl font-black text-yellow uppercase mb-2">
          Initializing 3D Canvas...
        </h3>
        <p className="text-base font-bold text-amber">
          Loading WebGL context and unlit shaders
        </p>
      </div>
    </div>
  ),
});
