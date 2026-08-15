import { Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function EmptyState({
  className,
  description,
  icon: Icon = Inbox,
  title = 'Sin resultados',
}) {
  return (
    <div className={cn('flex min-h-40 flex-col items-center justify-center gap-2 px-4 py-10 text-center', className)}>
      <Icon className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
      <p className="font-bold text-foreground">{title}</p>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
    </div>
  )
}
