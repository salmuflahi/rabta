export const MAX_BYTES = 20 * 1024 * 1024;
export const MAX_INPUT_PIXELS = 24_000_000;
export const MAX_SIDE = 4096;
export const TYPES = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp", bmp: "image/bmp" };

/** Inspect dimensions before asking the browser to allocate decoded pixels. */
export function imageHeader(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (at, length) => String.fromCharCode(...bytes.slice(at, at + length));
  let width, height, type;
  if (bytes.length >= 24 && ascii(1, 3) === "PNG" && bytes[0] === 137 && ascii(12, 4) === "IHDR") {
    type = "png"; width = view.getUint32(16); height = view.getUint32(20);
  } else if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    type = "webp";
    for (let at = 12; at + 8 <= bytes.length;) {
      const kind = ascii(at, 4), length = view.getUint32(at + 4, true), start = at + 8;
      if (start + length > bytes.length) break;
      const u24 = (i) => bytes[i] + (bytes[i+1] << 8) + (bytes[i+2] << 16);
      if (kind === "VP8X" && length >= 10) { width = 1 + u24(start+4); height = 1 + u24(start+7); break; }
      if (kind === "VP8 " && length >= 10 && bytes[start+3] === 157 && bytes[start+4] === 1 && bytes[start+5] === 42) { width = view.getUint16(start+6,true) & 0x3fff; height = view.getUint16(start+8,true) & 0x3fff; break; }
      if (kind === "VP8L" && length >= 5 && bytes[start] === 47) { const n = view.getUint32(start+1,true); width = (n & 0x3fff) + 1; height = ((n >>> 14) & 0x3fff) + 1; break; }
      at = start + length + (length % 2);
    }
  } else if (bytes.length >= 10 && ["GIF87a","GIF89a"].includes(ascii(0,6))) {
    type="gif"; width=view.getUint16(6,true); height=view.getUint16(8,true);
  } else if (bytes.length >= 54 && ascii(0,2)==="BM" && view.getUint32(14,true)>=40) {
    type="bmp"; width=view.getInt32(18,true); height=Math.abs(view.getInt32(22,true));
    if(width<1) throw new Error("This BMP has invalid dimensions.");
  } else if (bytes[0] === 255 && bytes[1] === 216) {
    type = "jpeg";
    for (let at = 2; at + 4 <= bytes.length;) {
      if (bytes[at++] !== 255) break;
      while (bytes[at] === 255) at++;
      const marker = bytes[at++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (at + 2 > bytes.length) break;
      const length = view.getUint16(at);
      if (length < 2 || at + length > bytes.length) break;
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker) && length >= 7) { height = view.getUint16(at+3); width = view.getUint16(at+5); break; }
      at += length;
    }
  }
  if (!type || !width || !height) throw new Error("Choose a valid PNG, JPEG, WebP, GIF or BMP image. Open SVGs in SVG to code; HEIC and documents are not supported here.");
  if (width * height > MAX_INPUT_PIXELS || width > 32768 || height > 32768) throw new Error("This image exceeds the 24-megapixel input limit. Choose a smaller source.");
  return { width, height, type };
}

export function outputSize(width, height) {
  if (![width, height].every(n => Number.isInteger(n) && n >= 1 && n <= MAX_SIDE)) throw new Error("Enter a whole-number width and height between 1 and 4096 pixels.");
  return { width, height };
}

/** Only remove matching pixels connected to an outer edge; protect enclosed details. */
export function removeEdgeBackground(data, width, height, hex, tolerance) {
  if (!/^#[0-9a-f]{6}$/i.test(hex) || !Number.isFinite(tolerance) || tolerance < 0 || tolerance > 100) throw new Error("Choose a six-digit background color and a tolerance from 0 to 100.");
  const target = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16));
  const limit = 3 * (tolerance * 2.55) ** 2, length = width * height;
  if (data.length !== length * 4) throw new Error("The image pixels could not be read. Try another image.");
  const visited = new Uint8Array(length), stack = new Uint32Array(length);
  let count = 0, removed = 0;
  function enqueue(index) {
    if (visited[index]) return;
    visited[index] = 1;
    const p = index * 4;
    if (data[p+3] === 0 || (data[p]-target[0])**2 + (data[p+1]-target[1])**2 + (data[p+2]-target[2])**2 <= limit) stack[count++] = index;
  }
  for (let x=0; x<width; x++) { enqueue(x); enqueue((height-1)*width+x); }
  for (let y=0; y<height; y++) { enqueue(y*width); enqueue(y*width+width-1); }
  while (count) {
    const index = stack[--count], p = index*4, x = index%width;
    if (data[p+3]) removed++;
    data[p+3] = 0;
    if (x) enqueue(index-1);
    if (x < width-1) enqueue(index+1);
    if (index >= width) enqueue(index-width);
    if (index < length-width) enqueue(index+width);
  }
  return removed;
}

export function exportName(name, tool, format) {
  const clean = name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g,"-");
  let stem = "", size = 0;
  for (const character of clean) {
    const length = new TextEncoder().encode(character).length;
    if (size + length > 180) break;
    stem += character; size += length;
  }
  return `${stem || "image"}-${tool}.${format === "jpeg" ? "jpg" : format}`;
}

export function cropRegion(x,y,width,height,sourceWidth,sourceHeight) {
  if (![x,y,width,height].every(Number.isInteger) || x<0 || y<0 || width<1 || height<1 || x+width>sourceWidth || y+height>sourceHeight) throw new Error("Choose a crop entirely inside the image, using whole pixels.");
  return {x,y,width,height};
}

/** Deterministic opaque-color bins, ignoring transparent pixels. */
export function extractPalette(data, limit=6) {
  const bins=new Map();
  for(let p=0;p<data.length;p+=4){if(data[p+3]<128)continue;const key=(data[p]>>4)*256+(data[p+1]>>4)*16+(data[p+2]>>4);const bin=bins.get(key)||[0,0,0,0];for(let c=0;c<3;c++)bin[c]+=data[p+c];bin[3]++;bins.set(key,bin);}
  return [...bins.values()].sort((a,b)=>b[3]-a[3]).slice(0,limit).map(b=>({hex:"#"+b.slice(0,3).map(v=>Math.round(v/b[3]).toString(16).padStart(2,"0")).join(""),pixels:b[3]}));
}

/** 24-bit BMP with padded bottom-up BGR rows. Pixels must be opaque. */
export function encodeBmp(data,width,height) {
  const stride=Math.ceil(width*3/4)*4, bytes=new Uint8Array(54+stride*height),view=new DataView(bytes.buffer);
  bytes[0]=66;bytes[1]=77;view.setUint32(2,bytes.length,true);view.setUint32(10,54,true);view.setUint32(14,40,true);view.setInt32(18,width,true);view.setInt32(22,height,true);view.setUint16(26,1,true);view.setUint16(28,24,true);view.setUint32(34,stride*height,true);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const p=(y*width+x)*4,q=54+(height-1-y)*stride+x*3;bytes[q]=data[p+2];bytes[q+1]=data[p+1];bytes[q+2]=data[p];}
  return new Blob([bytes],{type:TYPES.bmp});
}
