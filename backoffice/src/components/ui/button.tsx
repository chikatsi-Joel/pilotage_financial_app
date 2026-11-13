import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "outline" | "ghost" | "destructive" | "brand";
type Size = "default" | "sm" | "lg" | "icon";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  default: "bg-zinc-900 text-white hover:bg-zinc-800",
  brand: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm shadow-brand-600/20",
  outline: "border border-zinc-200 bg-white text-zinc-900 hover:bg-brand-50/60",
  ghost: "text-zinc-700 hover:bg-brand-50 hover:text-zinc-900",
  destructive: "bg-rose-500 text-white hover:bg-rose-600",
};

const sizes: Record<Size, string> = {
  default: "h-9 px-4",
  sm: "h-8 px-3 text-xs",
  lg: "h-10 px-6",
  icon: "h-9 w-9",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
