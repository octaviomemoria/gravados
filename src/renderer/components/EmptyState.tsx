interface EmptyStateProps {
  message: string
}

/** 08_UX_FLOWS.md secao 10: nunca mensagens tecnicas - sempre copy amigavel em PT-BR. */
export function EmptyState({ message }: EmptyStateProps) {
  return <p className="empty-state">{message}</p>
}
