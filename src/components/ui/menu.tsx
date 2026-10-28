"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { Icon } from "iconsax-reactjs";
import { cn } from "@/lib/cn";

export type MenuItem =
  | "separator"
  | {
      label: string;
      icon?: Icon;
      onSelect: () => void;
      danger?: boolean;
      disabled?: boolean;
    };

export function Menu({
  trigger,
  items,
  align = "end",
  label,
}: {
  trigger: React.ReactNode;
  items: MenuItem[];
  align?: "start" | "end";
  label?: string;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={5}
          className="z-50 min-w-[168px] overflow-hidden rounded-lg border border-line bg-surface p-1 shadow-lg"
        >
          {label && (
            <div className="px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">
              {label}
            </div>
          )}
          {items.map((item, i) =>
            item === "separator" ? (
              <DropdownMenu.Separator key={i} className="my-1 h-px bg-line" />
            ) : (
              <DropdownMenu.Item
                key={i}
                disabled={item.disabled}
                onSelect={item.onSelect}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-[12.5px] outline-none data-[highlighted]:bg-bg data-[disabled]:opacity-40 data-[disabled]:cursor-default",
                  item.danger ? "text-danger data-[highlighted]:bg-danger-soft" : "text-ink",
                )}
              >
                {item.icon && <item.icon size={15} className="shrink-0" />}
                {item.label}
              </DropdownMenu.Item>
            ),
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
