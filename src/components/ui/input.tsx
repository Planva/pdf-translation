// src/components/ui/input.tsx
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", value, defaultValue, onChange, ...rest }, ref) => {
    // 无论外部给没给 value/defaultValue，这里都保证受控 + 字符串
    const controlledValue = (value ?? defaultValue ?? "") as string;

    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted dark:border-border/80 md:text-sm",
          className
        )}
        ref={ref}
        value={controlledValue}
        onChange={onChange}
        {...rest}
      />
    );
  }
);

Input.displayName = "Input";
export default Input;
