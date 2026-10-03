export const ESCORT_COLOR_HEX = ['#66d4a8', '#6aa8ff', '#ffb060', '#d08cff'];

export function escortHex(index) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0) return ESCORT_COLOR_HEX[0];
  return ESCORT_COLOR_HEX[i % ESCORT_COLOR_HEX.length];
}
