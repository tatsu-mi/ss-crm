"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Settings } from "lucide-react";

export function SettingsMenu({
  items,
}: {
  items: { label: string; onSelect: () => void }[];
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false);
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  return (
    <div
      className="settings-menu"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          setOpen(false);
          trigger.current?.focus();
        }
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
          return;
        event.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        const options = Array.from(
          menu.current?.querySelectorAll<HTMLButtonElement>(
            "[role=menuitem]",
          ) || [],
        );
        const current = options.findIndex(
          (item) => item === document.activeElement,
        );
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? options.length - 1
              : (current +
                  (event.key === "ArrowUp" ? -1 : 1) +
                  options.length) %
                options.length;
        options[next]?.focus();
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="top-icon"
        aria-label="設定"
        title="設定"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
      >
        <Settings size={18} />
      </button>
      {open && (
        <div
          ref={menu}
          id={id}
          className="settings-menu-popover"
          role="menu"
          aria-label="設定メニュー"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
