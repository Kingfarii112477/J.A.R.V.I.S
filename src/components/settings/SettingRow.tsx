import type { ReactNode } from "react";

interface SettingRowProps {
  label: string;
  description?: string;
  children: ReactNode;
  stacked?: boolean;
}

export function SettingRow({ label, description, children, stacked = false }: SettingRowProps) {
  if (stacked) {
    return (
      <div className="border-b border-cyan/10 py-3.5 last:border-0">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-body text-sm text-text-primary">{label}</span>
          {description && <span className="font-technical text-xs text-cyan">{description}</span>}
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4 border-b border-cyan/10 py-3.5 last:border-0">
      <div className="min-w-0">
        <p className="font-body text-sm text-text-primary">{label}</p>
        {description && <p className="font-technical mt-0.5 text-[10px] tracking-[0.03em] text-text-muted">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
