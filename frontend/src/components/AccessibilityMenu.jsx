import { useEffect, useRef, useState } from 'react'
import { Accessibility, Contrast, RotateCcw, Type } from 'lucide-react'

const STORAGE_KEY = 'papeleria-accessibility-preferences'
const textSizes = [
  { value: 'normal', label: 'Normal' },
  { value: 'large', label: 'Grande' },
  { value: 'extra-large', label: 'Muy grande' },
]

function readPreferences() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}')
    return {
      textSize: textSizes.some((option) => option.value === saved.textSize) ? saved.textSize : 'normal',
      highContrast: saved.highContrast === true,
      reduceMotion: saved.reduceMotion === true,
    }
  } catch {
    return { textSize: 'normal', highContrast: false, reduceMotion: false }
  }
}

export default function AccessibilityMenu({ className = '' }) {
  const [open, setOpen] = useState(false)
  const [preferences, setPreferences] = useState(readPreferences)
  const menuRef = useRef(null)

  useEffect(() => {
    const root = document.documentElement
    root.dataset.textSize = preferences.textSize
    root.dataset.highContrast = String(preferences.highContrast)
    root.dataset.reduceMotion = String(preferences.reduceMotion)
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
    } catch {
      // El sistema sigue siendo utilizable aunque el navegador no permita guardar preferencias.
    }
  }, [preferences])

  useEffect(() => {
    if (!open) return undefined
    const closeFromOutside = (event) => {
      if (!menuRef.current?.contains(event.target)) setOpen(false)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeFromOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeFromOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const reset = () => setPreferences({ textSize: 'normal', highContrast: false, reduceMotion: false })

  return (
    <div ref={menuRef} className={`relative ${className}`}>
      {open && (
        <section aria-label="Opciones de lectura" className="absolute bottom-full left-0 z-50 mb-3 max-h-[min(36rem,calc(100dvh-8rem))] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-border bg-popover p-4 text-popover-foreground shadow-2xl">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Accessibility aria-hidden="true" className="h-5 w-5" /></span>
            <div><h2 className="font-black">Lectura y accesibilidad</h2><p className="mt-0.5 text-sm text-muted-foreground">Estos ajustes se guardan en esta PC.</p></div>
          </div>
          <div className="mt-4 grid gap-4 text-sm">
            <fieldset>
              <legend className="mb-2 flex items-center gap-2 font-bold"><Type aria-hidden="true" className="h-4 w-4" />Tamaño de letra</legend>
              <div className="grid grid-cols-3 gap-2">
                {textSizes.map((option) => <button key={option.value} type="button" aria-pressed={preferences.textSize === option.value} onClick={() => setPreferences((current) => ({ ...current, textSize: option.value }))} className={`min-h-11 rounded-xl border px-2 text-xs font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${preferences.textSize === option.value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:bg-muted'}`}>{option.label}</button>)}
              </div>
            </fieldset>
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2 font-bold">
              <span className="flex items-center gap-2"><Contrast aria-hidden="true" className="h-4 w-4 text-primary" />Alto contraste</span>
              <input type="checkbox" checked={preferences.highContrast} onChange={(event) => setPreferences((current) => ({ ...current, highContrast: event.target.checked }))} className="h-5 w-5 accent-primary" />
            </label>
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2 font-bold">
              <span>Reducir animaciones</span>
              <input type="checkbox" checked={preferences.reduceMotion} onChange={(event) => setPreferences((current) => ({ ...current, reduceMotion: event.target.checked }))} className="h-5 w-5 accent-primary" />
            </label>
            <button type="button" onClick={reset} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 font-bold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><RotateCcw aria-hidden="true" className="h-4 w-4" />Restablecer ajustes</button>
          </div>
        </section>
      )}
      <button type="button" aria-label="Abrir opciones de lectura y accesibilidad" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-black text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        <Accessibility aria-hidden="true" className="h-5 w-5" />
        <span>Lectura</span>
      </button>
    </div>
  )
}
