import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode; resetKey: string }
type State = { error: Error | null; key: string }

/** Ошибка рендера одного экрана не превращает приложение в белый лист: показываем причину и выход. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  // Переход на другой экран сбрасывает ошибку: сломанный экран не держит в заложниках остальные.
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-title">Экран не открылся</p>
        <p className="max-w-md text-body text-ink-dim">{this.state.error.message}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-accent px-4 py-2.5 text-body font-medium text-accent-ink"
          >
            Обновить страницу
          </button>
          <a href="#/" className="rounded-xl border border-line bg-raised px-4 py-2.5 text-body font-medium">
            К выбору роли
          </a>
        </div>
      </div>
    )
  }
}
