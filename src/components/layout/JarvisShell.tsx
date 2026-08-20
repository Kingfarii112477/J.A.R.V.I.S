"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import { SideNav } from "@/components/navigation/SideNav";
import { TopBar } from "@/components/navigation/TopBar";
import { BottomNav } from "@/components/navigation/BottomNav";
import { LockScreen } from "@/components/layout/LockScreen";
import { ScreenErrorFallback } from "@/components/layout/ScreenErrorFallback";
import { ToastStack } from "@/components/common/Toast";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { useJarvisStore } from "@/store/jarvisStore";

export function JarvisShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const locked = useJarvisStore((s) => s.locked);
  const reducedMotion = useJarvisStore((s) => s.settings.reducedMotion);

  return (
    <MotionConfig reducedMotion={reducedMotion ? "always" : "user"}>
      <div className="circuit-field relative min-h-screen bg-bg">
        <div className="mx-auto flex w-full max-w-[1400px] gap-4 px-3 pb-24 pt-3 lg:px-6 lg:pb-6">
          <SideNav />
          <div className="min-w-0 flex-1">
            <TopBar />
            <AnimatePresence mode="wait">
              <motion.main
                key={pathname}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.28, ease: "easeOut" }}
                className="min-h-[60vh]"
              >
                <ErrorBoundary fallback={<ScreenErrorFallback />}>{children}</ErrorBoundary>
              </motion.main>
            </AnimatePresence>
          </div>
        </div>
        <BottomNav />
        <ToastStack />
        {locked && <LockScreen />}
      </div>
    </MotionConfig>
  );
}
