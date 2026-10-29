"use client";

// A plain <input type="number"> with the "don't let an accidental scroll
// over the field change its value" guard (blur on wheel) built in. Needed
// as its own Client Component because that guard is an event handler - a
// Server Component can render a native element directly, but can't pass it
// a function prop (onWheel) the way it can a string or boolean one, since a
// function isn't serializable across the server/client boundary. Confirmed
// live: inlining the handler straight into a plain <input> rendered by a
// Server Component (no "use client" in that file) throws "Event handlers
// cannot be passed to Client Component props" on every render - exactly
// what crashed the bank page's "add income" form (canEdit only, so every
// captain and every management view hit it) and, latently, the boat edit
// form's sale-price field.
export function NumberInput({
  name,
  id,
  step = "0.01",
  required,
  disabled,
  placeholder,
  defaultValue,
  className,
}: {
  name: string;
  id?: string;
  step?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  defaultValue?: string | number;
  className?: string;
}) {
  return (
    <input
      id={id}
      name={name}
      type="number"
      step={step}
      required={required}
      disabled={disabled}
      placeholder={placeholder}
      defaultValue={defaultValue}
      onWheel={(e) => e.currentTarget.blur()}
      className={className}
    />
  );
}
