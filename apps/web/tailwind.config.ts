import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Manrope", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Fraunces", "ui-serif", "Georgia", "serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        // Var-backed so the whole scale re-themes via the [data-theme="dark"]
        // attribute -- see theme.css for the light/dark value sets.
        beige: {
          50: "var(--color-beige-50)",
          100: "var(--color-beige-100)",
          200: "var(--color-beige-200)",
          300: "var(--color-beige-300)",
          400: "var(--color-beige-400)",
          500: "var(--color-beige-500)",
          600: "var(--color-beige-600)",
          700: "var(--color-beige-700)",
          800: "var(--color-beige-800)",
          900: "var(--color-beige-900)",
        },
        cherry: {
          50: "var(--color-cherry-50)",
          100: "var(--color-cherry-100)",
          200: "var(--color-cherry-200)",
          300: "var(--color-cherry-300)",
          400: "var(--color-cherry-400)",
          500: "var(--color-cherry-500)",
          600: "var(--color-cherry-600)",
          700: "var(--color-cherry-700)",
          800: "var(--color-cherry-800)",
          900: "var(--color-cherry-900)",
        },
        // Intentionally NOT theme-reactive: backs the always-dark code/log
        // panels (bg-ink-900 + text-beige-100), which stay terminal-dark
        // regardless of the app's light/dark mode.
        ink: {
          50: "#F5F5F6",
          100: "#E4E4E7",
          400: "#71717A",
          600: "#52525B",
          800: "#27272A",
          900: "#18181B",
        },
        bg: "var(--color-bg)",
        surface: "var(--color-surface)",
        "surface-raised": "var(--color-surface-raised)",
        border: "var(--color-border)",
        primary: "var(--color-primary)",
        "primary-hover": "var(--color-primary-hover)",
        danger: "var(--color-danger)",
        success: "var(--color-success)",
        warning: "var(--color-warning)",
        "success-soft": "var(--color-success-bg)",
        "success-soft-text": "var(--color-success-text)",
        "warning-soft": "var(--color-warning-bg)",
        "warning-soft-text": "var(--color-warning-text)",
        "text-primary": "var(--color-text-primary)",
        "text-secondary": "var(--color-text-secondary)",
      },
      borderRadius: {
        xl: "0.875rem",
      },
      boxShadow: {
        soft: "0 1px 2px 0 rgb(0 0 0 / 0.06), 0 1px 4px 0 rgb(0 0 0 / 0.05)",
        raised: "0 4px 16px -4px rgb(0 0 0 / 0.18)",
        floating: "0 16px 48px -12px rgb(0 0 0 / 0.35), 0 4px 16px -4px rgb(0 0 0 / 0.16)",
        glow: "0 0 0 1px rgb(var(--color-primary-rgb) / 0.18), 0 8px 24px -8px rgb(var(--color-primary-rgb) / 0.45)",
      },
      backgroundImage: {
        "hero-gradient":
          "radial-gradient(120% 120% at 0% 0%, var(--color-surface-raised) 0%, var(--color-surface) 45%, var(--color-beige-100) 100%)",
        "cherry-gradient": "linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-hover) 100%)",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        "flash-highlight": {
          "0%": { boxShadow: "0 0 0 0 rgb(var(--color-cherry-rgb) / 0.45)" },
          "100%": { boxShadow: "0 0 0 8px rgb(var(--color-cherry-rgb) / 0)" },
        },
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          "0%": { opacity: "0", transform: "translateX(16px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "dash-travel": {
          "0%": { strokeDashoffset: "1" },
          "100%": { strokeDashoffset: "0" },
        },
      },
      animation: {
        "flash-highlight": "flash-highlight 900ms ease-out",
        "fade-in-up": "fade-in-up 320ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "slide-in-right": "slide-in-right 260ms cubic-bezier(0.16, 1, 0.3, 1) both",
        shimmer: "shimmer 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
