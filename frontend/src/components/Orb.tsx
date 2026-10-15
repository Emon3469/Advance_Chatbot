import { cn } from "@/lib/utils";

export function Orb({ size = 96, active = false, className }: { size?: number; active?: boolean; className?: string }) {
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <div
        className="absolute inset-[-35%] rounded-full bg-sky-400/25 blur-2xl"
        style={{ opacity: active ? 0.9 : 0.6 }}
      />
      <div className={cn("orb h-full w-full", active && "orb-active")} />
    </div>
  );
}
