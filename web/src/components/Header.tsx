import { ThemeToggle } from "./ThemeToggle";
import type { Theme } from "../hooks/useTheme";

export function Header({
  theme,
  onToggleTheme,
}: {
  theme: Theme;
  onToggleTheme: () => void;
}) {
  return (
    <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 sm:px-6 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center gap-2.5">
        <img src="/emidss_logo_64.png" alt="" className="h-7 w-7 rounded-sm" aria-hidden />
        <h1 className="text-sm font-semibold tracking-tight text-zinc-900 sm:text-base dark:text-zinc-50">
          ITESAT-8 Mission Control
        </h1>
      </div>
      <div className="flex items-center gap-3">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        <a
          href="https://github.com/isaac-evs"
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:text-zinc-600 dark:hover:text-zinc-400"
        >
          built by isaac-evs
        </a>
      </div>
    </header>
  );
}
