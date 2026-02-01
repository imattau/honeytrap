import React from 'react';

interface MenuPillProps {
  label: string;
  count: number;
  active?: boolean;
  onClick: () => void;
}

export function MenuPill({ label, count, active = false, onClick }: MenuPillProps) {
  return (
    <button className={`menu-pill ${active ? 'active' : ''}`} onClick={onClick}>
      {label} <span className="menu-pill-count">{count}</span>
    </button>
  );
}
