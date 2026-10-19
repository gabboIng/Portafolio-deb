export interface DiskLook {
  brightness: number;
  speed: number;
  stretch: number;
  detail: number;
  turbulence: number;
  density: number;
  doppler: number;
  cloudScale: number;
  cloudSpeed: number;
  cloudStrength: number;
  spare0: number;
  spare1: number;
  spare2: number;
  spare3: number;
}

export interface StarLook {
  brightness: number;
  density: number;
  contrast: number;
  warmth: number;
  twinkle: number;
}

export interface BloomLook {
  strength: number;
  threshold: number;
  knee: number;
  radius: number;
}

export interface HeroSettings {
  cameraY: number;
  distance: number;
  diskRadius: number;
  fov: number;
  centerX: number;
  centerY: number;
  cameraRoll: number;
  mouseYaw: number;
  centerFade: number;
  bloom: BloomLook;
  disk: DiskLook;
  stars: StarLook;
}

/** Shared deterministic production defaults for the browser and headless renderer. */
export function defaultHeroSettings(): HeroSettings {
  return {
    cameraY: 0.16,
    // Far enough back that the whole disk fits. At 13.5 the upper lensing arc
    // left the top of the frame and the far side of the disk ran off the right
    // edge, which on a full-bleed backdrop reads as a mistake rather than as a
    // crop. As a backdrop there is no smaller viewport to fall back to, so the
    // scene has to sit inside the frame on its own.
    distance: 16,
    diskRadius: 9,
    fov: 3,
    // Camera aim in NDC, so 0 is the middle of the frame.
    //
    // These used to sit far right (0.8/0.3 in the original hero, 0.34 here) to
    // keep the disk clear of the copy. As a full-bleed backdrop that is the
    // wrong trade: the disk is much wider than the shadow, so any large
    // rightward aim runs the far arm off the right edge, and no amount of
    // pulling the camera back fixes that without shrinking the hole to a speck.
    //
    // So the aim stays small. 0.09 is the same direction as before but a
    // fraction of the distance: far enough that the hole no longer sits under
    // the name now that the Hero shifts up and left, small enough to keep the
    // disk's far arm in frame.
    //
    // scripts/projectdisk.mjs traces the disk plane through this camera and
    // reports the largest disk still fully inside the frame: 7.50 -> 7.00 of
    // diskRadius at 1440x900, 8.00 -> 7.75 at 1920x1080, for 58px and 86px of
    // movement. The part given up is the outermost, dimmest end of the disk.
    // That script is straight-line geometry through the disk plane and does not
    // model the lensing, so read it as a bound on the crop and confirm against
    // the rendered frame rather than as the visual extent.
    centerX: 0.09,
    centerY: 0.1,
    cameraRoll: -0.27,
    mouseYaw: 0.15,
    // Darkens a horizontal band through the middle of the frame for text
    // legibility. Raising it from 0.45 to 0.55 when the palette went greyscale:
    // the CSS scrim is tinted to the new #111111 page colour rather than to a
    // separate darker one, so it contributes less contrast against the disk than
    // it used to, and the hole has to carry more of its own dimming. Still far
    // from 1, which dimmed the hole itself and read as a smudge.
    centerFade: 0.55,
    // Bloom down slightly for the same reason: against a flat grey page a
    // white-hot halo is the loudest thing on screen, and at 1.0 it pulled the
    // eye off the copy entirely.
    bloom: { strength: 0.85, threshold: 0, knee: 0.18, radius: 1.5 },
    disk: {
      brightness: 0.75,
      speed: 0.75,
      stretch: 5.75,
      detail: 3.44,
      turbulence: 4.46,
      density: 1.38,
      doppler: 1.21,
      cloudScale: 20,
      cloudSpeed: 0.3,
      cloudStrength: 0.2,
      spare0: 0.43,
      spare1: -0.25,
      spare2: -0.67,
      spare3: 0.69,
    },
    stars: { brightness: 1, density: 1, contrast: 13, warmth: 0.5, twinkle: 0 },
  };
}
