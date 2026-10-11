import { describe, expect, it, vi } from 'vitest'
import { useWorkspaceTabs } from '../index'

const tools = [
  { id: 'first', label: '第一项', available: true },
  { id: 'second', label: '第二项', available: true },
  { id: 'third', label: '第三项', available: true },
  { id: 'disabled', label: '不可用', available: false },
]

describe('workspace tabs', () => {
  it('deduplicates available tools and selects neighbours only when closing the active tab', () => {
    const workspace = useWorkspaceTabs({ tools })
    for (const id of ['guide', 'library', 'unknown', 'disabled']) workspace.closeTab(id)
    workspace.openTool('unknown')
    workspace.openTool('disabled')
    expect(workspace.active.value).toBe('guide')
    for (const id of ['first', 'second', 'third', 'second']) workspace.openTool(id)
    expect(workspace.tabs.value.map(tab => tab.id)).toEqual(['guide', 'library', 'first', 'second', 'third'])
    workspace.closeTab('second')
    expect(workspace.active.value).toBe('third')
    workspace.closeTab('third')
    expect(workspace.active.value).toBe('first')
    workspace.selectTab('library')
    workspace.closeTab('first')
    expect(workspace.active.value).toBe('library')
    workspace.openTool('first')
    workspace.closeTab('first')
    expect(workspace.active.value).toBe('guide')
    workspace.selectTab('missing')
    expect(workspace.active.value).toBe('guide')
  })

  it('waits for one asynchronous close and prevents cancellation or duplicate release while pending', async () => {
    let release!: () => void
    const close = vi.fn(() => new Promise<void>(resolve => { release = resolve }))
    const workspace = useWorkspaceTabs({ tools, closeHandlers: { first: close } })
    workspace.openTool('first')
    workspace.openTool('second')
    workspace.closeTab('first')
    expect(close).not.toHaveBeenCalled()
    const closing = workspace.confirmClose()
    workspace.closeTab('first')
    workspace.cancelClose()
    await workspace.confirmClose()
    expect(close).toHaveBeenCalledTimes(1)
    expect(workspace.closeConfirmation.value?.pending).toBe(true)
    expect(workspace.tabs.value.some(tab => tab.id === 'first')).toBe(true)
    release()
    await closing
    expect(workspace.active.value).toBe('second')
    expect(workspace.tabs.value.some(tab => tab.id === 'first')).toBe(false)
    expect(workspace.closeConfirmation.value).toBeUndefined()
  })

  it('preserves a failed close for retry and releases the tab only after success', async () => {
    const close = vi.fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('释放失败'))
      .mockResolvedValueOnce(undefined)
    const workspace = useWorkspaceTabs({ tools, closeHandlers: { first: close } })
    workspace.openTool('first')
    workspace.closeTab('first')
    workspace.cancelClose()
    await workspace.confirmClose()
    expect(close).not.toHaveBeenCalled()
    workspace.closeTab('first')
    await workspace.confirmClose()
    expect(workspace.active.value).toBe('first')
    expect(workspace.closeConfirmation.value).toMatchObject({ pending: false, error: '释放失败' })
    expect(workspace.tabs.value.some(tab => tab.id === 'first')).toBe(true)
    await workspace.confirmClose()
    expect(close).toHaveBeenCalledTimes(2)
    expect(workspace.active.value).toBe('guide')
    expect(workspace.closeConfirmation.value).toBeUndefined()
  })
})
