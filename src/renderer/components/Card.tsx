import type { ReactNode } from 'react'

interface CardProps {
  title: string
  children?: ReactNode
}

export function Card({ title, children }: CardProps) {
  return (
    <section className="card">
      <h3 className="card__title">{title}</h3>
      <div className="card__body">{children}</div>
    </section>
  )
}
