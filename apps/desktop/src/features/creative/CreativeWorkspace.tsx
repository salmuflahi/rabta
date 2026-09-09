import { ImageUtility } from "./image-utility";
import { SvgUtility } from "./svg-utility";
import { MediaUtility } from "./media-utility";
import { type CreativeTool, type CreativeToolId } from "./catalog";
import "./creative.css";

export { isCreativeToolId, type CreativeToolId } from "./catalog";

/** Host-rendered tools share the normal Studio rail, search and mode selection. */
export function CreativeWorkspace({ tool }: { tool: CreativeToolId }) {
  const kind = tool.slice(9) as CreativeTool;
  return (
    <div className="creative-workspace" data-creative-tool={kind}>
      {kind === "svg" ? <SvgUtility key={kind} /> : kind === "media" ? <MediaUtility key={kind} /> : <ImageUtility key={kind} tool={kind} />}
    </div>
  );
}
