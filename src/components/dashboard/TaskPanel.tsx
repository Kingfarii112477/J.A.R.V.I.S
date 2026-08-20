"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ListTodo, Plus, Check, X } from "lucide-react";
import { HudPanel } from "@/components/hud/HudPanel";
import { useJarvisStore } from "@/store/jarvisStore";
import { useSound } from "@/hooks/useSound";
import { cn } from "@/lib/utils/cn";

const STATUS_COLOR: Record<string, string> = {
  PENDING: "text-text-secondary",
  RUNNING: "text-cyan",
  COMPLETED: "text-success",
  FAILED: "text-danger",
  CANCELLED: "text-text-muted",
};

export function TaskPanel() {
  const tasks = useJarvisStore((s) => s.tasks);
  const addTask = useJarvisStore((s) => s.addTask);
  const updateTaskStatus = useJarvisStore((s) => s.updateTaskStatus);
  const playSound = useSound();
  const [title, setTitle] = useState("");
  const [expanded, setExpanded] = useState(true);

  const active = tasks.filter((t) => t.status === "PENDING" || t.status === "RUNNING");
  const finished = tasks.filter((t) => t.status !== "PENDING" && t.status !== "RUNNING").slice(-3);

  function handleAdd() {
    const trimmed = title.trim();
    if (!trimmed) return;
    addTask({ title: trimmed });
    setTitle("");
    playSound("click");
  }

  return (
    <HudPanel corners>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
      >
        <ListTodo size={15} className="text-cyan" />
        <span className="font-body text-sm font-medium text-text-primary">TASKS</span>
        <span className="font-technical ml-auto text-[10px] tracking-[0.1em] text-text-muted">
          {active.length} ACTIVE
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 flex items-center gap-2 border-t border-cyan/10 pt-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                placeholder="New task..."
                className="flex-1 rounded-lg border border-cyan/15 bg-panel-strong px-3 py-1.5 text-xs text-text-primary outline-none placeholder:text-text-muted"
              />
              <button
                type="button"
                onClick={handleAdd}
                aria-label="Add task"
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-cyan/30 text-cyan hover:bg-cyan/10"
              >
                <Plus size={14} />
              </button>
            </div>

            {active.length === 0 && finished.length === 0 ? (
              <p className="font-technical mt-3 text-center text-[10px] tracking-[0.1em] text-text-muted">NO TASKS YET</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1">
                {[...active, ...finished].map((task) => (
                  <li key={task.id} className="flex items-center gap-2 rounded-lg px-1 py-1.5">
                    <span className={cn("font-technical w-16 shrink-0 text-[9px] tracking-[0.06em]", STATUS_COLOR[task.status])}>
                      {task.status}
                    </span>
                    <span
                      className={cn(
                        "flex-1 truncate text-xs text-text-primary",
                        (task.status === "COMPLETED" || task.status === "CANCELLED") && "text-text-muted line-through"
                      )}
                    >
                      {task.title}
                    </span>
                    {(task.status === "PENDING" || task.status === "RUNNING") && (
                      <span className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => updateTaskStatus(task.id, "COMPLETED")}
                          aria-label={`Complete ${task.title}`}
                          className="text-text-muted hover:text-success"
                        >
                          <Check size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => updateTaskStatus(task.id, "CANCELLED")}
                          aria-label={`Cancel ${task.title}`}
                          className="text-text-muted hover:text-danger"
                        >
                          <X size={13} />
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </HudPanel>
  );
}
