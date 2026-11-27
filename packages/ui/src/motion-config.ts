/**
 * Central motion and emerald-accent tuning configuration (Phase 1C).
 * Adjust `motionGain` (default 1.0) or `accentGain` (default 1.0) to scale
 * animation magnitudes or emerald wash strength without editing logic.
 */
export interface MotionConfig {
  readonly motionGain: number;
  readonly accentGain: number;
  readonly ambient: {
    readonly orbSilverShiftPx: number;
    readonly orbEmeraldShiftPx: number;
    readonly ribbonFloatPx: number;
    readonly badgeFloatPx: number;
    readonly authBackdropFloatPx: number;
  };
  readonly pointer: {
    readonly cursorGlowPx: number;
    readonly spotlightLerp: number;
    readonly heroRibbonShiftPx: number;
    readonly heroRibbonRotateDeg: number;
    readonly heroCardTiltMaxDeg: number;
    readonly bentoCardTiltMaxDeg: number;
    readonly bentoHoverLiftPx: number;
    readonly authCardTiltMaxDeg: number;
    readonly authBackdropShiftPx: number;
    readonly magneticPullPx: number;
    readonly magneticLabelPullPx: number;
    readonly canvasBendRadiusPx: number;
    readonly idleStopMs: number;
    readonly blurReturnMs: number;
    readonly hitTargetFlatMs: number;
    readonly hitTargetMoveLimitPx: number;
  };
  readonly scroll: {
    readonly heroExitScrollPx: number;
    readonly heroHeadlineExitPx: number;
    readonly heroCardExitPx: number;
    readonly heroCardExitDeg: number;
    readonly heroRibbonDropPx: number;
    readonly heroRibbonEndScale: number;
    readonly sideGlideOffsetPx: number;
    readonly sideGlideDropPx: number;
    readonly sideGlideRotateDeg: number;
    readonly sideGlideMinScale: number;
    readonly belowFoldDropPx: number;
    readonly belowFoldMinScale: number;
    readonly postLifeRunwayVh: number;
    readonly marqueeVelocityGain: number;
  };
  readonly accent: {
    readonly darkMistEmeraldAlpha: number;
    readonly darkMistSilverAlpha: number;
    readonly darkSpotlightSilverAlpha: number;
    readonly darkSpotlightEmeraldAlpha: number;
    readonly darkRimEmeraldAlpha: number;
    readonly darkCornerEmeraldAlpha: number;
    readonly lightMistEmeraldAlpha: number;
    readonly lightMistSilverAlpha: number;
    readonly lightSpotlightSlateAlpha: number;
    readonly lightSpotlightEmeraldAlpha: number;
    readonly lightRimEmeraldAlpha: number;
    readonly lightCornerEmeraldAlpha: number;
  };
}

export const motionConfig: MotionConfig = {
  motionGain: 1.0,
  accentGain: 1.0,
  ambient: {
    orbSilverShiftPx: 38,
    orbEmeraldShiftPx: 44,
    ribbonFloatPx: 10,
    badgeFloatPx: 5,
    authBackdropFloatPx: 8,
  },
  pointer: {
    cursorGlowPx: 580,
    spotlightLerp: 0.12,
    heroRibbonShiftPx: 38,
    heroRibbonRotateDeg: 2,
    heroCardTiltMaxDeg: 9.0,
    bentoCardTiltMaxDeg: 5.0,
    bentoHoverLiftPx: 7,
    authCardTiltMaxDeg: 6.0,
    authBackdropShiftPx: 28,
    magneticPullPx: 8.5,
    magneticLabelPullPx: 2,
    canvasBendRadiusPx: 260,
    idleStopMs: 1200,
    blurReturnMs: 400,
    hitTargetFlatMs: 200,
    hitTargetMoveLimitPx: 1.5,
  },
  scroll: {
    heroExitScrollPx: 520,
    heroHeadlineExitPx: 48,
    heroCardExitPx: 90,
    heroCardExitDeg: 6,
    heroRibbonDropPx: 75,
    heroRibbonEndScale: 1.06,
    sideGlideOffsetPx: 180,
    sideGlideDropPx: 36,
    sideGlideRotateDeg: 10,
    sideGlideMinScale: 0.9,
    belowFoldDropPx: 44,
    belowFoldMinScale: 0.97,
    postLifeRunwayVh: 360,
    marqueeVelocityGain: 1.15,
  },
  accent: {
    darkMistEmeraldAlpha: 0.075,
    darkMistSilverAlpha: 0.075,
    darkSpotlightSilverAlpha: 0.14,
    darkSpotlightEmeraldAlpha: 0.075,
    darkRimEmeraldAlpha: 0.36,
    darkCornerEmeraldAlpha: 0.08,
    lightMistEmeraldAlpha: 0.06,
    lightMistSilverAlpha: 0.06,
    lightSpotlightSlateAlpha: 0.11,
    lightSpotlightEmeraldAlpha: 0.065,
    lightRimEmeraldAlpha: 0.32,
    lightCornerEmeraldAlpha: 0.07,
  },
};

/** Serializes key motion-config multipliers as inline root style CSS variables. */
export function getMotionCssVars(cfg: MotionConfig = motionConfig): Record<string, string> {
  const mg = cfg.motionGain;
  const ag = cfg.accentGain;
  return {
    "--motion-gain": String(mg),
    "--accent-gain": String(ag),
    "--orb-silver-shift": `${(cfg.ambient.orbSilverShiftPx * mg).toFixed(1)}px`,
    "--orb-emerald-shift": `${(cfg.ambient.orbEmeraldShiftPx * mg).toFixed(1)}px`,
    "--ribbon-float-px": `${(cfg.ambient.ribbonFloatPx * mg).toFixed(1)}px`,
    "--badge-float-px": `${(cfg.ambient.badgeFloatPx * mg).toFixed(1)}px`,
    "--auth-backdrop-float-px": `${(cfg.ambient.authBackdropFloatPx * mg).toFixed(1)}px`,
    "--cursor-glow-size": `${cfg.pointer.cursorGlowPx}px`,
    "--hero-ribbon-shift": String(+(cfg.pointer.heroRibbonShiftPx * mg).toFixed(2)),
    "--hero-ribbon-rot": String(+(cfg.pointer.heroRibbonRotateDeg * mg).toFixed(2)),
    "--hero-tilt-max": String(+(cfg.pointer.heroCardTiltMaxDeg * mg).toFixed(2)),
    "--bento-tilt-max": String(+(cfg.pointer.bentoCardTiltMaxDeg * mg).toFixed(2)),
    "--bento-lift-px": `${(-cfg.pointer.bentoHoverLiftPx * mg).toFixed(1)}px`,
    "--auth-tilt-max": String(+(cfg.pointer.authCardTiltMaxDeg * mg).toFixed(2)),
    "--auth-backdrop-shift": String(+(cfg.pointer.authBackdropShiftPx * mg).toFixed(2)),
    "--magnetic-pull": String(+(cfg.pointer.magneticPullPx * mg).toFixed(2)),
    "--magnetic-label-pull": String(+(cfg.pointer.magneticLabelPullPx * mg).toFixed(2)),
    "--hero-exit-head-px": `${(-cfg.scroll.heroHeadlineExitPx * mg).toFixed(1)}px`,
    "--hero-exit-card-px": `${(-cfg.scroll.heroCardExitPx * mg).toFixed(1)}px`,
    "--hero-exit-card-deg": `${(cfg.scroll.heroCardExitDeg * mg).toFixed(2)}deg`,
    "--hero-exit-ribbon-px": `${(cfg.scroll.heroRibbonDropPx * mg).toFixed(1)}px`,
    "--hero-exit-ribbon-scale": String(+(1 + (cfg.scroll.heroRibbonEndScale - 1) * mg).toFixed(3)),
    "--side-glide-x": `${(cfg.scroll.sideGlideOffsetPx * mg).toFixed(1)}px`,
    "--side-glide-y": `${(cfg.scroll.sideGlideDropPx * mg).toFixed(1)}px`,
    "--side-glide-deg": `${(cfg.scroll.sideGlideRotateDeg * mg).toFixed(2)}deg`,
    "--side-glide-scale": String(+(1 - (1 - cfg.scroll.sideGlideMinScale) * mg).toFixed(3)),
    "--below-fold-y": `${(cfg.scroll.belowFoldDropPx * mg).toFixed(1)}px`,
    "--below-fold-scale": String(+(1 - (1 - cfg.scroll.belowFoldMinScale) * mg).toFixed(3)),
    "--post-life-runway": `${cfg.scroll.postLifeRunwayVh}vh`,
    "--emerald-mist-dark": (cfg.accent.darkMistEmeraldAlpha * ag).toFixed(4),
    "--silver-mist-dark": (cfg.accent.darkMistSilverAlpha * ag).toFixed(4),
    "--spot-silver-dark": (cfg.accent.darkSpotlightSilverAlpha * ag).toFixed(4),
    "--spot-emerald-dark": (cfg.accent.darkSpotlightEmeraldAlpha * ag).toFixed(4),
    "--rim-emerald-dark": (cfg.accent.darkRimEmeraldAlpha * ag).toFixed(4),
    "--corner-emerald-dark": (cfg.accent.darkCornerEmeraldAlpha * ag).toFixed(4),
    "--emerald-mist-light": (cfg.accent.lightMistEmeraldAlpha * ag).toFixed(4),
    "--silver-mist-light": (cfg.accent.lightMistSilverAlpha * ag).toFixed(4),
    "--spot-slate-light": (cfg.accent.lightSpotlightSlateAlpha * ag).toFixed(4),
    "--spot-emerald-light": (cfg.accent.lightSpotlightEmeraldAlpha * ag).toFixed(4),
    "--rim-emerald-light": (cfg.accent.lightRimEmeraldAlpha * ag).toFixed(4),
    "--corner-emerald-light": (cfg.accent.lightCornerEmeraldAlpha * ag).toFixed(4),
  };
}
