/* Resilient product loops: attach only when the visitor and viewport allow it. */

export function getMediaPolicy({ reducedMotion, saveData }) {
  const autoplay = !reducedMotion && !saveData;
  return { attach: autoplay, autoplay };
}

export function chooseSource(dataset, mobile) {
  return mobile ? dataset.srcMobile : dataset.srcDesktop;
}

export function initProductMedia(root = document, env = window) {
  const blocks = [...root.querySelectorAll("[data-product-media]")];
  const videos = blocks.map((block) => block.querySelector("video")).filter(Boolean);
  const reducedMotion = env.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const saveData = Boolean(env.navigator?.connection?.saveData);
  const mobile = env.matchMedia("(max-width: 599px)").matches;
  const policy = getMediaPolicy({ reducedMotion, saveData });
  const futureData = env.HTMLMediaElement?.HAVE_FUTURE_DATA ?? 3;
  const cleanups = [];
  const readinessListeners = new WeakMap();
  let active = true;

  function buttonFor(block) {
    return block.querySelector("[data-media-play]");
  }

  function attach(video) {
    if (video.src) return;
    video.src = chooseSource(video.dataset, mobile);
    video.load();
  }

  function pauseOthers(current) {
    videos.forEach((video) => {
      if (video !== current) video.pause();
    });
  }

  async function play(block, explicit = false) {
    if (!active) return;
    const video = block.querySelector("video");
    const button = buttonFor(block);
    if (!video || block.dataset.mediaState === "failed") return;
    if (explicit || policy.attach) attach(video);
    if (!video.src) {
      if (button) button.hidden = false;
      return;
    }
    if (!explicit && video.readyState < futureData) return;
    pauseOthers(video);
    try {
      await video.play();
      if (!active) {
        video.pause();
        return;
      }
      block.dataset.mediaState = "playing";
      if (button) button.hidden = true;
    } catch {
      if (!active) return;
      block.dataset.mediaState = "blocked";
      if (button) button.hidden = false;
    }
  }

  function playWhenReady(block, video) {
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
      if (button) {
        button.hidden = true;
        button.disabled = true;
      }
    };
    const onClick = () => void play(block, true);
    video.addEventListener("error", onError);
    button?.addEventListener("click", onClick);
    if (!policy.autoplay && button) button.hidden = false;
    cleanups.push(() => {
      video.removeEventListener("error", onError);
      button?.removeEventListener("click", onClick);
    });
  });

  let observer;
  if (policy.autoplay) {
    observer = new env.IntersectionObserver((entries) => {
      if (!active) return;
      entries.forEach((entry) => {
        const block = entry.target;
        const video = block.querySelector("video");
        if (!video) return;
        if (entry.isIntersecting && block.dataset.productMedia !== "hero") attach(video);
        block.dataset.inView = String(entry.intersectionRatio >= 0.55);
        if (entry.intersectionRatio >= 0.55) {
          playWhenReady(block, video);
        } else {
          video.pause();
          if (block.dataset.mediaState !== "failed") block.dataset.mediaState = "paused";
        }
      });
    }, { rootMargin: "300px 0px", threshold: [0, 0.55] });
    blocks.forEach((block) => observer.observe(block));

    const hero = blocks.find((block) => block.dataset.productMedia === "hero");
    if (hero) {
      env.requestAnimationFrame(() => env.requestAnimationFrame(() => {
        if (!active) return;
        const video = hero.querySelector("video");
        if (!video) return;
        attach(video);
        playWhenReady(hero, video);
      }));
    }
  }

  return () => {
    active = false;
    observer?.disconnect();
    cleanups.forEach((cleanup) => cleanup());
    videos.forEach((video) => video.pause());
  };
}
