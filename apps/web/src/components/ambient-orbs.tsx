/**
 * Two large GPU-composited drifting background orbs (monochrome silver + whisper emerald mist).
 */
export function AmbientOrbs() {
  return (
    <div className="ambient-backdrop" aria-hidden="true">
      <div className="ambient-orb ambient-orb-silver" />
      <div className="ambient-orb ambient-orb-emerald" />
    </div>
  );
}
