// Keep browser size observation behind the desktop adapter.
export function observeViewportSize(element: HTMLElement, onResize: (width: number, height: number) => void): () => void {
  const observer = new ResizeObserver(([entry]) => {
    if (entry) onResize(entry.contentRect.width, entry.contentRect.height)
  })
  observer.observe(element)
  return () => observer.disconnect()
}
