"use client";

import { useState, type ChangeEvent } from "react";

interface PasswordFieldProps {
  readonly id: string;
  readonly name: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly autoComplete: "current-password" | "new-password";
  readonly placeholder?: string;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly required?: boolean;
  readonly "aria-invalid"?: "true" | undefined;
  readonly "aria-describedby"?: string | undefined;
}

/**
 * Pure state transition helper for the show/hide password toggle.
 * Guarantees aria-label="Show password" stays constant while aria-pressed and input type flip.
 */
export function getPasswordVisibilityState(visible: boolean) {
  return {
    inputType: visible ? ("text" as const) : ("password" as const),
    ariaLabel: "Show password" as const,
    ariaPressed: visible,
    buttonType: "button" as const,
  };
}

/**
 * Shared accessible password field with inline show/hide toggle.
 * Keeps aria-label="Show password" constant while toggling aria-pressed so
 * screen readers never announce a double inversion.
 */
export function PasswordField({
  id,
  name,
  value,
  onChange,
  autoComplete,
  placeholder,
  minLength,
  maxLength,
  required = true,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const state = getPasswordVisibilityState(visible);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  return (
    <div className="auth-password-wrap">
      <input
        id={id}
        name={name}
        type={state.inputType}
        autoComplete={autoComplete}
        spellCheck={false}
        minLength={minLength}
        maxLength={maxLength}
        required={required}
        value={value}
        onChange={handleChange}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        className="auth-input auth-input-password"
        placeholder={placeholder}
      />
      <button
        type={state.buttonType}
        aria-label={state.ariaLabel}
        aria-pressed={state.ariaPressed}
        className="auth-password-toggle"
        onClick={() => setVisible((prev) => !prev)}
      >
        {visible ? (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-6.5 0-10-8-10-8a21.8 21.8 0 0 1 5.06-6.94" />
            <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c6.5 0 10 8 10 8a21.6 21.6 0 0 1-3.17 4.72" />
            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            <path d="M3 3l18 18" />
          </svg>
        ) : (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M2 12s3.5-8 10-8 10 8 10 8-3.5 8-10 8-10-8-10-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
