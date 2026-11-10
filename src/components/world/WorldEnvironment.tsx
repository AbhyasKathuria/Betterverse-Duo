'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { WorldId } from '@/lib/world-types';
import type { ThemeId } from '@/lib/colors';

interface WorldEnvironmentProps {
  worldId: WorldId;
  theme?: ThemeId;
}

export default function WorldEnvironment({ worldId, theme = 'classic' }: WorldEnvironmentProps) {
  const isDark = theme === 'cyberCrimson' || theme === 'bloodMoon';

  // Primary accent colors derived from palette
  const gridColor1 = isDark ? 0xbc0202 : 0xffcd54;
  const gridColor2 = isDark ? 0xff1e56 : 0xfff83f;
  const monolithColor = isDark ? 0x323232 : 0xffcd54;
  const ringColor = isDark ? 0xffac41 : 0xfff83f;
  const sunColor = isDark ? 0xff1e56 : 0xfff83f;

  const rotatingGroupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (rotatingGroupRef.current) {
      rotatingGroupRef.current.rotation.y += delta * 0.15;
    }
  });

  // World 1: Cyber Grid
  const cyberGrid = useMemo(() => {
    const grid = new THREE.GridHelper(30, 30, gridColor2, gridColor1);
    grid.position.y = 0;
    return grid;
  }, [gridColor1, gridColor2]);

  // World 2: Studio Stage Pedestal
  const studioRings = useMemo(() => {
    const rings: THREE.LineSegments[] = [];
    const radiuses = [1.2, 1.8, 2.4, 3.2];
    for (const r of radiuses) {
      const circleGeom = new THREE.RingGeometry(r - 0.02, r, 64);
      const edges = new THREE.EdgesGeometry(circleGeom);
      const line = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: ringColor, toneMapped: false })
      );
      line.rotation.x = -Math.PI / 2;
      line.position.y = 0.01;
      rings.push(line);
    }
    return rings;
  }, [ringColor]);

  // World 3: Sunset Terrace
  const terraceElements = useMemo(() => {
    // Stepped low-poly sun disc in background
    const sunGeom = new THREE.CircleGeometry(2.5, 32);
    const sunMat = new THREE.MeshBasicMaterial({
      color: sunColor,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const sunMesh = new THREE.Mesh(sunGeom, sunMat);
    sunMesh.position.set(0, 2.2, -6.0);

    // Horizon terrace railing wireframe
    const railBox = new THREE.BoxGeometry(8, 0.9, 0.2);
    const railEdges = new THREE.EdgesGeometry(railBox);
    const railLine = new THREE.LineSegments(
      railEdges,
      new THREE.LineBasicMaterial({ color: gridColor1, toneMapped: false })
    );
    railLine.position.set(0, 0.45, -3.5);

    return { sunMesh, railLine };
  }, [sunColor, gridColor1]);

  // World 4: Cosmic Void floating crystals
  const cosmicCrystals = useMemo(() => {
    const crystals: { geom: THREE.BufferGeometry; pos: [number, number, number]; rot: [number, number, number] }[] = [];
    const positions: [number, number, number][] = [
      [-2.2, 1.8, -1.8],
      [2.2, 1.6, -1.5],
      [-1.8, 2.8, -3.0],
      [1.9, 2.6, -2.8],
      [-0.8, 3.2, -4.0],
      [0.9, 3.0, -3.8],
    ];

    for (let i = 0; i < positions.length; i++) {
      const geom = new THREE.OctahedronGeometry(0.35 + (i % 3) * 0.1, 0);
      const edges = new THREE.EdgesGeometry(geom);
      crystals.push({
        geom: edges,
        pos: positions[i],
        rot: [i * 0.4, i * 0.6, i * 0.2],
      });
    }
    return crystals;
  }, []);

  return (
    <group name="world-environment">
      {/* 1. Cyber Grid */}
      {worldId === 'cyberGrid' && (
        <group>
          <primitive object={cyberGrid} />

          {/* Left and Right Cyber Monolith Pillars */}
          <group ref={rotatingGroupRef}>
            <mesh position={[-2.8, 1.8, -1.5]}>
              <boxGeometry args={[0.4, 3.6, 0.4]} />
              <meshBasicMaterial color={monolithColor} wireframe toneMapped={false} />
            </mesh>
            <mesh position={[2.8, 1.8, -1.5]}>
              <boxGeometry args={[0.4, 3.6, 0.4]} />
              <meshBasicMaterial color={monolithColor} wireframe toneMapped={false} />
            </mesh>
            <mesh position={[-2.0, 2.2, -3.0]}>
              <octahedronGeometry args={[0.6, 0]} />
              <meshBasicMaterial color={gridColor2} wireframe toneMapped={false} />
            </mesh>
            <mesh position={[2.0, 2.2, -3.0]}>
              <octahedronGeometry args={[0.6, 0]} />
              <meshBasicMaterial color={gridColor2} wireframe toneMapped={false} />
            </mesh>
          </group>
        </group>
      )}

      {/* 2. Studio Stage */}
      {worldId === 'studioStage' && (
        <group>
          {/* Central circular stage pedestal */}
          <mesh position={[0, -0.05, 0]}>
            <cylinderGeometry args={[2.0, 2.1, 0.1, 32]} />
            <meshBasicMaterial color={monolithColor} toneMapped={false} />
          </mesh>

          {/* Concentric rings */}
          {studioRings.map((ring, idx) => (
            <primitive key={idx} object={ring} />
          ))}

          {/* Background architectural arch */}
          <mesh position={[0, 2.0, -3.0]}>
            <torusGeometry args={[2.2, 0.05, 8, 32, Math.PI]} />
            <meshBasicMaterial color={ringColor} toneMapped={false} />
          </mesh>
        </group>
      )}

      {/* 3. Sunset Terrace */}
      {worldId === 'sunsetTerrace' && (
        <group>
          {/* Ground decking */}
          <mesh position={[0, -0.05, 0]}>
            <boxGeometry args={[10, 0.1, 8]} />
            <meshBasicMaterial color={monolithColor} toneMapped={false} />
          </mesh>

          {/* Sun disc & railing */}
          <primitive object={terraceElements.sunMesh} />
          <primitive object={terraceElements.railLine} />

          {/* Terrace side pillars */}
          <mesh position={[-3.8, 1.5, -2.5]}>
            <boxGeometry args={[0.3, 3.0, 0.3]} />
            <meshBasicMaterial color={gridColor1} toneMapped={false} />
          </mesh>
          <mesh position={[3.8, 1.5, -2.5]}>
            <boxGeometry args={[0.3, 3.0, 0.3]} />
            <meshBasicMaterial color={gridColor1} toneMapped={false} />
          </mesh>
        </group>
      )}

      {/* 4. Cosmic Void */}
      {worldId === 'starfieldVoid' && (
        <group ref={rotatingGroupRef}>
          {cosmicCrystals.map((c, idx) => (
            <lineSegments
              key={idx}
              geometry={c.geom}
              position={c.pos}
              rotation={c.rot}
            >
              <lineBasicMaterial
                color={idx % 2 === 0 ? gridColor1 : gridColor2}
                toneMapped={false}
              />
            </lineSegments>
          ))}

          {/* Floating zero-G platform disc */}
          <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.8, 1.6, 24]} />
            <meshBasicMaterial color={ringColor} wireframe toneMapped={false} />
          </mesh>
        </group>
      )}
    </group>
  );
}
