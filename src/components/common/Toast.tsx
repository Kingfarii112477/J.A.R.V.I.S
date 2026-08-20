"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Info, AlertTriangle, XCircle } from "lucide-react";
import { useJarvisStore } from "@/store/jarvisStore";
import { cn } from "@/lib/utils/cn";

const variantMeta = {
  info: { icon: Info, className: "border-cyan/30 text-cyan" },
  success: { icon: CheckCircle2, className: "border-success/30 text-success" },
  warning: { icon: AlertTriangle, className: "border-warning/30 text-warning" },
  error: { icon: XCircle, className: "border-danger/30 text-danger" },
} as const;

export function ToastStack() {
  const toasts = useJarvisStore((s) => s.toasts);
  const dismissToast = useJarvisStore((s) => s.dismissToast);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3">
      <AnimatePresence>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} id={toast.id} message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastItem({
  id,
  message,
  variant,
  onDismiss,
}: {
  id: string;
  message: string;
  variant: "info" | "success" | "warning" | "error";
  onDismiss: (id: string) => void;
}) {
  const { icon: Icon, className } = variantMeta[variant];

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(id), 3600);
    return () => clearTimeout(timer);
  }, [id, onDismiss]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className={cn("hud-panel pointer-events-auto flex items-center gap-2 rounded-full px-4 py-2 text-xs", className)}
    >
      <Icon size={14} />
      <span className="font-body text-text-primary">{message}</span>
    </motion.div>
  );
}
