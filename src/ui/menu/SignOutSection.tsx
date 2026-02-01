import React from 'react';
import { LogOut } from 'lucide-react';
import { MenuSection } from './MenuSection';

interface SignOutSectionProps {
  onSignOut: () => void;
}

export function SignOutSection({ onSignOut }: SignOutSectionProps) {
  return (
    <MenuSection title="Account" icon={<LogOut size={16} />} collapsible={false}>
      <button className="menu-button danger" onClick={onSignOut}>
        <LogOut size={14} /> Sign out
      </button>
    </MenuSection>
  );
}
