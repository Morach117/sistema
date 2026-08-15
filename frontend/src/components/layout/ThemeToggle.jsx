import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

const focusStyles = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  return (
    <button
      type="button"
      aria-label="Cambiar tema"
      aria-pressed={isDark}
      title={isDark ? 'Usar tema claro' : 'Usar tema oscuro'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={`relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border bg-background text-foreground transition-colors hover:bg-accent hover:text-accent-foreground ${focusStyles}`}
    >
      {isDark ? <Sun aria-hidden="true" className="h-5 w-5" /> : <Moon aria-hidden="true" className="h-5 w-5" />}
    </button>
  )
}
