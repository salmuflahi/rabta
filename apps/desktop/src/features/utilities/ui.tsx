import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import type { UtilityUI, SelectProps } from "./shared/UtilityWorkbench";
function UtilitySelect({ id, label, value, options, onChange }: SelectProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} aria-label={label} className="w-full">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent
        position="popper"
        className="w-[var(--radix-select-trigger-width)]"
      >
        {options.map((option) => (
          <SelectItem value={option} key={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export const utilityUI: UtilityUI = {
  Button,
  Input,
  Textarea,
  Select: UtilitySelect,
};
