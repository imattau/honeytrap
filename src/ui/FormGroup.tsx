import React from 'react';

interface FormGroupProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'textarea' | 'password' | 'url';
  id?: string;
  className?: string;
  disabled?: boolean;
}

export const FormGroup: React.FC<FormGroupProps> = ({
  label,
  value,
  onChange,
  placeholder = '',
  type = 'text',
  id,
  className = '',
  disabled = false
}) => {
  const inputId = id ?? `form-group-${label.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div className={`form-group-root ${className}`}>
      <label htmlFor={inputId} className="search-label">
        {label}
      </label>
      {type === 'textarea' ? (
        <textarea
          id={inputId}
          className="profile-edit-textarea"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
      ) : (
        <input
          id={inputId}
          type={type}
          className="search-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
      )}
    </div>
  );
};
