import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it } from 'vitest'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from './dialog'

function DialogDemo() {
  return (
    <Dialog>
      <DialogTrigger>Abrir detalles</DialogTrigger>
      <DialogContent>
        <DialogTitle>Detalle de recepción</DialogTitle>
        <DialogDescription>Información de la remisión seleccionada.</DialogDescription>
        <button type="button">Acción interna</button>
      </DialogContent>
    </Dialog>
  )
}

afterEach(cleanup)

describe('Dialog', () => {
  it('returns focus to its trigger after closing with Escape', async () => {
    render(<DialogDemo />)
    const trigger = screen.getByRole('button', { name: /abrir detalles/i })

    fireEvent.click(trigger)
    expect(screen.getByRole('dialog', { name: /detalle de recepción/i })).toBeVisible()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(trigger).toHaveFocus())
  })
})
