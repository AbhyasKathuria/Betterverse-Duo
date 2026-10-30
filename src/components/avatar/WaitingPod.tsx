'use client';

import { useMemo } from 'react';
import * as THREE from 'three';

export default function WaitingPod() {
  const edgesGeometry = useMemo(() => {
    // 3D outline pod representing an empty avatar berth
    const box = new THREE.BoxGeometry(0.7, 1.4, 0.7);
    return new THREE.EdgesGeometry(box);
  }, []);

  return (
    <group position={[0, 1.1, 0]}>
      {/* Amber outline wireframe - zero transparency */}
      <lineSegments geometry={edgesGeometry}>
        <lineBasicMaterial color={0xffcd54} toneMapped={false} />
      </lineSegments>
    </group>
  );
}
