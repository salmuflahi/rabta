export type Region = { x: number; y: number; width: number; height: number };
export function readAlpha(data: Uint8ClampedArray) {
  const a = new Uint8Array(data.length / 4);
  for (let i = 0; i < a.length; i++) a[i] = data[i * 4 + 3];
  return a;
}
export function writeAlpha(data: Uint8ClampedArray, alpha: Uint8Array) {
  for (let i = 0; i < alpha.length; i++) data[i * 4 + 3] = alpha[i];
}
export function brushStamp(
  data: Uint8ClampedArray,
  original: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number,
  softness: number,
  restore: boolean,
) {
  const r = Math.max(1, Math.min(500, radius)),
    inner = r * (1 - Math.max(0, Math.min(1, softness)));
  const left = Math.max(0, Math.floor(x - r)),
    top = Math.max(0, Math.floor(y - r)),
    right = Math.min(width, Math.ceil(x + r)),
    bottom = Math.min(height, Math.ceil(y + r));
  for (let py = top; py < bottom; py++)
    for (let px = left; px < right; px++) {
      const distance = Math.hypot(px + 0.5 - x, py + 0.5 - y);
      if (distance > r) continue;
      const strength =
        distance <= inner
          ? 1
          : Math.min(1, (r - distance) / Math.max(1, r - inner));
      const p = (py * width + px) * 4 + 3;
      data[p] = Math.round(
        data[p] + ((restore ? original[p] : 0) - data[p]) * strength,
      );
    }
  return { x: left, y: top, width: right - left, height: bottom - top };
}
export function removeColorInRegion(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  color: string,
  tolerance: number,
  region: Region,
) {
  if (
    !/^#[a-f0-9]{6}$/i.test(color) ||
    !Number.isFinite(tolerance) ||
    tolerance < 0 ||
    tolerance > 100
  )
    throw Error("Choose a valid color and tolerance.");
  const { x, y, width: w, height: h } = region;
  if (
    ![x, y, w, h].every(Number.isInteger) ||
    x < 0 ||
    y < 0 ||
    w < 1 ||
    h < 1 ||
    x + w > width ||
    y + h > height
  )
    throw Error("Keep the selected area inside the image.");
  const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)),
    limit = 3 * (tolerance * 2.55) ** 2;
  let changed = 0;
  for (let py = y; py < y + h; py++)
    for (let px = x; px < x + w; px++) {
      const p = (py * width + px) * 4;
      if (
        data[p + 3] &&
        (data[p] - rgb[0]) ** 2 +
          (data[p + 1] - rgb[1]) ** 2 +
          (data[p + 2] - rgb[2]) ** 2 <=
          limit
      ) {
        data[p + 3] = 0;
        changed++;
      }
    }
  return changed;
}
