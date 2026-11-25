"use client";

import { useCallback, useRef, useState } from "react";
import { useSpring2D } from "@inkwellio/ui/client";

interface MagneticButtonProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  children: React.ReactNode;
}

export function MagneticButton({ children, style, onPointerMove, onPointerLeave, ...props }: MagneticButtonProps) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const springOffset = useSpring2D(offset, { stiffness: 400, damping: 28 });
  const btnRef = useRef<HTMLAnchorElement>(null);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLAnchorElement>) => {
      if (typeof window !== "undefined") {
        if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      }

      if (!btnRef.current) return;
      const rect = btnRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      // Magnetic pull clamped to max ±4px
      const pullX = Math.max(-4, Math.min(4, (e.clientX - centerX) * 0.2));
      const pullY = Math.max(-4, Math.min(4, (e.clientY - centerY) * 0.2));

      setOffset({ x: pullX, y: pullY });
      if (onPointerMove) onPointerMove(e);
    },
    [onPointerMove]
  );

  const handlePointerLeave = useCallback(
    (e: React.PointerEvent<HTMLAnchorElement>) => {
      setOffset({ x: 0, y: 0 });
      if (onPointerLeave) onPointerLeave(e);
    },
    [onPointerLeave]
  );

  return (
    <a
      ref={btnRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={{
        ...style,
        transform: `translate3d(${springOffset.x}px, ${springOffset.y}px, 0)`,
        willChange: "transform",
      }}
      {...props}
    >
      {children}
    </a>
  );
}
