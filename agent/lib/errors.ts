export class AgentError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'AgentError' }
}
export function checkCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new AgentError('cancelled', 'Agent job cancelled.')
}
export function safeError(error: unknown): { code: string; message: string } {
  return error instanceof AgentError ? { code: error.code, message: error.message }
    : { code: 'worker_error', message: 'Agent worker failed.' }
}
