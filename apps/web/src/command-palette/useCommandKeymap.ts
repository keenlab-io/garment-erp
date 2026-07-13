import * as React from "react";
import { useCommandPalette } from "./command-context";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/**
 * The one global key listener for the shell. Ctrl/Cmd-K toggles the palette; `/` opens it (the
 * global search lives in the palette, so its input takes focus) when it's closed and focus isn't
 * already in a field — so typing `/` in an input is untouched. Esc is left to cmdk's Radix dialog,
 * so nothing double-fires.
 */
export function useCommandKeymap(): void {
  const { open, setOpen } = useCommandPalette();

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (event.key === "/" && !open && !isEditableTarget(event.target)) {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);
}
