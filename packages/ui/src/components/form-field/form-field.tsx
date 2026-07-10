import * as React from "react";
import { cn } from "../../lib/cn.js";

export interface FormFieldProps {
  /** Field label text. */
  label: React.ReactNode;
  /** The single control element (Input, Select, Combobox, Checkbox, …). */
  children: React.ReactElement;
  /** Marks the field required and appends a required marker to the label. */
  required?: boolean;
  /** Help/hint text rendered beneath the control. */
  help?: React.ReactNode;
  /** Error text. When present the control is marked invalid and the error renders in danger. */
  error?: React.ReactNode;
  className?: string;
}

interface WiredControlProps {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-required"?: boolean;
}

/**
 * Composes a label + control + help + error with a required marker, and wires the accessibility
 * relationships automatically: it generates an id for the control, points the label at it, sets
 * `aria-invalid` + `aria-describedby` when an error is shown, and references the help/error text.
 * Show the error on blur or on submit by toggling the `error` prop — the wiring is the same either way.
 */
export function FormField({
  label,
  children,
  required = false,
  help,
  error,
  className,
}: FormFieldProps) {
  const generatedId = React.useId();
  const helpId = `${generatedId}-help`;
  const errorId = `${generatedId}-error`;

  const childProps = children.props as WiredControlProps;
  const controlId = childProps.id ?? generatedId;
  const describedBy =
    [help ? helpId : null, error ? errorId : null, childProps["aria-describedby"]]
      .filter(Boolean)
      .join(" ") || undefined;

  const control = React.cloneElement(children, {
    id: controlId,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : childProps["aria-invalid"],
    "aria-required": required || undefined,
  } as WiredControlProps);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={controlId} className="text-sm font-medium text-text-primary">
        {label}
        {required && (
          <span aria-hidden className="ml-0.5 text-danger">
            *
          </span>
        )}
      </label>
      {control}
      {help && (
        <p id={helpId} className="text-caption text-text-muted">
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-caption text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
