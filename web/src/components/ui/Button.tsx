import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium tracking-wide transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-950 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-br from-forest-600 to-forest-700 text-white hover:from-forest-500 hover:to-forest-600 shadow-lg shadow-forest-900/40 hover:shadow-xl hover:shadow-forest-900/50 border border-forest-600/30",
        destructive:
          "bg-gradient-to-br from-clay-600 to-clay-700 text-white hover:from-clay-500 hover:to-clay-600 shadow-lg shadow-clay-900/40 border border-clay-600/30",
        outline:
          "border border-stone-700 bg-transparent hover:bg-surface-900/60 hover:border-forest-600/50 text-stone-300 hover:text-stone-100",
        secondary:
          "bg-surface-900/80 text-stone-200 hover:bg-surface-800 border border-stone-800",
        ghost:
          "hover:bg-surface-900/60 hover:text-stone-100 text-stone-400",
        link:
          "text-forest-400 underline-offset-4 hover:underline hover:text-forest-300",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-12 rounded-lg px-8 text-base font-display",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
