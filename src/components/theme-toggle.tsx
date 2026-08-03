import { Monitor, Moon, Sun } from "lucide-react"
import { useTheme } from "@/components/theme-context"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="flex w-full items-center gap-1 rounded-none border border-border bg-muted/50 p-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setTheme("light")}
        aria-pressed={theme === "light"}
        className={cn(
          "flex-1 rounded-none px-3 text-xs",
          theme === "light"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground"
        )}
        title="Light Mode"
      >
        <Sun className="size-4 shrink-0" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setTheme("dark")}
        aria-pressed={theme === "dark"}
        className={cn(
          "flex-1 rounded-none px-3 text-xs",
          theme === "dark"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground"
        )}
        title="Dark Mode"
      >
        <Moon className="size-4 shrink-0" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setTheme("system")}
        aria-pressed={theme === "system"}
        className={cn(
          "flex-1 rounded-none px-3 text-xs",
          theme === "system"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground"
        )}
        title="System Preference"
      >
        <Monitor className="size-4 shrink-0" />
      </Button>
    </div>
  )
}
