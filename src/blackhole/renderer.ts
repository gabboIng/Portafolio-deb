// Browser lifecycle for the baked black-hole pipeline. VGPU stays dynamically imported.

import type { Frame, Gpu, Surface } from "vgpu";

type VgpuApi = typeof import("vgpu");

import {
  createEffects,
  createTargets,
  destroyTargets,
  prewarm,
  renderChain,
  setBakeUniforms,
  setBindings,
  setPostUniforms,
  setShadeUniforms,
  type Effects,
  type Targets,
} from "./pipeline";
import { defaultHeroSettings } from "./settings";

const SCENE_YAW_TAU_S = 0.325;

const MAX_FRAME_DT_S = 0.1;

const TARGET_FPS = 30;

const MOBILE_QUERY = "(max-width: 767px)";

/*
 * Render scale for the backdrop.
 *
 * Sub-native on purpose: this is a full-bleed, always-on background, and the
 * shadow, the photon ring, and the lensing arcs are all soft edges. At 1.0 the
 * ring aliases away at some angles and the disk filaments dissolve; at 0.7 the
 * shape holds and the fine structure softens, which is the better trade for
 * something that is always behind the copy.
 *
 * The cost is real though. A weaker GPU already spends most of its frame budget
 * compiling `shade`, and the fragment cost scales with the pixels. So this is
 * the first thing to raise once the shader is cheaper, not a free win.
 */
const DRAFT_DPR = 0.7;

interface RendererOptions {
  canvas: HTMLCanvasElement;
  /** Freeze animation and draw a single frame instead of looping. */
  reducedMotion?: boolean;
  /**
   * Called once, after a frame has actually been submitted. `ready` only means
   * the pipelines compiled, so the canvas can still be blank when it resolves.
   * Also fires on the reduced-motion path, which draws a single frame outside
   * the loop.
   */
  onFirstFrame?: () => void;
}

type RenderSize = { width: number; height: number };

export function createRenderer({
  canvas,
  reducedMotion = false,
  onFirstFrame,
}: RendererOptions) {
  const settings = defaultHeroSettings();
  if (reducedMotion) {
    settings.disk.speed = 0;
    settings.disk.cloudSpeed = 0;
    settings.stars.twinkle = 0;
  }
  const desktopLayout = {
    centerX: settings.centerX,
    centerY: settings.centerY,
    cameraRoll: settings.cameraRoll,
    mouseYaw: settings.mouseYaw,
    centerFade: settings.centerFade,
  };
  const mobileQuery = window.matchMedia(MOBILE_QUERY);
  const applyResponsiveLayout = () => {
    Object.assign(
      settings,
      mobileQuery.matches
        ? {
            // Portrait has no room beside the hole, so it centers and sits a
            // touch high. The band fade would land right on it, so it is off.
            centerX: 0,
            centerY: 0.18,
            cameraRoll: 0,
            mouseYaw: 0,
            centerFade: 0,
          }
        : desktopLayout
    );
  };
  applyResponsiveLayout();
  const bloomScale = Math.min(Math.max(window.devicePixelRatio, 1), 2) / 2;
  settings.bloom.radius *= bloomScale;
  settings.bloom.strength *= bloomScale;

  let disposed = false;

  let api: VgpuApi | undefined;
  let gpu: Gpu | undefined;
  let surface: Surface | undefined;
  let effects: Effects | undefined;
  let targets: Targets | undefined;
  let loop: { stop(): void } | undefined;
  let observer: ResizeObserver | undefined;
  let intersection: IntersectionObserver | undefined;
  let documentVisible =
    typeof document === "undefined" ? true : !document.hidden;
  let canvasIntersecting = true;

  let started = false;
  let animationTime = 0;
  let lastFrameAt: number | undefined;
  let resizeFrame = 0;
  let pendingSize: RenderSize | undefined;
  let forceBake = true;
  let firstFrameSent = false;
  let pointerXNormalized = 0;
  let currentSceneYaw = 0;
  let lastYawAt: number | undefined;

  const onLayoutChange = () => {
    applyResponsiveLayout();
    forceBake = true;
  };
  mobileQuery.addEventListener("change", onLayoutChange);

  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    const width = Math.max(window.innerWidth, 1);
    pointerXNormalized = Math.min(
      1,
      Math.max(-1, (event.clientX / width) * 2 - 1)
    );
  };

  const recenterPointer = () => {
    pointerXNormalized = 0;
  };
  const onPointerOut = (event: PointerEvent) => {
    if (event.relatedTarget === null) recenterPointer();
  };
  const onVisibilityChange = () => {
    if (document.hidden) recenterPointer();
    documentVisible = !document.hidden;
    reconcileLoop();
  };

  /**
   * A throw inside a frameLoop tick escapes the rAF callback, so the failure
   * path tears down quietly here. `ready` already rejects for init failures,
   * and once the loop is running the site keeps working on the CSS backdrop.
   */
  function reconcileLoop(): void {
    if (!started || !gpu || !api) return;
    const shouldRun =
      !disposed && !reducedMotion && documentVisible && canvasIntersecting;
    if (shouldRun === Boolean(loop)) return;
    if (shouldRun) {
      lastFrameAt = undefined;
      lastYawAt = undefined;
      loop = api.frameLoop(
        gpu,
        (frame) => {
          try {
            renderFrame(frame);
          } catch (error) {
            console.warn("[background] frame descartada:", error);
            dispose();
          }
        },
        { fps: TARGET_FPS },
      );
    } else {
      loop?.stop();
      loop = undefined;
    }
  }

  const advanceAnimationTime = (now: number): number => {
    animationTime +=
      lastFrameAt === undefined ? 0 : Math.max(0, (now - lastFrameAt) / 1000);
    lastFrameAt = now;
    return animationTime;
  };

  const renderFrame = (frame: Frame): void => {
    if (disposed || !effects || !targets || !surface) return;
    const now = clockMs();
    const runBake = forceBake;
    forceBake = false;
    if (runBake) setBakeUniforms(effects, targets, settings);
    setShadeUniforms(
      effects,
      targets,
      settings,
      advanceAnimationTime(now),
      advanceSceneYaw(now),
    );
    renderChain(frame, effects, targets, surface, runBake);
    if (!firstFrameSent) {
      firstFrameSent = true;
      onFirstFrame?.();
    }
  };

  const advanceSceneYaw = (now: number): number => {
    if (settings.mouseYaw <= 0) {
      currentSceneYaw = 0;
      lastYawAt = now;
      return 0;
    }
    const dt =
      lastYawAt === undefined
        ? 0
        : Math.min(Math.max((now - lastYawAt) / 1000, 0), MAX_FRAME_DT_S);
    lastYawAt = now;
    const target = pointerXNormalized * Math.max(0, settings.mouseYaw);
    currentSceneYaw +=
      (target - currentSceneYaw) * (1 - Math.exp(-dt / SCENE_YAW_TAU_S));
    return currentSceneYaw;
  };

  const applyResize = () => {
    resizeFrame = 0;
    const size = pendingSize;
    pendingSize = undefined;
    if (disposed || !size || !gpu || !api || !effects || !targets || !surface)
      return;
    try {
      const previousTargets = targets;
      const nextTargets = createTargets(api, gpu, [
        Math.max(1, Math.round(size.width)),
        Math.max(1, Math.round(size.height)),
      ]);
      try {
        setBindings(effects, nextTargets);
        setPostUniforms(effects, nextTargets, settings);
      } catch (error) {
        destroyTargets(nextTargets);
        throw error;
      }
      targets = nextTargets;
      destroyTargets(previousTargets);
      forceBake = true;
      if (reducedMotion) requestAnimationFrame(drawOnce);
    } catch (error) {
      handleFailure(error);
    }
  };
  const resize = (size: RenderSize) => {
    if (disposed || size.width <= 0 || size.height <= 0) return;
    pendingSize = size;
    if (!resizeFrame) resizeFrame = requestAnimationFrame(applyResize);
  };

  const measure = () => {
    resize({
      width: canvas.clientWidth,
      height: canvas.clientHeight,
    });
  };

  const drawOnce = () => {
    if (!gpu || !api) return;
    try {
      api.frame(gpu, renderFrame);
    } catch (error) {
      handleFailure(error);
    }
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    loop?.stop();
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    observer?.disconnect();
    intersection?.disconnect();
    if (typeof window !== "undefined") {
      mobileQuery.removeEventListener("change", onLayoutChange);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerout", onPointerOut);
      window.removeEventListener("blur", recenterPointer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
    gpu?.dispose();
  };

  const initialize = async () => {
    const vgpu = await import("vgpu");
    const { init } = vgpu;
    if (disposed) return;
    const nextGpu = await init();
    if (disposed) {
      nextGpu.dispose();
      return;
    }
    gpu = nextGpu;
    api = vgpu;
    surface = vgpu.surface(gpu, canvas, { dpr: DRAFT_DPR });
    effects = createEffects(vgpu, gpu);
    targets = createTargets(vgpu, gpu, surface.size);
    setBakeUniforms(effects, targets, settings);
    setShadeUniforms(effects, targets, settings, animationTime, currentSceneYaw);
    setBindings(effects, targets);
    setPostUniforms(effects, targets, settings);
    await prewarm(effects, targets, surface);

    if (disposed) return;
    observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(measure);
    observer?.observe(canvas);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerout", onPointerOut, { passive: true });
    window.addEventListener("blur", recenterPointer);
    document.addEventListener("visibilitychange", onVisibilityChange);
    if (typeof IntersectionObserver !== "undefined") {
      intersection = new IntersectionObserver(
        (entries) => {
          canvasIntersecting =
            entries[entries.length - 1]?.isIntersecting ?? canvasIntersecting;
          reconcileLoop();
        },
        { threshold: 0 }
      );
      intersection.observe(canvas);
    }
    measure();
    started = true;
    documentVisible = !document.hidden;
    if (reducedMotion) {
      drawOnce();
    } else {
      reconcileLoop();
    }
  };

  function handleFailure(error: unknown): never {
    dispose();
    throw error;
  }

  const ready = initialize().catch((error: unknown) => {
    if (disposed) return;
    handleFailure(error);
  });

  return { ready, dispose };
}

function clockMs(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

