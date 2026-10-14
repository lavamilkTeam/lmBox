import { toast } from 'vue-sonner'

/** Presentation-only notifications; callers own the operation and its outcome. */
export function useNotification() {
  return {
    success: (message: string) => toast.success(message),
    error: (message: string) => toast.error(message),
    warning: (message: string) => toast.warning(message),
    info: (message: string) => toast.info(message),
  }
}
