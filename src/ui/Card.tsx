import React from 'react';

interface CardProps {
  children: React.ReactNode;
  depth?: number;
  variant?: 'normal' | 'root' | 'ancestor' | 'target' | 'reply';
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onTouchStart?: (e: React.TouchEvent) => void;
  onTouchMove?: (e: React.TouchEvent) => void;
  onTouchEnd?: (e: React.TouchEvent) => void;
}

export const Card: React.FC<CardProps> = ({
  children,
  depth = 0,
  variant = 'normal',
  className = '',
  onClick,
  onContextMenu,
  onTouchStart,
  onTouchMove,
  onTouchEnd
}) => {
  const depthClass = `depth-${Math.min(depth, 6)}`;
  const variantClass = `variant-${variant}`;

  return (
    <article
      className={`post-card ${depthClass} ${variantClass} ${className}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {children}
    </article>
  );
};
