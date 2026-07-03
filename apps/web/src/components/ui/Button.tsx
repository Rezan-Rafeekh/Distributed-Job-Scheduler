import { clsx } from "clsx";
import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
}

export function Button({ variant = "secondary", size = "md", className, ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all duration-150 ease-out-expo active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100",
        size === "md" ? "px-3.5 py-2 text-sm" : "px-2.5 py-1.5 text-xs",
        variant === "primary" && "bg-primary text-white hover:bg-primary-hover shadow-soft hover:shadow-glow",
        variant === "secondary" &&
          "bg-surface-raised text-text-primary border border-border hover:bg-beige-100 shadow-soft",
        variant === "ghost" && "text-text-secondary hover:bg-beige-100 hover:text-text-primary",
        variant === "danger" && "bg-cherry-50 text-cherry-700 border border-cherry-200 hover:bg-cherry-100",
        className,
      )}
      {...props}
    />
  );
}
