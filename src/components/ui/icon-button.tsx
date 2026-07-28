import React from "react";

import { Button, type ButtonProps } from "@/components/ui/button";

export interface IconButtonProps extends Omit<ButtonProps, "size" | "aria-label" | "title"> {
  label: string;
  tooltip?: string;
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, tooltip = label, ...props }, ref) => (
    <Button
      ref={ref}
      size="icon"
      aria-label={label}
      title={tooltip}
      {...props}
    />
  ),
);

IconButton.displayName = "IconButton";

export { IconButton };
