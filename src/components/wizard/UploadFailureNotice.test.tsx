import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UploadFailureNotice } from './UploadFailureNotice'

afterEach(cleanup)

describe('upload failure notice', () => {
  it('says what failed, that nothing was submitted, and offers a retry', () => {
    const retry = vi.fn()
    render(<UploadFailureNotice message="Google Drive could not be reached." onRetry={retry} retrying={false} />)
    expect(screen.getByRole('alert').textContent).toContain('Your certificate was not uploaded')
    expect(screen.getByText('Google Drive could not be reached.')).toBeTruthy()
    expect(screen.getByText(/Nothing has been submitted yet/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry upload' }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it('disables the button while a retry is running, so it cannot be double-clicked', () => {
    render(<UploadFailureNotice message="x" onRetry={() => undefined} retrying />)
    const button = screen.getByRole('button', { name: /Retrying/ }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })
})
