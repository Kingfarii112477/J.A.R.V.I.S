"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Info, AlertTriangle, XCircle, Cpu } from "lucide-react";
import { useJarvisStore } from "@/store/jarvisStore";
import { cn } from "@/lib/utils/cn";

const variantMeta = {
  info: { icon: Info, className: "border-cyan/30 text-cyan", duration: 3600 },
  success: { icon: CheckCircle2, className: "border-success/30 text-success", duration: 3600 },
  warning: { icon: AlertTriangle, className: "border-warning/30 text-warning", duration: 5200 },
  error: { icon: XCircle, className: "border-danger/30 text-danger", duration: 6000 },
  system: { icon: Cpu, className: "border-violet/30 text-violet", duration: 4400 },
} as const;

/**
 * Unified notification layer — this is also where lib/events/bus.ts's
 * "notification.push" events surface (see useNotificationBridge), so both
 * direct pushToast() calls and event-bus-driven system notices render
 * through the same HUD-alert UI instead of two parallel systems.
 */
export function ToastStack() {
  const toasts = useJarvisStore((s) => s.toasts);
  const dismissToast = useJarvisStore((s) => s.dismissToast);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3">
      <AnimatePresence>
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            id={toast.id}
            message={toast.message}
            title={toast.title}
            variant={toast.variant}
            onDismiss={dismissToast}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastItem({
  id,
  message,
  title,
  variant,
  onDismiss,
}: {
  id: string;
  message: string;
  title?: string;
  variant: "info" | "success" | "warning" | "error" | "system";
  onDismiss: (id: string) => void;
}) {
  const { icon: Icon, className, duration } = variantMeta[variant];

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(id), duration);
    return () => clearTimeout(timer);
  }, [id, onDismiss, duration]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className={cn(
        "hud-panel pointer-events-auto flex max-w-md items-start gap-2 rounded-2xl px-4 py-2.5 text-xs",
        className
      )}
    >
      <Icon size={14} className="mt-0.5 shrink-0" />
      <span className="font-body text-text-primary">
        {title && <span className="font-technical mr-1.5 tracking-[0.08em]">{title.toUpperCase()}</span>}
        {message}
      </span>
    </motion.div>
  );
}
