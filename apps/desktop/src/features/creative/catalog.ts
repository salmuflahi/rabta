export const CREATIVE_TOOLS = {
  convert: {
    name: "Image converter",
    verb: "Convert image",
    title: "Same image. New format.",
    description:
      "Open PNG, JPEG, WebP, GIF or BMP. Export PNG, JPEG, WebP or BMP with your own quality and background.",
    icon: "restore",
    note: "GIFs become still images. JPEG and BMP flatten transparency to your chosen background. Animation and metadata are not preserved.",
  },
  resize: {
    name: "Image resizer",
    verb: "Resize image",
    title: "Exactly the size you need.",
    description:
      "Set your dimensions, keep the proportions, and export up to 4096 pixels per side.",
    icon: "prism",
    note: "High-quality browser resampling, not AI upscaling. Enlarging an image cannot recover missing detail.",
  },
  transparent: {
    name: "Background editor",
    verb: "Remove background",
    title: "Keep exactly what you want.",
    description:
      "Remove a flat background, erase by hand, or brush detail back. Work on the whole image or just a selected area.",
    icon: "layers",
    note: "Color removal works best on flat backgrounds. Use the brushes for precise corrections. This is not AI subject detection.",
  },
  crop: {
    name: "Image cropper",
    verb: "Crop image",
    title: "A better frame for the idea.",
    description:
      "Set an exact crop, use a familiar ratio, and export the pixels you need.",
    icon: "prism",
    note: "Crop coordinates use original image pixels. The shaded area is excluded from your export.",
  },
  compress: {
    name: "Image compressor",
    verb: "Compress image",
    title: "A little lighter. Still yours.",
    description:
      "Adjust JPEG or WebP quality, compare the file sizes, and keep the version that works for you.",
    icon: "file",
    note: "Compression can reduce detail. An already optimized image may become larger; compare the actual result before downloading.",
  },
  rotate: {
    name: "Rotate & flip",
    verb: "Apply transformation",
    title: "See it from another angle.",
    description:
      "Turn an image by 90, 180 or 270 degrees. Flip horizontally or vertically, then export.",
    icon: "restore",
    note: "Quarter-turns preserve pixel dimensions, swapping width and height where needed. Encoding may change detail.",
  },
  palette: {
    name: "Color palette",
    verb: "Extract palette",
    title: "Find the colors in the frame.",
    description:
      "Extract a compact palette from your image. Copy a hex value or download CSS variables.",
    icon: "prism",
    note: "Colors are sampled from a small preview and grouped by frequency. Transparent pixels are ignored; this is not a color-profile conversion.",
  },
  svg: {
    name: "SVG to code",
    verb: "Generate code",
    title: "From a drawing to a component.",
    description:
      "Clean a static SVG and export an inline SVG or a React component. Preview the result before using it.",
    icon: "code",
    note: "Scripts, external resources, embedded HTML and animation are excluded. Keep an original copy if your SVG uses these features.",
  },
  media: {
    name: "Video & audio converter",
    verb: "Convert media",
    title: "Make the format fit.",
    description:
      "Convert supported video and audio locally. Trim a clip, resize video, or extract its audio.",
    icon: "play",
    note: "Codec support depends on your browser. Input is limited to 100 MB and 10 minutes. No files are uploaded.",
  },
} as const;
export type CreativeTool = keyof typeof CREATIVE_TOOLS;
export type CreativeToolId = `creative-${CreativeTool}`;
export function isCreativeToolId(id: string): id is CreativeToolId {
  return id.startsWith("creative-") && Object.hasOwn(CREATIVE_TOOLS, id.slice(9));
}
