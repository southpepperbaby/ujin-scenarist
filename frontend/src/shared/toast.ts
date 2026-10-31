import { toast } from 'sonner'

/** Ошибку показываем тостом, а не роняем экран. Одинаковые сообщения не множим. */
export function toastError(message: string): void {
  toast.error(message, { id: message })
}

export function toastOk(message: string): void {
  toast.success(message)
}
