// Cyclic colour gradients. Each list wraps around (last colour blends back into the first).
const PALETTES = {
  Ultra: ['#000764', '#206bcb', '#edffff', '#ffaa00', '#000200'],
  Ocean: ['#021027', '#0b4f6c', '#20a4c4', '#bff4ff', '#0b4f6c'],
  Fire: ['#050000', '#5c0a0a', '#c7300f', '#ff9a1f', '#ffe98a', '#7a1a05'],
  Neon: ['#0d0221', '#ff2a6d', '#fdf500', '#05d9e8', '#7700a6'],
  Aurora: ['#030b1a', '#1b998b', '#9dfcaa', '#e0f2e9', '#6a4c93'],
  Sunset: ['#1a0b2e', '#7a1c5c', '#e8505b', '#f9d56e', '#f3ecc2', '#3d1450'],
  Ice: ['#ffffff', '#a6d8ff', '#2a6fdb', '#0a1f44', '#6fc3ff'],
  Copper: ['#1b0e08', '#6b3a1e', '#d98c4a', '#ffd9a8', '#8a4b24'],
  Forest: ['#07130b', '#1f4d2b', '#6fa35a', '#e6d98c', '#3b6b35'],
  Candy: ['#ffd6e8', '#ff7eb6', '#8e44ff', '#3ec5ff', '#fff1a8'],
  Rainbow: ['#ff3b3b', '#ffa53b', '#fff23b', '#3bff6e', '#3bc8ff', '#6a3bff', '#ff3bd4'],
  Grayscale: ['#000000', '#ffffff'],
  Roots: ['#e63946', '#f1c453', '#2a9d8f'],
  Midnight: ['#000000', '#1d1a4a', '#5a4fcf', '#c9c3ff', '#2c1f6b'],
};

function randomPalette() {
  const h = Math.random() * 360;
  const spread = U.pick([30, 60, 120, 150, 180]);
  const n = 3 + Math.floor(Math.random() * 4);
  const out = [];
  for (let i = 0; i < n; i++) {
    const l = i % 2 === 0 ? U.rand(0.05, 0.3) : U.rand(0.55, 0.92);
    out.push(U.hslToHex(h + i * spread * U.rand(0.6, 1.2), U.rand(0.5, 1), l));
  }
  return out;
}
