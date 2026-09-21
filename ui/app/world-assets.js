// Civilization World Atlas asset semantics.
// Copyright (C) 2026 Ann Kelner. AGPL-3.0-or-later.

/** Shared contact shadow for sprites placed on land. */
export const LAND_GROUND_SHADOW = Object.freeze({
  offsetY: 5,
  widthRatio: 0.72,
  heightRatio: 0.16,
  alpha: 0.24,
});

const centerBottom = Object.freeze({ x: 0.5, y: 0.92 });
const center = Object.freeze({ x: 0.5, y: 0.5 });

/** One role and placement policy for every sprite used by the atlas. */
export const WORLD_ASSETS = Object.freeze({
  academy: Object.freeze({
    src: 'assets/university.png',
    enabled: true,
    // Measured on 2026-09-14 against the shipped sprite: 48.0% of pixels are
    // fully transparent, so the silhouette is tight and no matte can show.
    measuredTransparentShare: 0.48,
    kind: 'landmark',
    allowedSurface: 'land',
    anchor: centerBottom,
    displayWidth: 112,
    alphaThreshold: 16,
    groundShadow: LAND_GROUND_SHADOW,
    z: 40,
  }),
  town: Object.freeze({
    src: 'assets/generated/world-town.png',
    enabled: true,
    // Measured after matte cleanup on 2026-09-14 (alpha<64 zeroed, cropped).
    measuredTransparentShare: 0.541,
    kind: 'settlement',
    allowedSurface: 'land',
    anchor: centerBottom,
    displayWidth: 56,
    alphaThreshold: 16,
    groundShadow: LAND_GROUND_SHADOW,
    z: 30,
  }),
  farm: Object.freeze({
    src: 'assets/generated/world-farm.png',
    enabled: true,
    // Measured after matte cleanup on 2026-09-14 (alpha<64 zeroed, cropped).
    measuredTransparentShare: 0.626,
    kind: 'landmark',
    allowedSurface: 'land',
    anchor: centerBottom,
    displayWidth: 90,
    alphaThreshold: 16,
    groundShadow: LAND_GROUND_SHADOW,
    z: 20,
  }),
  quarry: Object.freeze({
    src: 'assets/generated/world-quarry.png',
    enabled: true,
    // Measured after matte cleanup on 2026-09-14 (alpha<64 zeroed, cropped).
    measuredTransparentShare: 0.435,
    kind: 'landmark',
    allowedSurface: 'land',
    anchor: centerBottom,
    displayWidth: 88,
    alphaThreshold: 16,
    groundShadow: LAND_GROUND_SHADOW,
    z: 20,
  }),
  scriptorium: Object.freeze({
    src: 'assets/generated/world-scriptorium.png',
    enabled: true,
    // Measured after matte cleanup on 2026-09-14 (alpha<64 zeroed, cropped).
    measuredTransparentShare: 0.434,
    kind: 'landmark',
    allowedSurface: 'land',
    anchor: centerBottom,
    displayWidth: 66,
    alphaThreshold: 16,
    groundShadow: LAND_GROUND_SHADOW,
    z: 30,
  }),
  shrine: Object.freeze({
    src: 'assets/generated/world-shrine.png',
    enabled: true,
    // Measured after matte cleanup on 2026-09-14 (alpha<64 zeroed, cropped).
    measuredTransparentShare: 0.587,
    kind: 'landmark',
    allowedSurface: 'land',
    anchor: centerBottom,
    displayWidth: 54,
    alphaThreshold: 16,
    groundShadow: LAND_GROUND_SHADOW,
    z: 30,
  }),
  ward: Object.freeze({
    src: 'assets/generated/world-ward.png',
    enabled: true,
    // Measured after matte cleanup on 2026-09-14 (alpha<64 zeroed, cropped).
    measuredTransparentShare: 0.372,
    kind: 'overlay',
    allowedSurface: 'overlay',
    anchor: center,
    displayWidth: 168,
    alphaThreshold: 8,
    groundShadow: null,
    z: 50,
    stateGate: 'protective-ward',
  }),
  ley: Object.freeze({
    src: 'assets/generated/world-ley.png',
    enabled: false,
    rejected: 'replaced-by-procedural-vector-ley-nexus',
    kind: 'overlay',
    allowedSurface: 'overlay',
    anchor: center,
    displayWidth: 64,
    alphaThreshold: 8,
    groundShadow: null,
    z: 10,
    stateGate: 'known-magic',
  }),
});

const alphaBounds = new WeakMap();

function readImagePixels(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height).data;
}

function cacheAlphaBounds(image, asset, pixelReader) {
  if (!image.naturalWidth || !image.naturalHeight) return;
  const pixels = pixelReader(image);
  let left = image.naturalWidth;
  let top = image.naturalHeight;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < image.naturalHeight; y += 1) {
    for (let x = 0; x < image.naturalWidth; x += 1) {
      if (pixels[(y * image.naturalWidth + x) * 4 + 3] < asset.alphaThreshold) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  alphaBounds.set(image, right < left ? null : {
    x: left,
    y: top,
    width: right - left + 1,
    height: bottom - top + 1,
  });
}

/** Return the cached visible-pixel footprint for a loaded image. */
export function alphaBoundsFor(image) {
  return alphaBounds.get(image);
}

/** Load exactly the images declared by the manifest and cache their footprints. */
export function loadWorldAssets(
  imageFactory = (asset) => {
    const image = new Image();
    image.src = asset.src;
    return image;
  },
  pixelReader = readImagePixels,
) {
  return Object.fromEntries(Object.entries(WORLD_ASSETS).filter(([, asset]) => asset.enabled).map(([name, asset]) => {
    const image = imageFactory(asset);
    const cache = () => cacheAlphaBounds(image, asset, pixelReader);
    if (image.complete) cache();
    else image.addEventListener('load', cache, { once: true });
    return [name, image];
  }));
}
