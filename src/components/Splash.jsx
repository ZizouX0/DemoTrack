export default function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center bg-ink">
      <div className="flex flex-col items-center gap-3">
        <Wordmark />
        <span className="h-1 w-10 animate-pulse rounded-full bg-accent" />
      </div>
    </div>
  )
}

export function Wordmark({ className = '' }) {
  return (
    <span className={`font-display text-2xl font-extrabold tracking-tight text-text ${className}`}>
      demo<span className="text-accent">track</span>
    </span>
  )
}
