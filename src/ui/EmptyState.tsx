import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  message?: string;
  icon?: LucideIcon;
  actionLabel?: string;
  onAction?: () => void;
  loading?: boolean;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  message,
  icon: Icon,
  actionLabel,
  onAction,
  loading = false,
  className = ''
}) => {
  return (
    <div className={`feed-empty-state ${className}`}>
      {Icon && !loading && <Icon size={40} className="mx-auto mb-4 text-glow opacity-50" />}
      <div className="feed-empty-title">
        {loading ? 'Loading...' : title}
      </div>
      {message && <div className="feed-empty-copy">{message}</div>}
      {actionLabel && onAction && !loading && (
        <button
          type="button"
          className="feed-empty-action mt-2"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};
