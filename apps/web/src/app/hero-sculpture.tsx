/**
 * HeroSculpture — Pure Server Component dual-mode 3D ink sculpture behind LivingHeroArtifact.
 * Active theme image is selected via [data-theme] CSS rules and preloaded in <head>
 * by /scripts/theme.js with fetchpriority="high", so only one image downloads per load
 * and paints immediately without waiting for React hydration (0 client JS overhead).
 */
export function HeroSculpture() {
  return (
    <div className="hero-sculpture-stage" aria-hidden="true">
      <div className="hero-sculpture-scroll">
        <div className="hero-sculpture-parallax">
          <div className="hero-sculpture-media" role="presentation" />
        </div>
      </div>
    </div>
  );
}
