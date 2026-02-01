import React from 'react';

interface MenuSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  collapsible?: boolean;
  onToggle?: (open: boolean) => void;
}

export function MenuSection({
  title,
  icon,
  children,
  defaultOpen = false,
  collapsible = true,
  onToggle
}: MenuSectionProps) {
  if (!collapsible) {
    return (
      <section className="menu-section">
        <div className="menu-section-title">
          <span className="menu-section-icon">{icon}</span>
          <span>{title}</span>
        </div>
        <div className="menu-section-body">{children}</div>
      </section>
    );
  }
  return (
    <details
      className="menu-section"
      open={defaultOpen}
      onToggle={(event) => onToggle?.((event.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="menu-section-title">
        <span className="menu-section-icon">{icon}</span>
        <span>{title}</span>
      </summary>
      <div className="menu-section-body">{children}</div>
    </details>
  );
}
