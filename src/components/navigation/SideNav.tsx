"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "@/config/navigation";
import { cn } from "@/lib/utils/cn";

export function SideNav() {
  const pathname = usePathname();

  return (
    <aside className="hud-panel sticky top-4 hidden h-[calc(100vh-2rem)] w-56 shrink-0 flex-col gap-1 rounded-2xl p-3 lg:flex">
      <div className="mb-4 px-2 pt-2">
        <p className="font-display text-lg tracking-[0.2em] text-text-primary">J.A.R.V.I.S.</p>
        <p className="font-technical text-[10px] tracking-[0.2em] text-text-muted">COMMAND CENTER</p>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {navItems.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                active
                  ? "border border-cyan/30 bg-cyan/10 text-cyan"
                  : "border border-transparent text-text-secondary hover:bg-panel-strong hover:text-text-primary"
              )}
            >
              <Icon size={17} strokeWidth={1.75} className={cn(active && "drop-shadow-[0_0_6px_rgba(34,211,238,0.8)]")} />
              <span className="font-technical tracking-[0.1em]">{item.label.toUpperCase()}</span>
              {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-cyan shadow-[0_0_8px_2px_rgba(34,211,238,0.8)]" />}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
