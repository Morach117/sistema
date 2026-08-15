import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it } from 'vitest'
import CaptureDetails from './CaptureDetails'

afterEach(cleanup)

describe('CaptureDetails', () => {
  it('renders capture labels as React nodes and keeps API text untrusted', () => {
    const apiText = 'CAJA: <img src=x onerror="alert(1)"> \u2794 PIEZA: Paño suave'

    render(<CaptureDetails name={apiText} />)

    expect(screen.getByText('CAJA')).toBeInTheDocument()
    expect(screen.getByText('CONTIENE')).toBeInTheDocument()
    expect(screen.getByText(/<img src=x onerror="alert\(1\)">/)).toBeInTheDocument()
    expect(document.querySelector('img')).not.toBeInTheDocument()
  })
})
