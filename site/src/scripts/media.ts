/* Rabta: the product loops, attached only when the visitor and viewport allow it.
 *
 * Markup contract: a `[data-product-media]` block holding one <video> with
 * `data-src-desktop` and `data-src-mobile` and no `src`, optionally a
 * `[data-media-play]` button (labels in `data-label-play` / `data-label-pause`)
 * and a `[data-media-track]` gauge. Blocks that share a `data-media-group`
 * take turns; the rest play together.
 *
 * Erasable TypeScript only: the behaviour tests import this file straight
 * into Node with type stripping, so no enums, namespaces or parameter
 * properties here.
 */

export interface MediaPolicyInput {
  reducedMotion: boolean;
  saveData: boolean;
}

export interface MediaPolicy {
  attach: boolean;
  autoplay: boolean;
}

export function getMediaPolicy({ reducedMotion, saveData }: MediaPolicyInput): MediaPolicy {
  const autoplay = !reducedMotion && !saveData;
  return { attach: autoplay, autoplay };
}

export interface SourceDataset {
  srcDesktop?: string;
  srcMobile?: string;
}

export function chooseSource(dataset: SourceDataset, mobile: boolean): string | undefined {
  return mobile ? dataset.srcMobile : dataset.srcDesktop;
}

/* The shapes below are the parts of the DOM this module touches, so the
   behaviour tests can drive it with plain objects instead of a browser. */
interface MediaVideo {
  src: string;
  dataset: SourceDataset;
  paused: boolean;
  readyState: number;
  duration: number;
  currentTime: number;
  load(): void;
  play(): Promise<void>;
  pause(): void;
  removeAttribute(name: string): void;
  addEventListener(type: string, listener: () => void, options?: { once?: boolean }): void;
  removeEventListener(type: string, listener: () => void): void;
}

interface MediaButton {
  hidden: boolean;
  disabled: boolean;
  textContent: string | null;
  dataset: { labelPlay?: string; labelPause?: string };
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

interface MediaTrack {
  hidden: boolean;
  firstElementChild: { style: { width: string } } | null;
}

interface MediaBlock {
  dataset: {
    productMedia?: string;
    mediaGroup?: string;
    mediaState?: string;
    mediaPaused?: string;
    inView?: string;
  };
  querySelector(selector: "video"): MediaVideo | null;
  querySelector(selector: "[data-media-play]"): MediaButton | null;
  querySelector(selector: "[data-media-track]"): MediaTrack | null;
  querySelector(selector: string): unknown;
}

interface MediaRoot {
  querySelectorAll(selector: string): ArrayLike<MediaBlock> & Iterable<MediaBlock>;
}

interface IntersectionEntryLike {
  target: MediaBlock;
  isIntersecting: boolean;
  intersectionRatio: number;
}

interface MediaEnv {
  matchMedia(query: string): { matches: boolean };
  navigator?: { connection?: { saveData?: boolean } };
  HTMLMediaElement?: { HAVE_FUTURE_DATA?: number };
  IntersectionObserver: new (
    callback: (entries: IntersectionEntryLike[]) => void,
    options: { rootMargin: string; threshold: number[] },
  ) => { observe(target: MediaBlock): void; disconnect(): void };
  requestAnimationFrame(callback: () => void): unknown;
}

export type Teardown = () => void;

export function initProductMedia(
  root: MediaRoot = document as unknown as MediaRoot,
  env: MediaEnv = window as unknown as MediaEnv,
): Teardown {
  const blocks = [...root.querySelectorAll("[data-product-media]")];
  const videos = blocks
    .map((block) => block.querySelector("video"))
    .filter((video): video is MediaVideo => Boolean(video));
  const reducedMotion = env.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const saveData = Boolean(env.navigator?.connection?.saveData);
  const mobile = env.matchMedia("(max-width: 599px)").matches;
  const policy = getMediaPolicy({ reducedMotion, saveData });
  const futureData = env.HTMLMediaElement?.HAVE_FUTURE_DATA ?? 3;
  const cleanups: Teardown[] = [];
  const readinessListeners = new WeakMap<MediaVideo, () => void>();
  let active = true;

  function buttonFor(block: MediaBlock): MediaButton | null {
    return block.querySelector("[data-media-play]");
  }

  /* The loop's real position, reported rather than decorated: it says the loop
     is eight seconds and not an endless gif, and it gives the Pause control a
     context. Hidden until a source exists, so a data-saver or scriptless
     visitor is never shown an empty gauge. */
  function trackFor(block: MediaBlock): MediaTrack | null {
    return block.querySelector("[data-media-track]");
  }

  function drawTrack(block: MediaBlock, video: MediaVideo): void {
    const track = trackFor(block);
    if (!track) return;
    const fill = track.firstElementChild;
    if (!video.src || !Number.isFinite(video.duration) || video.duration <= 0) {
      track.hidden = true;
      return;
    }
    track.hidden = false;
    if (fill) {
      const ratio = Math.min(1, Math.max(0, video.currentTime / video.duration));
      fill.style.width = `${(ratio * 100).toFixed(2)}%`;
    }
  }

  /* WCAG 2.2.2: these loops start on their own and run past five seconds beside
     the copy they illustrate, so the page owes the visitor a way to stop them.
     The control is the same button that offers Play. It tells the truth about
     what pressing it will do, and stays reachable while the loop runs. */
  function setControl(block: MediaBlock, mode: "play" | "pause" | "gone"): void {
    const button = buttonFor(block);
    if (!button || button.disabled) return;
    if (mode === "gone") {
      button.hidden = true;
      return;
    }
    const label = mode === "pause" ? button.dataset.labelPause : button.dataset.labelPlay;
    if (label) button.textContent = label;
    button.hidden = false;
  }

  /* A visitor who pauses has said something the scroll position must not
     override, so intersection never resumes a deliberately paused loop. */
  function heldByVisitor(block: MediaBlock): boolean {
    return block.dataset.mediaPaused === "true";
  }

  function attach(video: MediaVideo): void {
    if (video.src) return;
    const source = chooseSource(video.dataset, mobile);
    if (!source) return;
    video.src = source;
    video.load();
  }

  /* Loops that share a `data-media-group` take turns: the three moves are
     one beat at a time. Loops with no group, or different groups, play
     together, as four bento cells or a hero above a bento are meant to. */
  const groupOf = new Map<MediaVideo | null, string | undefined>(
    blocks.map((block) => [block.querySelector("video"), block.dataset.mediaGroup]),
  );
  function pauseOthers(current: MediaVideo): void {
    const group = groupOf.get(current);
    if (!group) return;
    videos.forEach((video) => {
      if (video !== current && groupOf.get(video) === group) video.pause();
    });
  }

  async function play(block: MediaBlock, explicit = false): Promise<void> {
    if (!active) return;
    const video = block.querySelector("video");
    const button = buttonFor(block);
    if (!video || block.dataset.mediaState === "failed") return;
    if (!explicit && heldByVisitor(block)) return;
    if (explicit || policy.attach) attach(video);
    if (!video.src) {
      if (button) setControl(block, "play");
      return;
    }
    if (!explicit && (block.dataset.inView !== "true" || video.readyState < futureData)) return;
    pauseOthers(video);
    try {
      await video.play();
      if (!active) {
        video.pause();
        return;
      }
      block.dataset.mediaState = "playing";
      setControl(block, "pause");
    } catch {
      if (!active) return;
      block.dataset.mediaState = "blocked";
      setControl(block, "play");
    }
  }

  /* Pausing is never asynchronous and never fails, so it is stated plainly
     rather than routed through the play() promise path. */
  function pause(block: MediaBlock, byVisitor: boolean): void {
    const video = block.querySelector("video");
    if (!video || block.dataset.mediaState === "failed") return;
    video.pause();
    if (byVisitor) block.dataset.mediaPaused = "true";
    block.dataset.mediaState = "paused";
    setControl(block, "play");
  }

  function playWhenReady(block: MediaBlock, video: MediaVideo): void {
    const pending = readinessListeners.get(video);
    if (video.readyState >= futureData) {
      if (pending) {
        video.removeEventListener("canplay", pending);
        readinessListeners.delete(video);
      }
      void play(block);
      return;
    }
    if (pending) return;
    const onCanPlay = () => {
      readinessListeners.delete(video);
      if (block.dataset.inView === "true") void play(block);
    };
    readinessListeners.set(video, onCanPlay);
    video.addEventListener("canplay", onCanPlay, { once: true });
    cleanups.push(() => {
      video.removeEventListener("canplay", onCanPlay);
      readinessListeners.delete(video);
    });
  }

  blocks.forEach((block) => {
    const video = block.querySelector("video");
    const button = buttonFor(block);
    if (!video) return;
    const onError = () => {
      video.pause();
      video.removeAttribute("src");
      block.dataset.mediaState = "failed";
      const track = trackFor(block);
      if (track) track.hidden = true;
      if (button) {
        button.hidden = true;
        button.disabled = true;
      }
    };
    const onProgress = () => drawTrack(block, video);
    video.addEventListener("timeupdate", onProgress);
    video.addEventListener("loadedmetadata", onProgress);

    const onClick = () => {
      if (!video.paused) {
        pause(block, true);
        return;
      }
      delete block.dataset.mediaPaused;
      void play(block, true);
    };
    video.addEventListener("error", onError);
    button?.addEventListener("click", onClick);
    if (!policy.autoplay && button) setControl(block, "play");
    cleanups.push(() => {
      video.removeEventListener("error", onError);
      video.removeEventListener("timeupdate", onProgress);
      video.removeEventListener("loadedmetadata", onProgress);
      button?.removeEventListener("click", onClick);
    });
  });

  let observer: { observe(target: MediaBlock): void; disconnect(): void } | undefined;
  if (policy.autoplay) {
    observer = new env.IntersectionObserver(
      (entries) => {
        if (!active) return;
        entries.forEach((entry) => {
          const block = entry.target;
          const video = block.querySelector("video");
          if (!video) return;
          if (entry.isIntersecting && block.dataset.productMedia !== "hero") attach(video);
          block.dataset.inView = String(entry.intersectionRatio >= 0.55);
          if (entry.intersectionRatio >= 0.55) {
            playWhenReady(block, video);
          } else if (block.dataset.mediaState !== "failed") {
            /* Scrolling away is not the visitor pausing, so it must not latch. */
            pause(block, false);
          }
        });
      },
      { rootMargin: "300px 0px", threshold: [0, 0.55] },
    );
    blocks.forEach((block) => observer?.observe(block));

    const hero = blocks.find((block) => block.dataset.productMedia === "hero");
    if (hero) {
      env.requestAnimationFrame(() =>
        env.requestAnimationFrame(() => {
          if (!active) return;
          const video = hero.querySelector("video");
          if (!video) return;
          attach(video);
          playWhenReady(hero, video);
        }),
      );
    }
  }

  return () => {
    active = false;
    observer?.disconnect();
    cleanups.forEach((cleanup) => cleanup());
    videos.forEach((video) => video.pause());
  };
}
