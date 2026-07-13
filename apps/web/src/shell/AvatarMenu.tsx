import * as React from "react";
import { useTranslation } from "react-i18next";
import { LogOut } from "lucide-react";
import { Avatar, Icon, cn } from "@erp/ui";
import { useSession } from "../session/session-context";

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * The account menu: the current user's identity and Sign out. A lightweight popover (dismiss on
 * outside-click / Esc) — @erp/ui has no menu primitive yet, so this stays local until one lands.
 */
export function AvatarMenu() {
  const { t } = useTranslation();
  const { user, signOut } = useSession();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!user) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("topbar.account")}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
      >
        <Avatar name={user.name} initials={initialsOf(user.name)} />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+0.5rem)] w-56 overflow-hidden rounded-md border border-border bg-bg-surface shadow-lg"
          style={{ zIndex: "var(--z-overlay)" }}
        >
          <div className="border-b border-border px-3 py-2.5">
            <p className="truncate text-body-strong text-text-primary">{user.name}</p>
            <p className="truncate text-caption text-text-muted">{user.email}</p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              signOut();
            }}
            className={cn(
              "flex w-full items-center gap-2.5 px-3 text-body text-text-primary outline-none",
              "hover:bg-bg-sunken focus-visible:bg-bg-sunken",
            )}
            style={{ minHeight: "var(--density-tap-min)" }}
          >
            <Icon icon={LogOut} />
            {t("topbar.signOut")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
