import { UtilityWorkbench } from "@/features/utilities/shared/UtilityWorkbench";
import { utilityUI } from "@/features/utilities/ui";
import { MacControls } from "@/features/utilities/MacControls";
import "@/features/utilities/shared/workbench.css";
import "@/features/utilities/desktop.css";
export function UtilitiesPage() {
  return (
    <div className="rabta-desktop-utilities">
      <UtilityWorkbench ui={utilityUI} nativeTools={<MacControls />} />
    </div>
  );
}
