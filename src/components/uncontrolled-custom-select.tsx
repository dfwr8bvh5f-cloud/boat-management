"use client";

import { useState } from "react";
import { CustomSelect } from "./custom-select";

// A drop-in replacement for a plain <select defaultValue=... name=...> sitting
// inside a server-rendered form (no parent-held state, submitted natively via
// FormData) - CustomSelect itself is always controlled, so this is the small
// client island that owns that local state for the server-component callers
// that have no other reason to become client components themselves.
export function UncontrolledCustomSelect({
  name,
  defaultValue = "",
  options,
  placeholder,
  className,
  emphasizeEmpty,
  disabled,
}: {
  name: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
  emphasizeEmpty?: boolean;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <CustomSelect
      name={name}
      value={value}
      onChange={setValue}
      options={options}
      placeholder={placeholder}
      className={className}
      emphasizeEmpty={emphasizeEmpty}
      disabled={disabled}
    />
  );
}
