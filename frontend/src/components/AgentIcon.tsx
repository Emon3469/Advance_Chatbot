import { ChartLine, Code2, FileText, Globe, Mail, Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const ACCENTS: Record<string, string> = {
  sky: "from-sky-400 to-blue-600",
  red: "from-red-500 to-rose-600",
  amber: "from-amber-300 to-orange-500",
  violet: "from-violet-400 to-fuchsia-600",
  emerald: "from-emerald-400 to-teal-600",
  cyan: "from-cyan-300 to-sky-600",
  indigo: "from-indigo-400 to-blue-700",
};

const ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  mail: Mail,
  chart: ChartLine,
  globe: Globe,
  file: FileText,
  code: Code2,
};

function PlayLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="4.5" fill="#fff" />
      <path d="M10 9.2v5.6l4.8-2.8z" fill="#e11d2e" />
    </svg>
  );
}

export function AgentIcon({
  icon,
  accent,
  size = "md",
  online = false,
}: {
  icon: string;
  accent: string;
  size?: "sm" | "md" | "lg";
  online?: boolean;
}) {
  const Icon = ICONS[icon] ?? Sparkles;
  const box = size === "lg" ? "h-11 w-11" : size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const glyph = size === "lg" ? "h-5 w-5" : size === "sm" ? "h-4 w-4" : "h-[18px] w-[18px]";

  return (
    <span className={cn("relative inline-flex shrink-0", box)}>
      <span
        className={cn(
          "flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br shadow-lg shadow-black/30 ring-1 ring-white/15",
          ACCENTS[accent] ?? ACCENTS.sky,
        )}
      >
        {icon === "youtube" ? <PlayLogo className={glyph} /> : <Icon className={cn(glyph, "text-white")} strokeWidth={2.2} />}
      </span>
      {online && (
        <span className="absolute -right-0.5 top-0 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-ink-900" />
      )}
    </span>
  );
}
