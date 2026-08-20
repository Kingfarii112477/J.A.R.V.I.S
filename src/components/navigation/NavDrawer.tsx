"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Lock, X, RotateCcw } from "lucide-react";
import { navItems } from "@/config/navigation";
import { cn } from "@/lib/utils/cn";
import { useJarvisStore } from "@/store/jarvisStore";

interface NavDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function NavDrawer({ open, onClose }: NavDrawerProps) {
  const pathname = usePathname();
  const router = useRouter();
  const setLocked = useJarvisStore((s) => s.setLocked);
  const setBooted = useJarvisStore((s) => s.setBooted);
  const lockScreenEnabled = useJarvisStore((s) => s.settings.lockScreenEnabled);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ x: -280, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -280, opacity: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
            className="hud-panel absolute left-3 top-3 bottom-3 w-64 rounded-2xl p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="font-display text-sm tracking-[0.2em] text-text-primary">J.A.R.V.I.S.</p>
                <p className="font-technical text-[10px] tracking-[0.15em] text-text-muted">SYSTEM MENU</p>
              </div>
              <button aria-label="Close menu" onClick={onClose} className="text-text-muted hover:text-text-primary">
                <X size={18} />
              </button>
            </div>

            <nav className="flex flex-col gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm",
                      active ? "border border-cyan/30 bg-cyan/10 text-cyan" : "text-text-secondary hover:bg-panel-strong"
                    )}
                  >
                    <Icon size={16} />
                    <span className="font-technical tracking-[0.08em]">{item.label.toUpperCase()}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="mt-4 flex flex-col gap-1 border-t border-cyan/10 pt-4">
              {lockScreenEnabled && (
                <button
                  type="button"
                  onClick={() => {
                    setLocked(true);
                    onClose();
                  }}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-text-secondary hover:bg-panel-strong"
                >
                  <Lock size={16} />
                  <span className="font-technical tracking-[0.08em]">LOCK SYSTEM</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setBooted(false);
                  onClose();
                  router.push("/dashboard");
                }}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-text-secondary hover:bg-panel-strong"
              >
                <RotateCcw size={16} />
                <span className="font-technical tracking-[0.08em]">REPLAY BOOT SEQUENCE</span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
