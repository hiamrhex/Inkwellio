"use client";

import { useEffect, useRef, useState } from "react";

export interface SpringConfig {
  stiffness?: number;
  damping?: number;
  mass?: number;
  precision?: number;
}

const DEFAULT_CONFIG: Required<SpringConfig> = {
  stiffness: 140,
  damping: 20,
  mass: 1.0,
  precision: 0.001,
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * 1D Spring physics hook.
 * Runs on requestAnimationFrame, cleanly stops at rest (idle CPU = 0%),
 * and immediately snaps with zero animation on prefers-reduced-motion: reduce.
 */
export function useSpring(target: number, config: SpringConfig = {}): number {
  const { stiffness, damping, mass, precision } = { ...DEFAULT_CONFIG, ...config };
  const [value, setValue] = useState(target);

  const currentRef = useRef(target);
  const targetRef = useRef(target);
  const velocityRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  useEffect(() => {
    targetRef.current = target;

    // Immediate snap on reduced motion
    if (prefersReducedMotion()) {
      currentRef.current = target;
      velocityRef.current = 0;
      return;
    }

    // If already at target and at rest, avoid scheduling unnecessary RAF
    if (
      Math.abs(currentRef.current - target) < precision &&
      Math.abs(velocityRef.current) < precision
    ) {
      return;
    }

    const animate = (now: number) => {
      if (lastTimeRef.current === null) {
        lastTimeRef.current = now;
      }
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.064);
      lastTimeRef.current = now;

      const current = currentRef.current;
      const targetVal = targetRef.current;
      const velocity = velocityRef.current;

      const force = -stiffness * (current - targetVal) - damping * velocity;
      const acceleration = force / mass;
      const newVelocity = velocity + acceleration * dt;
      const newValue = current + newVelocity * dt;

      currentRef.current = newValue;
      velocityRef.current = newVelocity;

      // Check rest criteria: stops loop cleanly so idle CPU = 0%
      if (
        Math.abs(targetVal - newValue) < precision &&
        Math.abs(newVelocity) < precision
      ) {
        currentRef.current = targetVal;
        velocityRef.current = 0;
        setValue(targetVal);
        rafRef.current = null;
        lastTimeRef.current = null;
        return;
      }

      setValue(newValue);
      rafRef.current = requestAnimationFrame(animate);
    };

    if (rafRef.current === null) {
      lastTimeRef.current = null;
      rafRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [target, stiffness, damping, mass, precision]);

  // Derived return value on reduced motion — zero animation, immediate snap
  if (prefersReducedMotion()) {
    return target;
  }

  return value;
}

/**
 * 2D Spring physics hook for 2D vectors (e.g. 3D tilt, parallax offset).
 * Runs single combined RAF loop, stopping cleanly at rest.
 */
export function useSpring2D(
  target: { x: number; y: number },
  config: SpringConfig = {}
): { x: number; y: number } {
  const { stiffness, damping, mass, precision } = { ...DEFAULT_CONFIG, ...config };
  const [value, setValue] = useState(target);

  const currentRef = useRef(target);
  const targetRef = useRef(target);
  const velocityRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  const targetX = target.x;
  const targetY = target.y;

  useEffect(() => {
    targetRef.current = { x: targetX, y: targetY };

    if (prefersReducedMotion()) {
      currentRef.current = { x: targetX, y: targetY };
      velocityRef.current = { x: 0, y: 0 };
      return;
    }

    if (
      Math.abs(currentRef.current.x - targetX) < precision &&
      Math.abs(currentRef.current.y - targetY) < precision &&
      Math.abs(velocityRef.current.x) < precision &&
      Math.abs(velocityRef.current.y) < precision
    ) {
      return;
    }

    const animate = (now: number) => {
      if (lastTimeRef.current === null) {
        lastTimeRef.current = now;
      }
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.064);
      lastTimeRef.current = now;

      const cur = currentRef.current;
      const tgt = targetRef.current;
      const vel = velocityRef.current;

      const fx = -stiffness * (cur.x - tgt.x) - damping * vel.x;
      const fy = -stiffness * (cur.y - tgt.y) - damping * vel.y;

      const ax = fx / mass;
      const ay = fy / mass;

      const nvx = vel.x + ax * dt;
      const nvy = vel.y + ay * dt;

      const nx = cur.x + nvx * dt;
      const ny = cur.y + nvy * dt;

      currentRef.current = { x: nx, y: ny };
      velocityRef.current = { x: nvx, y: nvy };

      const atRestX = Math.abs(tgt.x - nx) < precision && Math.abs(nvx) < precision;
      const atRestY = Math.abs(tgt.y - ny) < precision && Math.abs(nvy) < precision;

      if (atRestX && atRestY) {
        currentRef.current = tgt;
        velocityRef.current = { x: 0, y: 0 };
        setValue(tgt);
        rafRef.current = null;
        lastTimeRef.current = null;
        return;
      }

      setValue({ x: nx, y: ny });
      rafRef.current = requestAnimationFrame(animate);
    };

    if (rafRef.current === null) {
      lastTimeRef.current = null;
      rafRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [targetX, targetY, stiffness, damping, mass, precision]);

  // Derived return value on reduced motion — zero animation, immediate snap
  if (prefersReducedMotion()) {
    return target;
  }

  return value;
}
