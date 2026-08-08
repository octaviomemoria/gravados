import type { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary'
}

export function Button({ variant = 'primary', className, ...rest }: ButtonProps) {
  const variantClass = variant === 'primary' ? 'button--primary' : 'button--secondary'
  const classes = ['button', variantClass, className].filter(Boolean).join(' ')
  return <button className={classes} {...rest} />
}
