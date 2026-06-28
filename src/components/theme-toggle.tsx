import { Monitor, Moon, Sun } from "lucide-react"
import { useTheme } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="flex w-full items-center gap-1 rounded-md bg-muted/50 p-1 border border-border">
      <button
        type="button"
        onClick={() => setTheme("light")}
        className={cn(
          "flex flex-1 items-center justify-center gap-2 rounded-sm py-1.5 px-3 text-xs font-medium transition-all duration-200 cursor-pointer",
          theme === "light"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:bg-accent hover:text-foreground"
        )}
        title="Light Mode"
      >
        <Sun className="size-4 shrink-0" />
      </button>
      <button
        type="button"
        onClick={() => setTheme("dark")}
        className={cn(
          "flex flex-1 items-center justify-center gap-2 rounded-sm py-1.5 px-3 text-xs font-medium transition-all duration-200 cursor-pointer",
          theme === "dark"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:bg-accent hover:text-foreground"
        )}
        title="Dark Mode"
      >
        <Moon className="size-4 shrink-0" />
      </button>
      <button
        type="button"
        onClick={() => setTheme("system")}
        className={cn(
          "flex flex-1 items-center justify-center gap-2 rounded-sm py-1.5 px-3 text-xs font-medium transition-all duration-200 cursor-pointer",
          theme === "system"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:bg-accent hover:text-foreground"
        )}
        title="System Preference"
      >
        <Monitor className="size-4 shrink-0" />
      </button>
    </div>
  )
}
