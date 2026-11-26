"use client";

import { useEffect, useRef, useState } from "react";

const VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
  // Fullscreen triangle using gl_VertexID (no VBO upload needed)
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
uniform float u_theme; // 0.0 = dark (#000000), 1.0 = light (#fafafa)

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

  // Multi-octave monochrome silk domain warp
  float t = u_time * 0.55;
  float primary = silkField(p, t, m);
  float secondary = silkField(p * 1.18 + vec2(0.35, -0.2), t * 0.8 + primary * 0.55, m);

  // Sweeping luminous silk ribbon crest across the hero diagonal
  float sweepAxis = (p.y * 1.15 - p.x * 0.42) + primary * 0.28 + secondary * 0.14;
  float crestMain = exp(-pow(sweepAxis * 2.55, 2.0));
  float crestEdge = exp(-pow((sweepAxis - 0.26) * 4.4, 2.0)) * 0.55;
  float crestFold = smoothstep(-0.2, 0.92, primary * 0.5 + secondary * 0.5);

  // Subordinate silk ribbon crest at restrained luminance (0.12 - 0.16 peak)
  // so it acts as depth atmosphere behind the 3D sculpture without competing.
  float silkIntensity = crestMain * (0.11 + 0.05 * crestFold) + crestEdge * 0.08 + cursorLift * 0.06;
  silkIntensity = clamp(silkIntensity, 0.0, 0.20);

  // Vignette fade near outer edges to blend into solid canvas seamlessly
  float vignette = smoothstep(1.35, 0.22, length((uv - 0.5) * vec2(1.15, 1.25)));
  silkIntensity *= vignette;

  // Procedural 0.025 film grain to prevent 8-bit banding
  float grain = (hash12(gl_FragCoord.xy + fract(u_time * 13.7) * 97.0) - 0.5) * 0.025;

  if (u_theme > 0.5) {
    // Light Mode (#fafafa canvas -> subtle cool graphite-silver ink wave)
    vec3 paperBase = vec3(0.9804, 0.9804, 0.9804); // #fafafa
    vec3 inkTint = vec3(0.82, 0.825, 0.845);
    vec3 col = mix(paperBase, inkTint, silkIntensity * 0.82) + grain * 0.45;
    outColor = vec4(clamp(col, 0.0, 1.0), clamp(silkIntensity * 1.15 + 0.03, 0.0, 1.0));
  } else {
    // Dark Mode (#000000 canvas -> luminous monochrome silver silk arc)
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
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/**
 * HeroSilkCanvas — Phase 3 WebGL2 monochrome silk-wave atmosphere.
 * Falls back cleanly to a pure CSS gradient + SVG grain layer if WebGL2
 * is unavailable, pauses completely when scrolled offscreen/hidden, and
 * freezes to a single static frame under prefers-reduced-motion: reduce.
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

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
    if (!vs || !fs) {
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      const id = requestAnimationFrame(() => setUseCssFallback(true));
      return () => cancelAnimationFrame(id);
    }

    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      const id = requestAnimationFrame(() => setUseCssFallback(true));
      return () => cancelAnimationFrame(id);
    }

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      const id = requestAnimationFrame(() => setUseCssFallback(true));
      return () => cancelAnimationFrame(id);
    }

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const uTime = gl.getUniformLocation(program, "u_time");
    const uResolution = gl.getUniformLocation(program, "u_resolution");
    const uMouse = gl.getUniformLocation(program, "u_mouse");
    const uMouseEnergy = gl.getUniformLocation(program, "u_mouseEnergy");
    const uTheme = gl.getUniformLocation(program, "u_theme");

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let isReduced = reducedMotionQuery.matches;
    let isVisible = true;
    let isTabVisible = !document.hidden;
    let rafId: number | null = null;
    const startTime = performance.now();
    let lastDrawTime = 0;
    const minFrameMs = 1000 / 30; // Strict 30 fps cap

    let targetMouseX = 0.5;
    let targetMouseY = 0.5;
    let currentMouseX = 0.5;
    let currentMouseY = 0.5;
    let targetEnergy = 0.25;
    let currentEnergy = 0.25;

    const getThemeFactor = () =>
      document.documentElement.getAttribute("data-theme") === "light" ? 1.0 : 0.0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const rect = host.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width * dpr));
      const height = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    };

    const drawFrame = (timeSeconds: number) => {
      resize();
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
      if (!isVisible || !isTabVisible || isReduced) {
        rafId = null;
        return;
      }

      if (now - lastDrawTime >= minFrameMs) {
        lastDrawTime = now;
        currentMouseX += (targetMouseX - currentMouseX) * 0.075;
        currentMouseY += (targetMouseY - currentMouseY) * 0.075;
        currentEnergy += (targetEnergy - currentEnergy) * 0.06;
        drawFrame((now - startTime) * 0.001);
      }

      rafId = requestAnimationFrame(tick);
    };

    const syncRunState = () => {
      if (isReduced) {
        stopLoop();
        drawFrame(1.8); // Static frame for reduced motion
        return;
      }
      if (isVisible && isTabVisible && rafId === null) {
        rafId = requestAnimationFrame(tick);
      } else if ((!isVisible || !isTabVisible) && rafId !== null) {
        stopLoop();
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (isReduced) return;
      const rect = host.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      targetMouseX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      targetMouseY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      targetEnergy = 1.0;
    };

    const handlePointerLeave = () => {
      targetEnergy = 0.25;
    };

    const io =
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

    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            if (isReduced) {
              drawFrame(1.8);
            } else {
              resize();
            }
          })
        : null;
    ro?.observe(host);

    const handleVisibilityChange = () => {
      isTabVisible = !document.hidden;
      syncRunState();
    };

    const handleMotionChange = (e: MediaQueryListEvent) => {
      isReduced = e.matches;
      syncRunState();
    };

    const themeObserver = new MutationObserver(() => {
      if (isReduced) {
        drawFrame(1.8);
      }
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    document.addEventListener("pointerleave", handlePointerLeave, { passive: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);
    reducedMotionQuery.addEventListener("change", handleMotionChange);

    syncRunState();

    return () => {
      stopLoop();
      io?.disconnect();
      ro?.disconnect();
      themeObserver.disconnect();
      window.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerleave", handlePointerLeave);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      reducedMotionQuery.removeEventListener("change", handleMotionChange);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
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
