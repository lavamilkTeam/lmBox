/** Browser persistence only; the application owns the list of available tools. */
export function readWorkspaceSelection(): string | null {
  return sessionStorage.getItem('lmbox.workspace')
}
export function saveWorkspaceSelection(value: string): void {
  sessionStorage.setItem('lmbox.workspace', value)
}
