export function LevelMeter({ level }: { level: number }) {
  const percent = Math.round(Math.max(0, Math.min(1, level)) * 100)

  return (
    <div
      className="level-meter"
      role="meter"
      aria-label="Nivel do microfone"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="level-meter__bar" style={{ width: `${percent}%` }} />
    </div>
  )
}
