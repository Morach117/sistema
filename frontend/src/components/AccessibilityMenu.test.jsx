import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it } from 'vitest'
import AccessibilityMenu from './AccessibilityMenu'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  delete document.documentElement.dataset.textSize
  delete document.documentElement.dataset.highContrast
  delete document.documentElement.dataset.reduceMotion
})

describe('AccessibilityMenu', () => {
  it('closes when the operator clicks outside the menu', () => {
    render(<><AccessibilityMenu /><button type="button">Otro control</button></>)

    fireEvent.click(screen.getByRole('button', { name: /abrir opciones de lectura/i }))
    expect(screen.getByRole('region', { name: /opciones de lectura/i })).toBeVisible()

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Otro control' }))
    expect(screen.queryByRole('region', { name: /opciones de lectura/i })).not.toBeInTheDocument()
  })

  it('persists the selected text size without changing the page container', () => {
    render(<AccessibilityMenu />)

    fireEvent.click(screen.getByRole('button', { name: /abrir opciones de lectura/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Grande' }))

    expect(document.documentElement.dataset.textSize).toBe('large')
    expect(JSON.parse(window.localStorage.getItem('papeleria-accessibility-preferences'))).toMatchObject({ textSize: 'large' })
  })
})
