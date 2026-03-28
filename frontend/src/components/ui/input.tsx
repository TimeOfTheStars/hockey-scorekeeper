import * as React from "react";
import { cn } from "../../lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "flex h-10 w-full rounded-md border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-50",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
