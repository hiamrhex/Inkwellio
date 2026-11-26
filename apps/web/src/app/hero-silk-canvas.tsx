"use client";

import { useEffect, useRef, useState } from "react";

const VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
  float x = float((gl_VertexID & 1) << 2) - 1.0;
  float y = float((gl_VertexID & 2) << 1) - 1.0;
  v_uv = vec2(x * 0.5 + 0.5, y * 0.5 + 0.5);
  gl_Position = vec4(x, y, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform float u_mouseEnergy;
uniform float u_theme;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float silkField(vec2 p, float t, vec2 mOffset) {
  vec2 q = p + mOffset * 0.22;
  float w1 = sin(q.x * 2.1 - q.y * 1.45 + t * 0.42);
  float w2 = cos(q.x * 1.35 + q.y * 2.25 - t * 0.31 + w1 * 0.85);
  float w3 = sin((q.x + q.y) * 1.85 + w2 * 1.1 - t * 0.24);
  return 0.5 * w1 + 0.32 * w2 + 0.18 * w3;
}

void main() {
  vec2 res = max(u_resolution, vec2(1.0));
  vec2 uv = gl_FragCoord.xy / res;
  float aspect = res.x / res.y;

  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  vec2 m = (u_mouse - 0.5) * vec2(aspect, 1.0);

  float pointerDist = length(p - m);
  float cursorLift = exp(-pointerDist * pointerDist * 3.4) * u_mouseEnergy;

  float t = u_time * 0.55;
  float primary = silkField(p, t, m);
  float secondary = silkField(p * 1.18 + vec2(0.35, -0.2), t * 0.8 + primary * 0.55, m);

  float sweepAxis = (p.y * 1.15 - p.x * 0.42) + primary * 0.28 + secondary * 0.14;
  float crestMain = exp(-pow(sweepAxis * 2.55, 2.0));
  float crestEdge = exp(-pow((sweepAxis - 0.26) * 4.4, 2.0)) * 0.55;
  float crestFold = smoothstep(-0.2, 0.92, primary * 0.5 + secondary * 0.5);

  float silkIntensity = crestMain * (0.11 + 0.05 * crestFold) + crestEdge * 0.08 + cursorLift * 0.06;
  silkIntensity = clamp(silkIntensity, 0.0, 0.20);

  float vignette = smoothstep(1.35, 0.22, length((uv - 0.5) * vec2(1.15, 1.25)));
  silkIntensity *= vignette;

  float grain = (hash12(gl_FragCoord.xy + fract(u_time * 13.7) * 97.0) - 0.5) * 0.025;

  if (u_theme > 0.5) {
    vec3 paperBase = vec3(0.9804, 0.9804, 0.9804);
    vec3 inkTint = vec3(0.82, 0.825, 0.845);
    vec3 col = mix(paperBase, inkTint, silkIntensity * 0.82) + grain * 0.45;
    outColor = vec4(clamp(col, 0.0, 1.0), clamp(silkIntensity * 1.15 + 0.03, 0.0, 1.0));
  } else {
    vec3 col = vec3(silkIntensity) + grain;
    outColor = vec4(clamp(col, 0.0, 1.0), clamp(silkIntensity * 1.45 + 0.04, 0.0, 1.0));
  }
}
`;

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

interface SharedPointerWindow extends Window {
  __inkwellioPointer?: { x: number; y: number; active: boolean };
}

/**
 * HeroSilkCanvas — Subordinate WebGL2 atmosphere behind hero sculpture.
 * Uses ResizeObserver-cached host rect (zero layout reads inside rAF), reads
 * window.__inkwellioPointer (zero duplicate pointer listeners), and yields
 * initialization across animation frames to keep main-thread work <= 50 ms.
 */
export function HeroSilkCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [useCssFallback, setUseCssFallback] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
    });

    if (!gl) {
      const id = requestAnimationFrame(() => setUseCssFallback(true));
      return () => cancelAnimationFrame(id);
    }

    let disposed = false;
    let initRaf = 0;
    let rafId: number | null = null;
    let io: IntersectionObserver | null = null;
    let ro: ResizeObserver | null = null;
    let themeObserver: MutationObserver | null = null;
    let program: WebGLProgram | null = null;
    let vs: WebGLShader | null = null;
    let fs: WebGLShader | null = null;
    let vao: WebGLVertexArrayObject | null = null;

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let isReduced = reducedMotionQuery.matches;
    let isVisible = true;
    let isTabVisible = !document.hidden;

    const initialRect = host.getBoundingClientRect();
    let cachedRect = {
      left: initialRect.left,
      top: initialRect.top,
      width: Math.max(1, initialRect.width),
      height: Math.max(1, initialRect.height),
    };

    const syncCanvasDims = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.max(1, Math.floor(cachedRect.width * dpr));
      const height = Math.max(1, Math.floor(cachedRect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    };
    syncCanvasDims();

    const updateCachedRect = () => {
      const r = host.getBoundingClientRect();
      cachedRect = {
        left: r.left,
        top: r.top,
        width: Math.max(1, r.width),
        height: Math.max(1, r.height),
      };
      syncCanvasDims();
    };

    initRaf = requestAnimationFrame(() => {
      if (disposed) return;

      const parallelExt = gl.getExtension("KHR_parallel_shader_compile") as {
        COMPLETION_STATUS_KHR: number;
      } | null;

      vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
      fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
      if (!vs || !fs) {
        setUseCssFallback(true);
        return;
      }

      program = gl.createProgram();
      if (!program) {
        setUseCssFallback(true);
        return;
      }
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);

      const finishSetup = () => {
        if (disposed || !program || !vs || !fs) return;

        if (parallelExt && !gl.getProgramParameter(program, parallelExt.COMPLETION_STATUS_KHR)) {
          initRaf = requestAnimationFrame(finishSetup);
          return;
        }

        if (
          !gl.getShaderParameter(vs, gl.COMPILE_STATUS) ||
          !gl.getShaderParameter(fs, gl.COMPILE_STATUS) ||
          !gl.getProgramParameter(program, gl.LINK_STATUS)
        ) {
          setUseCssFallback(true);
          return;
        }

        vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        const uTime = gl.getUniformLocation(program, "u_time");
        const uResolution = gl.getUniformLocation(program, "u_resolution");
        const uMouse = gl.getUniformLocation(program, "u_mouse");
        const uMouseEnergy = gl.getUniformLocation(program, "u_mouseEnergy");
        const uTheme = gl.getUniformLocation(program, "u_theme");

        const startTime = performance.now();
        let lastDrawTime = 0;
        const minFrameMs = 1000 / 30;
        let currentMouseX = 0.5;
        let currentMouseY = 0.5;
        let currentEnergy = 0.25;

        const getThemeFactor = () =>
          document.documentElement.getAttribute("data-theme") === "light" ? 1.0 : 0.0;

        const drawFrame = (timeSeconds: number) => {
          if (!program || !vao) return;
          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.useProgram(program);
          gl.bindVertexArray(vao);
          gl.uniform1f(uTime, timeSeconds);
          gl.uniform2f(uResolution, canvas.width, canvas.height);
          gl.uniform2f(uMouse, currentMouseX, 1.0 - currentMouseY);
          gl.uniform1f(uMouseEnergy, currentEnergy);
          gl.uniform1f(uTheme, getThemeFactor());
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        };

        const stopLoop = () => {
          if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
          }
        };

        const tick = (now: number) => {
          if (!isVisible || !isTabVisible || isReduced || disposed) {
            rafId = null;
            return;
          }

          if (now - lastDrawTime >= minFrameMs) {
            lastDrawTime = now;
            const shared = (window as SharedPointerWindow).__inkwellioPointer;
            let targetX = 0.5;
            let targetY = 0.5;
            let targetEnergy = 0.25;

            if (shared && shared.active) {
              targetX = Math.max(0, Math.min(1, (shared.x - cachedRect.left) / cachedRect.width));
              targetY = Math.max(0, Math.min(1, (shared.y - cachedRect.top) / cachedRect.height));
              targetEnergy = 1.0;
            }

            currentMouseX += (targetX - currentMouseX) * 0.075;
            currentMouseY += (targetY - currentMouseY) * 0.075;
            currentEnergy += (targetEnergy - currentEnergy) * 0.06;
            drawFrame((now - startTime) * 0.001);
          }

          rafId = requestAnimationFrame(tick);
        };

        const syncRunState = () => {
          if (isReduced) {
            stopLoop();
            drawFrame(1.8);
            return;
          }
          if (isVisible && isTabVisible && rafId === null) {
            rafId = requestAnimationFrame(tick);
          } else if ((!isVisible || !isTabVisible) && rafId !== null) {
            stopLoop();
          }
        };

        io =
          typeof IntersectionObserver !== "undefined"
            ? new IntersectionObserver(
                (entries) => {
                  const entry = entries[0];
                  if (entry) {
                    isVisible = entry.isIntersecting;
                    syncRunState();
                  }
                },
                { threshold: 0.01 },
              )
            : null;
        io?.observe(host);

        ro =
          typeof ResizeObserver !== "undefined"
            ? new ResizeObserver(() => {
                updateCachedRect();
                if (isReduced) drawFrame(1.8);
              })
            : null;
        ro?.observe(host);

        themeObserver = new MutationObserver(() => {
          if (isReduced) drawFrame(1.8);
        });
        themeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["data-theme"],
        });

        const handleVisibilityChange = () => {
          isTabVisible = !document.hidden;
          syncRunState();
        };

        const handleMotionChange = (e: MediaQueryListEvent) => {
          isReduced = e.matches;
          syncRunState();
        };

        window.addEventListener("scroll", updateCachedRect, { passive: true });
        document.addEventListener("visibilitychange", handleVisibilityChange);
        reducedMotionQuery.addEventListener("change", handleMotionChange);

        syncRunState();

        // Store cleanup hook on host dataset closure
        cleanupListeners = () => {
          stopLoop();
          window.removeEventListener("scroll", updateCachedRect);
          document.removeEventListener("visibilitychange", handleVisibilityChange);
          reducedMotionQuery.removeEventListener("change", handleMotionChange);
        };
      };

      initRaf = requestAnimationFrame(finishSetup);
    });

    let cleanupListeners: (() => void) | null = null;

    return () => {
      disposed = true;
      cancelAnimationFrame(initRaf);
      cleanupListeners?.();
      io?.disconnect();
      ro?.disconnect();
      themeObserver?.disconnect();
      if (vao) gl.deleteVertexArray(vao);
      if (program) gl.deleteProgram(program);
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className="hero-silk-backdrop"
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
        overflow: "hidden",
      }}
    >
      {useCssFallback ? (
        <div className="hero-silk-fallback" />
      ) : (
        <canvas
          ref={canvasRef}
          className="hero-silk-canvas"
          style={{
            display: "block",
            width: "100%",
            height: "100%",
          }}
        />
      )}
    </div>
  );
}
