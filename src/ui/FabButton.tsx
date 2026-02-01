import React from 'react';
import { Plus } from 'lucide-react';

interface FabButtonProps {
  onClick: () => void;
  label?: string;
  hidden?: boolean;
}

export function FabButton({ onClick, label = 'New post', hidden }: FabButtonProps) {
  if (hidden) return null;
  return (
    <button className="fab-button" onClick={onClick} aria-label={label}>
      <Plus size={22} />
    </button>
  );
}
