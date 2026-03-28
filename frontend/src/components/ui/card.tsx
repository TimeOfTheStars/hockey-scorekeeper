import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("rounded-xl border border-zinc-700 bg-zinc-900/80 p-4", className)}>
      {children}
    </div>
  );
}
