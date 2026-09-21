// Canonical geometry for the civilization world atlas.
// Copyright (C) 2026 Ann Kelner. AGPL-3.0-or-later.

export const RIVER_LEFT = Object.freeze([[382,209],[352,265],[359,321],[331,373],[343,431],[319,494],[332,556],[305,619],[322,681],[298,744],[302,862]].map(Object.freeze));
export const RIVER_RIGHT = Object.freeze([[476,209],[450,272],[462,330],[434,385],[449,445],[423,507],[440,570],[413,633],[434,698],[411,765],[425,862]].map(Object.freeze));

function bankAt(points, y) {
  if (y <= points[0][1]) return points[0][0];
  for (let index = 1; index < points.length; index += 1) {
    if (y <= points[index][1]) {
      const [ax, ay] = points[index - 1];
      const [bx, by] = points[index];
      return ax + ((bx - ax) * (y - ay)) / (by - ay);
    }
  }
  return points.at(-1)[0];
}

export function riverBanksAt(y) {
  return { left: bankAt(RIVER_LEFT, y), right: bankAt(RIVER_RIGHT, y) };
}

export function isWaterPoint(x, y, padding = 0) {
  if (y < RIVER_LEFT[0][1] || y > RIVER_LEFT.at(-1)[1]) return false;
  const { left, right } = riverBanksAt(y);
  return x >= left - padding && x <= right + padding;
}

export function footprintIntersectsRiver(footprint, inflation = 0) {
  // Bank clearance expands the footprint toward the banks. The river flows
  // vertically through the atlas, so extending its y-span would reject safe
  // diagonal placements more conservatively than the requested clearance.
  const halfWidth = footprint.width / 2 + inflation;
  const halfHeight = footprint.height / 2;
  const top = footprint.y - halfHeight;
  const bottom = footprint.y + halfHeight;
  if (bottom < RIVER_LEFT[0][1] || top > RIVER_LEFT.at(-1)[1]) return false;

  const sampleYs = new Set([
    Math.max(top, RIVER_LEFT[0][1]),
    Math.min(bottom, RIVER_LEFT.at(-1)[1]),
    ...RIVER_LEFT.map(([, y]) => y).filter((y) => y > top && y < bottom),
    ...RIVER_RIGHT.map(([, y]) => y).filter((y) => y > top && y < bottom),
  ]);
  const leftEdge = footprint.x - halfWidth;
  const rightEdge = footprint.x + halfWidth;
  return [...sampleYs].some((y) => {
    const banks = riverBanksAt(y);
    return rightEdge >= banks.left && leftEdge <= banks.right;
  });
}

function hash(value) {
  let result = 2166136261;
  for (const character of String(value ?? '')) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function noise(value) {
  let result = hash(value);
  result ^= result << 13;
  result ^= result >>> 17;
  result ^= result << 5;
  return (result >>> 0) / 4294967296;
}

export const DISTANT_HOUSE_CANDIDATES = Object.freeze(Array.from({ length: 34 }, (_, index) => {
  const size = 3.5 + noise(`ds${index}`) * 2;
  return Object.freeze({
    id: `distant-house-${index}`,
    x: 20 + noise(`dx${index}`) * 664,
    y: 253 + noise(`dy${index}`) * 100,
    width: size * 1.24,
    height: size * 1.11,
    surface: 'land',
  });
}));

export const LANDMARK_SOCKETS = Object.freeze({
  academy: Object.freeze({ id: 'academy', x: 270, y: 431, width: 96, height: 72, clearance: 10, surface: 'land' }),
  farm: Object.freeze({ id: 'farm', x: 204, y: 718, width: 90, height: 68, surface: 'land' }),
  quarry: Object.freeze({ id: 'quarry', x: 592, y: 336, width: 88, height: 72, surface: 'land' }),
  scriptorium: Object.freeze({ id: 'scriptorium', x: 500, y: 518, width: 66, height: 58, surface: 'land' }),
  shrine: Object.freeze({ id: 'shrine', x: 531, y: 678, width: 54, height: 50, surface: 'land' }),
  townWest: Object.freeze({ id: 'town-west', x: 147, y: 551, width: 56, height: 48, surface: 'land' }),
  townEast: Object.freeze({ id: 'town-east', x: 507, y: 580, width: 50, height: 44, surface: 'land' }),
  ley: Object.freeze({ id: 'ley', x: 285, y: 556, width: 64, height: 64, surface: 'overlay' }),
  ward: Object.freeze({ id: 'ward', x: 270, y: 431, width: 168, height: 168, surface: 'overlay' }),
});

// The single declared water crossing. Roads terminate at the banks and resume
// on the far side; only this corridor may carry a route over the river.
export const BRIDGE = Object.freeze({ x: 393, y: 443, width: 122, height: 16, angle: 0.1 });

export const ROAD_SEGMENTS = Object.freeze([
  Object.freeze({ id: 'west-main', width: 3.5, points: Object.freeze([[62,572],[143,555],[219,520],[270,431],[335,436]].map(Object.freeze)) }),
  Object.freeze({ id: 'east-main', width: 3.5, points: Object.freeze([[455,443],[502,420],[607,402]].map(Object.freeze)) }),
  Object.freeze({ id: 'south-academy', width: 3.5, points: Object.freeze([[118,808],[172,747],[242,687],[290,625],[300,560],[270,431]].map(Object.freeze)) }),
  Object.freeze({ id: 'east-south', width: 3, points: Object.freeze([[455,443],[475,584],[552,649],[663,676]].map(Object.freeze)) }),
  Object.freeze({ id: 'highland-branch', width: 2.5, points: Object.freeze([[455,443],[469,386],[532,330],[588,300]].map(Object.freeze)) }),
]);

export function inBridgeCorridor(x, y, padding = 4) {
  return Math.abs(x - BRIDGE.x) <= BRIDGE.width / 2 + padding && Math.abs(y - BRIDGE.y) <= BRIDGE.height / 2 + padding;
}

// Where each known-art archetype visibly touches the realm. Land anchors keep
// the tint off the water; overlay anchors are declared crossings or wards.
export const REGION_ANCHORS = Object.freeze({
  'civic-industry': Object.freeze({ x: 588, y: 340, surface: 'land' }),
  'knowledge-network': Object.freeze({ x: 230, y: 320, surface: 'land' }),
  'concealment-veil': Object.freeze({ x: 95, y: 395, surface: 'land' }),
  'protective-ward': Object.freeze({ x: 270, y: 431, surface: 'overlay' }),
  'population-field': Object.freeze({ x: 232, y: 704, surface: 'land' }),
  'mobility-link': Object.freeze({ x: 393, y: 443, surface: 'overlay' }),
  'devotion-field': Object.freeze({ x: 531, y: 678, surface: 'land' }),
  gateway: Object.freeze({ x: 270, y: 452, surface: 'land' }),
});

export function isValidSocket(socket) {
  if (socket.surface === 'overlay' || socket.surface === 'water') return true;
  if (socket.surface !== 'land') return false;
  return !footprintIntersectsRiver(socket, socket.clearance ?? 0);
}

// Closed strolling circuits for walking mages. Every loop follows roads or
// open land; the only water any loop touches is the declared bridge deck, so
// walkers never wade. Loops close on their first point so agents never jump.
export const WALK_LOOPS = Object.freeze([
  Object.freeze({ id: 'west-village', speed: 0.016, points: Object.freeze([[148,551],[219,520],[270,431],[300,560],[242,687],[172,747],[148,551]].map(Object.freeze)) }),
  Object.freeze({ id: 'bridge-round', speed: 0.013, points: Object.freeze([[270,431],[335,436],[393,443],[455,443],[475,584],[507,580],[455,443],[393,443],[335,436],[270,431]].map(Object.freeze)) }),
  Object.freeze({ id: 'east-farms', speed: 0.011, points: Object.freeze([[507,580],[552,649],[585,652],[663,676],[585,652],[552,649],[475,584],[507,580]].map(Object.freeze)) }),
  Object.freeze({ id: 'south-fields', speed: 0.010, points: Object.freeze([[232,704],[185,773],[240,810],[280,760],[232,704]].map(Object.freeze)) }),
  Object.freeze({ id: 'highland-path', speed: 0.009, points: Object.freeze([[455,443],[469,386],[532,330],[588,300],[532,330],[469,386],[455,443]].map(Object.freeze)) }),
]);

// Position and travel direction along a loop at parameter t in [0,1).
export function walkPointAt(loop, t) {
  const pts = loop.points;
  const lengths = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const len = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    lengths.push(len);
    total += len;
  }
  let target = ((t % 1) + 1) % 1 * total;
  for (let i = 0; i < lengths.length; i += 1) {
    if (target <= lengths[i] || i === lengths.length - 1) {
      const f = lengths[i] ? target / lengths[i] : 0;
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      return {
        x: x0 + (x1 - x0) * f,
        y: y0 + (y1 - y0) * f,
        dx: x1 - x0,
        dy: y1 - y0,
      };
    }
    target -= lengths[i];
  }
  return { x: pts[0][0], y: pts[0][1], dx: 1, dy: 0 };
}
