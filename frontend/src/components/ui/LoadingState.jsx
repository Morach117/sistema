import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function LoadingState({
  className,
  label = 'Cargando…',
  compact = false,
}) {
  const Component = compact ? 'span' : 'div'

  return (
    <Component
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-center justify-center text-muted-foreground',
        compact ? 'gap-2 py-3 text-xs font-bold' : 'min-h-40 flex-col gap-3 py-10 text-sm font-bold',
        className,
      )}
    >
      <Loader2 className={cn('animate-spin text-primary motion-reduce:animate-none', compact ? 'h-4 w-4' : 'h-8 w-8')} aria-hidden="true" />
      <span>{label}</span>
    </Component>
  )
}
