import {
  LayoutGrid,
  MessageSquare,
  Mic,
  Cpu,
  Activity,
  Radar,
  BrainCircuit,
  Settings,
  Rocket,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutGrid },
  { id: "chat", label: "Chat", href: "/chat", icon: MessageSquare },
  { id: "voice", label: "Voice", href: "/voice", icon: Mic },
  { id: "missions", label: "Missions", href: "/missions", icon: Rocket },
  { id: "systems", label: "Systems", href: "/systems", icon: Cpu },
  { id: "diagnostics", label: "Diagnostics", href: "/diagnostics", icon: Activity },
  { id: "radar", label: "Radar", href: "/radar", icon: Radar },
  { id: "memory", label: "Memory", href: "/memory", icon: BrainCircuit },
  { id: "settings", label: "Settings", href: "/settings", icon: Settings },
];

/** Primary slots shown directly in the mobile bottom bar; the rest live under "More". */
export const primaryMobileNavIds = ["dashboard", "chat", "voice", "missions"];

export const moreMobileNavIds = navItems
  .map((item) => item.id)
  .filter((id) => !primaryMobileNavIds.includes(id));
