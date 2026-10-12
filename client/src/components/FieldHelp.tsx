import { createContext, useContext, type ReactElement } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export const FieldHelpContext = createContext(false);

/** No extra layout element: the existing field remains the tooltip trigger. */
export default function FieldHelp({ text, children }: { text?: string; children: ReactElement }) {
  const enabled = useContext(FieldHelpContext);
  if (!enabled || !text) return children;
  return (
    <Tooltip delayDuration={250}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent dir="rtl" side="top" sideOffset={8} collisionPadding={12}
        className="z-[100] max-w-[min(320px,calc(100vw-24px))] text-right text-xs leading-6 whitespace-normal">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
