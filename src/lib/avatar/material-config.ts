import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { ALLOWED_NUMBERS } from '@/lib/colors';

// Strict 4-color palette mapping for local avatar
export const LOCAL_AVATAR_COLOR_MAP = {
  skin: ALLOWED_NUMBERS[2],          // Amber: 0xffcd54
  hair: ALLOWED_NUMBERS[1],          // Yellow: 0xfff83f
  clothing: ALLOWED_NUMBERS[3],      // Pink: 0xf70063
  facialFeatures: ALLOWED_NUMBERS[0],// Blue: 0x2391ff
  outline: ALLOWED_NUMBERS[3],       // Pink: 0xf70063
} as const;

// Strict 4-color palette mapping for remote partner avatar
// Hair and Clothing swapped so local and partner avatars are visually distinct
export const REMOTE_AVATAR_COLOR_MAP = {
  skin: ALLOWED_NUMBERS[2],          // Amber: 0xffcd54
  hair: ALLOWED_NUMBERS[3],          // Pink: 0xf70063 (swapped)
  clothing: ALLOWED_NUMBERS[1],      // Yellow: 0xfff83f (swapped)
  facialFeatures: ALLOWED_NUMBERS[0],// Blue: 0x2391ff
  outline: ALLOWED_NUMBERS[3],       // Pink: 0xf70063
} as const;

export type AvatarSlot = keyof typeof LOCAL_AVATAR_COLOR_MAP;

export function classifyMaterialSlot(materialName: string, meshName: string): AvatarSlot {
  const combined = `${materialName} ${meshName}`.toLowerCase();

  if (combined.includes('hair') || combined.includes('bang') || combined.includes('pigtail') || combined.includes('ahoge')) {
    return 'hair';
  }

  if (
    combined.includes('eye') ||
    combined.includes('iris') ||
    combined.includes('highlight') ||
    combined.includes('brow') ||
    combined.includes('lash') ||
    combined.includes('mouth') ||
    combined.includes('teeth') ||
    combined.includes('tongue') ||
    combined.includes('pupil')
  ) {
    return 'facialFeatures';
  }

  if (
    combined.includes('skin') ||
    combined.includes('face') ||
    combined.includes('body') ||
    combined.includes('head') ||
    combined.includes('hand') ||
    combined.includes('arm') ||
    combined.includes('neck')
  ) {
    return 'skin';
  }

  return 'clothing';
}

function disposeMaterialTextures(mat: THREE.Material): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyMat = mat as any;
  const textureSlots = [
    'map',
    'normalMap',
    'roughnessMap',
    'metalnessMap',
    'emissiveMap',
    'bumpMap',
    'displacementMap',
    'alphaMap',
    'shadeMultiplyTexture',
    'rimMultiplyTexture',
    'outlineWidthMultiplyTexture',
  ];

  for (const slot of textureSlots) {
    if (anyMat[slot] && typeof anyMat[slot].dispose === 'function') {
      anyMat[slot].dispose();
      anyMat[slot] = null;
    }
  }
}

export function applyPaletteMaterials(vrm: VRM, isRemote = false): void {
  const colorMap = isRemote ? REMOTE_AVATAR_COLOR_MAP : LOCAL_AVATAR_COLOR_MAP;
  const meshesToOutline: (THREE.Mesh | THREE.SkinnedMesh)[] = [];

  vrm.scene.traverse((obj) => {
    if (obj.userData?.isOutline) return;

    if (obj instanceof THREE.Mesh) {
      const oldMaterials = Array.isArray(obj.material) ? obj.material : [obj.material];
      const newMaterials: THREE.MeshBasicMaterial[] = [];

      for (const oldMat of oldMaterials) {
        if (!oldMat) continue;

        const slot = classifyMaterialSlot(oldMat.name || '', obj.name || '');
        const targetHex = colorMap[slot];

        disposeMaterialTextures(oldMat);
        oldMat.dispose();

        const newMat = new THREE.MeshBasicMaterial({
          color: targetHex,
          toneMapped: false,
          wireframe: false,
        });

        newMaterials.push(newMat);
      }

      obj.material = Array.isArray(obj.material) ? newMaterials : newMaterials[0];
      meshesToOutline.push(obj);
    }
  });

  // Construct Inverted-Hull Pink Outlines
  for (const originalMesh of meshesToOutline) {
    const outlineMat = new THREE.MeshBasicMaterial({
      color: colorMap.outline, // Pink: 0xf70063
      side: THREE.BackSide,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: 1.0,
      polygonOffsetUnits: 4.0,
    });

    let outlineMesh: THREE.Mesh;
    if (originalMesh instanceof THREE.SkinnedMesh) {
      const skinnedOutline = new THREE.SkinnedMesh(originalMesh.geometry, outlineMat);
      skinnedOutline.bind(originalMesh.skeleton, originalMesh.bindMatrix);
      outlineMesh = skinnedOutline;
    } else {
      outlineMesh = new THREE.Mesh(originalMesh.geometry, outlineMat);
    }

    outlineMesh.name = `${originalMesh.name}_outline`;
    outlineMesh.userData.isOutline = true;
    outlineMesh.scale.set(1.008, 1.008, 1.008);

    originalMesh.add(outlineMesh);
  }
}
