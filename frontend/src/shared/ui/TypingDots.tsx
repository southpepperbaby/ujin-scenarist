const DELAYS = ['0ms', '160ms', '320ms']

/** Три точки «собеседник печатает»: пока LLM собирает правило. */
export function TypingDots() {
  return (
    <span className="flex items-center gap-1" aria-label="Идёт разбор">
      {DELAYS.map((delay) => (
        <span
          key={delay}
          className="typing-dot size-1.5 rounded-full bg-current"
          style={{ animationDelay: delay }}
        />
      ))}
    </span>
  )
}
