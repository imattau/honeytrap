import React from 'react';

interface IconButtonProps {
  title: string;
  ariaLabel?: string;
  active?: boolean;
  onClick?: (event: React.MouseEvent) => void;
  variant?: 'neon' | 'author';
  tone?: 'relay' | 'p2p' | 'http' | 'verified' | 'follow' | 'block';
  className?: string;
  children: React.ReactNode;
}

export function IconButton({
  title,
  ariaLabel,
  active = false,
  onClick,
  variant = 'neon',
  tone,
  className,
  children
}: IconButtonProps) {
  const baseClass = [
    'icon-button',
    `icon-button--${variant}`,
    active ? 'is-active' : '',
    tone ? `is-${tone}` : '',
    className ?? ''
  ]
    .filter(Boolean)
    .join(' ');

  if (onClick) {
    return (
      <button
        type="button"
        className={baseClass}
        onClick={onClick}
        title={title}
        aria-label={ariaLabel ?? title}
      >
        {children}
      </button>
    );
  }

  return (
    <span className={`${baseClass} icon-button--static`} title={title} aria-label={ariaLabel ?? title}>
      {children}
    </span>
  );
}
