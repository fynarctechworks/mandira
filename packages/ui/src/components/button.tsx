import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * PRD 12.5 buttons.
 * - primary:   48 px, brand.primary fill, 16/500 text, full-width on mobile
 * - secondary: 48 px, transparent, 1.5 px brand.primary border
 * - tertiary:  44 px tap area, brand.primary text
 * Loading replaces the label with a spinner (the accessible name is kept).
 */
const buttonVariants = cva(
  "focus-ring inline-flex items-center justify-center gap-2 rounded-button font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-brand-primary text-text-on-primary active:bg-brand-primary-pressed",
        secondary: "border-[1.5px] border-brand-primary bg-transparent text-brand-primary",
        tertiary: "bg-transparent text-brand-primary underline-offset-4 hover:underline",
      },
      size: {
        // Heights are minimums so 200% OS text scale grows the control instead of clipping it.
        default: "min-h-12 px-4 text-body",
        tertiary: "min-h-11 px-2 text-body",
      },
      fullWidth: { true: "w-full", false: "" },
    },
    compoundVariants: [{ variant: "tertiary", size: "default", class: "min-h-11 px-2" }],
    defaultVariants: { variant: "primary", size: "default", fullWidth: false },
  },
);

type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Render as the child element (e.g. a link) while keeping button styling. */
    asChild?: boolean;
    /** Swaps the label for a spinner and marks the control busy. */
    loading?: boolean;
    children?: ReactNode;
  };

export function Button({
  className,
  variant,
  size,
  fullWidth,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  const resolvedSize = size ?? (variant === "tertiary" ? "tertiary" : "default");

  return (
    <Comp
      className={cn(buttonVariants({ variant, size: resolvedSize, fullWidth }), className)}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 aria-hidden="true" className="size-5 animate-spin" />
          <span className="sr-only">{children}</span>
        </>
      ) : (
        children
      )}
    </Comp>
  );
}

export { buttonVariants };
export type { ButtonProps };
