"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal, X } from "lucide-react";
import { navItems, primaryMobileNavIds, moreMobileNavIds } from "@/config/navigation";
import { cn } from "@/lib/utils/cn";
import { AnimatePresence, motion } from "framer-motion";

export function BottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const primaryItems = navItems.filter((item) => primaryMobileNavIds.includes(item.id));
  const moreItems = navItems.filter((item) => moreMobileNavIds.includes(item.id));
  const moreActive = moreMobileNavIds.some((id) => pathname === `/${id}`);

  return (
    <>
      <AnimatePresence>
        {moreOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
            onClick={() => setMoreOpen(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="hud-panel absolute bottom-20 left-3 right-3 rounded-2xl p-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="font-technical text-[10px] tracking-[0.2em] text-text-muted">MORE SYSTEMS</span>
                <button aria-label="Close" onClick={() => setMoreOpen(false)} className="text-text-muted">
                  <X size={16} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {moreItems.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      className={cn(
                        "flex items-center gap-2 rounded-xl border px-3 py-3 text-sm",
                        active ? "border-cyan/40 bg-cyan/10 text-cyan" : "border-cyan/10 text-text-secondary"
                      )}
                    >
                      <Icon size={16} />
                      <span className="font-technical text-xs tracking-[0.08em]">{item.label.toUpperCase()}</span>
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <nav
        className="hud-panel fixed bottom-3 left-3 right-3 z-30 flex items-center justify-around rounded-2xl px-1 py-2 lg:hidden"
        aria-label="Primary"
      >
        {primaryItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-[10px] tracking-[0.08em]",
                active ? "text-cyan" : "text-text-muted"
              )}
            >
              <Icon size={20} strokeWidth={active ? 2.1 : 1.75} />
              <span className="font-technical">{item.label.toUpperCase()}</span>
              {active && <span className="h-0.5 w-5 rounded-full bg-cyan" />}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className={cn(
            "flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-[10px] tracking-[0.08em]",
            moreOpen || moreActive ? "text-cyan" : "text-text-muted"
          )}
        >
          <MoreHorizontal size={20} strokeWidth={moreActive ? 2.1 : 1.75} />
          <span className="font-technical">MORE</span>
          {moreActive && <span className="h-0.5 w-5 rounded-full bg-cyan" />}
        </button>
      </nav>
    </>
  );
}
