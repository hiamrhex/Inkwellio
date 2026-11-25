import Image from "next/image";
import darkSculpture from "../../public/images/hero-ink-dark.webp";
import lightSculpture from "../../public/images/hero-ink-light.webp";

/**
 * HeroSculpture — Dual-mode pre-rendered 3D architectural ink sculptures.
 * Layered behind LivingHeroArtifact (`aria-hidden="true"`, non-LCP, lazy-loaded),
 * fading cleanly via mix-blend-mode into Dark (#000000) and Light (#fafafa) stages.
 */
export function HeroSculpture() {
  return (
    <div className="hero-sculpture-stage" aria-hidden="true">
      <div className="hero-sculpture-scroll">
        <div className="hero-sculpture-parallax">
          <Image
            src={darkSculpture}
            alt=""
            aria-hidden="true"
            width={720}
            height={720}
            unoptimized
            loading="lazy"
            decoding="async"
            className="hero-sculpture-img hero-sculpture-dark"
          />
          <Image
            src={lightSculpture}
            alt=""
            aria-hidden="true"
            width={720}
            height={720}
            unoptimized
            loading="lazy"
            decoding="async"
            className="hero-sculpture-img hero-sculpture-light"
          />
        </div>
      </div>
    </div>
  );
}
