const tags = new Set(
  "svg g path rect circle ellipse line polyline polygon defs linearGradient radialGradient stop clipPath mask title desc text tspan use symbol".split(
    " ",
  ),
);
const attrs = new Set(
  "id viewBox width height x y x1 y1 x2 y2 cx cy r rx ry d points transform fill fill-rule fill-opacity stroke stroke-width stroke-linecap stroke-linejoin stroke-dasharray stroke-dashoffset stroke-miterlimit stroke-opacity opacity clip-path clip-rule mask offset stop-color stop-opacity gradientUnits gradientTransform spreadMethod preserveAspectRatio font-size font-family text-anchor dominant-baseline dx dy href".split(
    " ",
  ),
);
export function svgToCode(source: string, name: string, currentColor: boolean) {
  if (new TextEncoder().encode(source).length > 1024 * 1024)
    throw Error("Use an SVG smaller than 1 MB.");
  if (!/^[A-Z][A-Za-z0-9]{0,49}$/.test(name))
    throw Error(
      "Use a component name starting with a capital letter, with letters and numbers only.",
    );
  if (/<!DOCTYPE|<!ENTITY/i.test(source))
    throw Error(
      "SVG document types and entity declarations are not supported.",
    );
  const doc = new DOMParser().parseFromString(source, "image/svg+xml");
  if (
    doc.querySelector("parsererror") ||
    doc.documentElement.localName !== "svg"
  )
    throw Error("Paste valid SVG markup beginning with <svg>.");
  const root = doc.documentElement;
  let removed = 0,
    count = 0;
  function clean(el: Element, depth = 0) {
    if (depth > 50 || ++count > 10000)
      throw Error(
        "This SVG is too complex. Use up to 10,000 elements and 50 nested groups.",
      );
    for (const child of Array.from(el.children)) {
      if (!tags.has(child.localName)) {
        child.remove();
        removed++;
      } else clean(child, depth + 1);
    }
    for (const a of Array.from(el.attributes)) {
      let value = a.value;
      if (a.name === "xmlns" && value === "http://www.w3.org/2000/svg")
        continue;
      if (
        !attrs.has(a.name) ||
        (a.name === "href" && !/^#[\w.-]+$/.test(value)) ||
        (/url\s*\(/i.test(value) && !/^url\(#[\w.-]+\)$/.test(value)) ||
        /javascript:|data:|https?:/i.test(value)
      ) {
        el.removeAttribute(a.name);
        removed++;
        continue;
      }
      if (
        currentColor &&
        ["fill", "stroke"].includes(a.name) &&
        value !== "none" &&
        !value.startsWith("url(")
      ) {
        value = "currentColor";
        el.setAttribute(a.name, value);
      }
    }
  }
  clean(root);
  root.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  if (!root.hasAttribute("viewBox")) {
    const w = Number(root.getAttribute("width")),
      h = Number(root.getAttribute("height"));
    if (w > 0 && h > 0) root.setAttribute("viewBox", `0 0 ${w} ${h}`);
    else
      throw Error(
        "Add a viewBox, or numeric width and height, so the SVG scales correctly.",
      );
  }
  if (currentColor && !root.hasAttribute("fill"))
    root.setAttribute("fill", "currentColor");
  const xml = new XMLSerializer().serializeToString(root);
  function jsx(node: Node): string {
    if (node.nodeType === 3)
      return node.textContent?.trim()
        ? `{${JSON.stringify(node.textContent)}}`
        : "";
    if (node.nodeType !== 1) return "";
    const el = node as Element;
    const attributes = Array.from(el.attributes)
      .map(
        (a) =>
          `${a.name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())}={${JSON.stringify(a.value)}}`,
      )
      .join(" ");
    const children = Array.from(el.childNodes).map(jsx).join("");
    return `<${el.localName}${attributes ? " " + attributes : ""}${el === root ? " {...props}" : ""}${children ? `>${children}</${el.localName}>` : " />"}`;
  }
  return {
    xml,
    code: `import type { SVGProps } from "react";\n\nexport function ${name}(props: SVGProps<SVGSVGElement>) {\n  return (\n    ${jsx(root)}\n  );\n}\n`,
    removed,
  };
}
