/* Rabta: the product loops, attached only when the visitor and the viewport
 * allow it.
 *
 * Markup contract: a `[data-product-media]` block holding one <video> that
 * ships with a poster and `data-src-desktop` / `data-src-mobile` but no `src`,
 * optionally a `[data-media-play]` button and a `[data-media-track]` gauge,
 * and optionally a `data-media-group` so loops in one group take turns.
 *
 * The types here are structural on purpose: the behaviour tests drive this
 * module with a hand-built DOM double, and the browser gives it the real one.
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

export function chooseSource(dataset: DOMStringMap, mobile: boolean): string | undefined {
  return mobile ? dataset.srcMobile : dataset.srcDesktop;
}

/* What the module needs from its environment: the real window, or a double. */
export interface MediaEnv {
  matchMedia: (query: string) => { matches: boolean };
  navigator?: { connection?: { saveData?: boolean } };
  HTMLMediaElement?: { HAVE_FUTURE_DATA?: number };
  IntersectionObserver: new (
    callback: (entries: MediaEntry[]) => void,
    options?: { rootMargin?: string; threshold?: number[] },
  ) => { observe: (target: Element) => void; disconnect: () => void };
  requestAnimationFrame: (callback: () => void) => unknown;
}

interface MediaEntry {
  target: Element;
  isIntersecting: boolean;
  intersectionRatio: number;
}

type Block = HTMLElement;
type Video = HTMLVideoElement;
type Button = HTMLButtonElement;

export function initProductMedia(root: ParentNode = document, env: MediaEnv = window as unknown as MediaEnv): () => void {
  const blocks = [...root.querySelectorAll<Block>("[data-product-media]")];
  const videos = blocks
    .map((block) => block.querySelector<Video>("video"))
    .filter((video): video is Video => Boolean(video));
  const reducedMotion = env.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const saveData = Boolean(env.navigator?.connection?.saveData);
  const mobile = env.matchMedia("(max-width: 599px)").matches;
  const policy = getMediaPolicy({ reducedMotion, saveData });
  const futureData = env.HTMLMediaElement?.HAVE_FUTURE_DATA ?? 3;
  const cleanups: Array<() => void> = [];
  const readinessListeners = new WeakMap<Video, () => void>();
  let active = true;

  function buttonFor(block: Block): Button | null {
    return block.querySelector<Button>("[data-media-play]");
  }

  /* The loop's real position, reported rather than decorated: it says the loop
     is eight seconds and not an endless gif, and it gives the Pause control a
     context. Hidden until a source exists, so a data-saver or scriptless
     visitor is never shown an empty gauge. */
  function trackFor(block: Block): HTMLElement | null {
    return block.querySelector<HTMLElement>("[data-media-track]");
  }

  function drawTrack(block: Block, video: Video): void {
    const track = trackFor(block);
    if (!track) return;
    const fill = track.firstElementChild as HTMLElement | null;
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
  function setControl(block: Block, mode: "play" | "pause" | "gone"): void {
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
  function heldByVisitor(block: Block): boolean {
    return block.dataset.mediaPaused === "true";
  }

  function attach(video: Video): void {
    if (video.src) return;
    const source = chooseSource(video.dataset, mobile);
    if (!source) return;
    video.src = source;
    video.load();
  }

  /* Loops that share a `data-media-group` take turns: the three moves are
     one beat at a time. Loops with no group, or different groups, play
     together; four bento cells or a hero above a bento are meant to. */
  const groupOf = new Map<Video | null, string | undefined>(
    blocks.map((block) => [block.querySelector<Video>("video"), block.dataset.mediaGroup]),
  );
  function pauseOthers(current: Video): void {
    const group = groupOf.get(current);
    if (!group) return;
    videos.forEach((video) => {
      if (video !== current && groupOf.get(video) === group) video.pause();
    });
  }

  async function play(block: Block, explicit = false): Promise<void> {
    if (!active) return;
    const video = block.querySelector<Video>("video");
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
  function pause(block: Block, byVisitor: boolean): void {
    const video = block.querySelector<Video>("video");
    if (!video || block.dataset.mediaState === "failed") return;
    video.pause();
    if (byVisitor) block.dataset.mediaPaused = "true";
    block.dataset.mediaState = "paused";
    setControl(block, "play");
  }

  function playWhenReady(block: Block, video: Video): void {
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
    const video = block.querySelector<Video>("video");
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

  let observer: { observe: (target: Element) => void; disconnect: () => void } | undefined;
  if (policy.autoplay) {
    observer = new env.IntersectionObserver(
      (entries) => {
        if (!active) return;
        entries.forEach((entry) => {
          const block = entry.target as Block;
          const video = block.querySelector<Video>("video");
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
    blocks.forEach((block) => observer!.observe(block));

    const hero = blocks.find((block) => block.dataset.productMedia === "hero");
    if (hero) {
      env.requestAnimationFrame(() =>
        env.requestAnimationFrame(() => {
          if (!active) return;
          const video = hero.querySelector<Video>("video");
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
