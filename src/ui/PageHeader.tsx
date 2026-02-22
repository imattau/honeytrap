import React from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  showBack?: boolean;
  onBack?: () => void;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  icon,
  showBack = true,
  onBack,
  className = ''
}) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) {
      flushSync(() => navigate(-1));
    } else {
      flushSync(() => navigate('/'));
    }
  };

  return (
    <div className={`page-header-root ${className}`}>
      {showBack && (
        <button
          type="button"
          className="author-back"
          onClick={handleBack}
          aria-label="Go back"
        >
          <ArrowLeft size={18} />
        </button>
      )}
      <div className="page-header-content">
        <div className="page-header-title">
          {icon && <span className="page-header-icon">{icon}</span>}
          {title}
        </div>
        {subtitle && <div className="page-header-subtitle">{subtitle}</div>}
      </div>
    </div>
  );
};
