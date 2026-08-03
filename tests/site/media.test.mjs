import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// The site deliberately has no package boundary or build step. Load the real
// browser module as source so Node 18 does not reinterpret its .js suffix as
// CommonJS while exercising it.
const mediaSource = await readFile(new URL("../../website/js/media.js", import.meta.url), "utf8");
const {
  chooseSource,
  getMediaPolicy,
  initProductMedia,
} = await import(`data:text/javascript;base64,${Buffer.from(mediaSource).toString("base64")}`);

class FakeTarget {
  #listeners = new Map();

  addEventListener(type, listener, options = {}) {
    const listeners = this.#listeners.get(type) ?? [];
    listeners.push({ listener, once: Boolean(options?.once) });
    this.#listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    const listeners = this.#listeners.get(type) ?? [];
    this.#listeners.set(type, listeners.filter((item) => item.listener !== listener));
  }

  dispatch(type) {
    const listeners = [...(this.#listeners.get(type) ?? [])];
    listeners.forEach((item) => {
      item.listener({ type, target: this });
      if (item.once) this.removeEventListener(type, item.listener);
    });
  }
}

class FakeVideo extends FakeTarget {
  constructor({ desktop, mobile, play = () => Promise.resolve() }) {
    super();
    this.dataset = { srcDesktop: desktop, srcMobile: mobile };
    this.src = "";
    this.readyState = 3;
    this.loadCount = 0;
    this.pauseCount = 0;
    this.playCount = 0;
    this.paused = true;
    this.playResult = play;
  }

  load() { this.loadCount += 1; }

  pause() {
    this.pauseCount += 1;
    this.paused = true;
  }

  play() {
    this.playCount += 1;
    return this.playResult().then(
      (value) => { this.paused = false; return value; },
      (error) => { throw error; },
    );
  }

  removeAttribute(name) {
    if (name === "src") this.src = "";
  }
}

class FakeButton extends FakeTarget {
  hidden = true;
  disabled = false;
  textContent = "Play demo";
  dataset = { labelPlay: "Play demo", labelPause: "Pause demo" };
}

function mediaBlock(name, play) {
  const video = new FakeVideo({
    desktop: `/${name}-desktop.m4v`,
    mobile: `/${name}-mobile.m4v`,
    play,
  });
  const button = new FakeButton();
  const block = {
    dataset: { productMedia: name },
    querySelector(selector) {
      if (selector === "video") return video;
      if (selector === "[data-media-play]") return button;
      return null;
    },
  };
  return { block, button, video };
}

function harness({ reducedMotion = false, saveData = false, mobile = false, items } = {}) {
  const media = items ?? [mediaBlock("hero"), mediaBlock("return")];
  const rafs = [];
  let observer;
  class FakeIntersectionObserver {
    constructor(callback, options) {
      this.callback = callback;
      this.options = options;
      this.observed = [];
      this.disconnected = false;
      observer = this;
    }

    observe(block) { this.observed.push(block); }

    disconnect() { this.disconnected = true; }

    enter(index, intersectionRatio) {
      this.callback([{
        target: media[index].block,
        isIntersecting: intersectionRatio > 0,
        intersectionRatio,
      }]);
    }
  }
  const root = {
    querySelectorAll(selector) {
      assert.equal(selector, "[data-product-media]");
      return media.map(({ block }) => block);
    },
  };
  const env = {
    HTMLMediaElement: { HAVE_FUTURE_DATA: 3 },
    IntersectionObserver: FakeIntersectionObserver,
    navigator: { connection: { saveData } },
    matchMedia(query) {
      if (query === "(prefers-reduced-motion: reduce)") return { matches: reducedMotion };
      if (query === "(max-width: 599px)") return { matches: mobile };
      throw new Error(`Unexpected media query: ${query}`);
    },
    requestAnimationFrame(callback) {
      rafs.push(callback);
      return rafs.length;
    },
  };
  return {
    env,
    media,
    root,
    get observer() { return observer; },
    runAnimationFrame() { rafs.shift()?.(); },
  };
}

function settle() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("autoplay is disabled for reduced motion and data saver", () => {
  assert.deepEqual(getMediaPolicy({ reducedMotion: true, saveData: false }), { attach: false, autoplay: false });
  assert.deepEqual(getMediaPolicy({ reducedMotion: false, saveData: true }), { attach: false, autoplay: false });
  assert.deepEqual(getMediaPolicy({ reducedMotion: false, saveData: false }), { attach: true, autoplay: true });
});

test("mobile receives the dedicated small source", () => {
  const dataset = { srcDesktop: "/desktop.m4v", srcMobile: "/mobile.m4v" };
  assert.equal(chooseSource(dataset, false), "/desktop.m4v");
  assert.equal(chooseSource(dataset, true), "/mobile.m4v");
});

for (const constrained of [
  { name: "reduced motion", reducedMotion: true },
  { name: "save data", saveData: true },
]) {
  test(`explicit play attaches media under ${constrained.name}`, async () => {
    const page = harness({ ...constrained, mobile: true });
    const cleanup = initProductMedia(page.root, page.env);

    assert.equal(page.media[0].video.src, "");
    assert.equal(page.media[0].button.hidden, false);
    assert.equal(page.observer, undefined);

    page.media[0].button.dispatch("click");
    await settle();

    assert.equal(page.media[0].video.src, "/hero-mobile.m4v");
    assert.equal(page.media[0].video.loadCount, 1);
    assert.equal(page.media[0].video.playCount, 1);
    assert.equal(page.media[0].block.dataset.mediaState, "playing");
    assert.equal(page.media[0].button.hidden, false);
    assert.equal(page.media[0].button.textContent, "Pause demo");
    cleanup();
  });
}

test("starting a product loop pauses every other product video", async () => {
  const page = harness({ reducedMotion: true });
  const cleanup = initProductMedia(page.root, page.env);

  page.media[0].button.dispatch("click");
  await settle();
  const heroPausesBeforeReturn = page.media[0].video.pauseCount;
  page.media[1].button.dispatch("click");
  await settle();

  assert.equal(page.media[0].video.pauseCount, heroPausesBeforeReturn + 1);
  assert.equal(page.media[1].block.dataset.mediaState, "playing");
  cleanup();
});

test("rejected playback exposes a local manual control without a playing state", async () => {
  const blocked = mediaBlock("hero", () => Promise.reject(new Error("blocked")));
  const page = harness({ reducedMotion: true, items: [blocked] });
  const cleanup = initProductMedia(page.root, page.env);

  blocked.button.dispatch("click");
  await settle();

  assert.equal(blocked.block.dataset.mediaState, "blocked");
  assert.equal(blocked.button.hidden, false);
  assert.notEqual(blocked.block.dataset.mediaState, "playing");
  cleanup();
});

test("a running loop can always be stopped, and stays stopped", async () => {
  // WCAG 2.2.2: these loops start on their own and run past five seconds
  // beside the copy they illustrate, so the page owes the visitor a way out.
  const page = harness();
  const cleanup = initProductMedia(page.root, page.env);
  const { block, button, video } = page.media[0];

  page.observer.enter(0, 1);
  await settle();
  assert.equal(block.dataset.mediaState, "playing");
  assert.equal(button.hidden, false, "the control stays reachable while it plays");
  assert.equal(button.textContent, "Pause demo");

  button.dispatch("click");
  await settle();
  assert.equal(video.paused, true);
  assert.equal(block.dataset.mediaState, "paused");
  assert.equal(button.textContent, "Play demo");

  // Scrolling past and back must not undo a deliberate pause.
  const playsBefore = video.playCount;
  page.observer.enter(0, 0);
  page.observer.enter(0, 1);
  await settle();
  assert.equal(video.playCount, playsBefore, "intersection does not override the visitor");
  assert.equal(video.paused, true);

  // Pressing Play again hands control back to the page.
  button.dispatch("click");
  await settle();
  assert.equal(video.paused, false);
  assert.equal(block.dataset.mediaState, "playing");
  assert.equal(button.textContent, "Pause demo");
  cleanup();
});

test("scrolling away pauses without latching", async () => {
  const page = harness();
  const cleanup = initProductMedia(page.root, page.env);
  const { block, video } = page.media[0];

  page.observer.enter(0, 1);
  await settle();
  page.observer.enter(0, 0);
  await settle();
  assert.equal(block.dataset.mediaState, "paused");
  assert.notEqual(block.dataset.mediaPaused, "true", "the page paused it, not the visitor");

  page.observer.enter(0, 1);
  await settle();
  assert.equal(video.paused, false, "it resumes when it comes back into view");
  cleanup();
});

test("media errors preserve the fallback and permanently disable play", async () => {
  const page = harness({ reducedMotion: true });
  const cleanup = initProductMedia(page.root, page.env);
  const { block, button, video } = page.media[0];

  button.dispatch("click");
  await settle();
  const playCount = video.playCount;
  video.dispatch("error");
  button.dispatch("click");
  await settle();

  assert.equal(video.src, "");
  assert.equal(block.dataset.mediaState, "failed");
  assert.equal(button.hidden, true);
  assert.equal(button.disabled, true);
  assert.equal(video.playCount, playCount);
  cleanup();
});

test("autoplay attaches lower media near the viewport and waits for the play threshold", async () => {
  const page = harness();
  const cleanup = initProductMedia(page.root, page.env);
  const lower = page.media[1];

  assert.deepEqual(page.observer.options, {
    rootMargin: "300px 0px",
    threshold: [0, 0.55],
  });
  assert.equal(lower.video.src, "");
  page.observer.enter(1, 0.2);
  assert.equal(lower.video.src, "/return-desktop.m4v");
  assert.equal(lower.video.playCount, 0);
  page.observer.enter(1, 0.55);
  await settle();

  assert.equal(lower.video.playCount, 1);
  assert.equal(lower.block.dataset.mediaState, "playing");
  cleanup();
});

test("the hero source waits for two animation frames", () => {
  const page = harness();
  const cleanup = initProductMedia(page.root, page.env);

  assert.equal(page.media[0].video.src, "");
  page.runAnimationFrame();
  assert.equal(page.media[0].video.src, "");
  page.runAnimationFrame();
  assert.equal(page.media[0].video.src, "/hero-desktop.m4v");
  cleanup();
});

test("an already-ready offscreen hero attaches but does not autoplay", async () => {
  const page = harness();
  const hero = page.media[0];
  const cleanup = initProductMedia(page.root, page.env);

  page.runAnimationFrame();
  page.runAnimationFrame();
  await settle();

  assert.equal(hero.video.src, "/hero-desktop.m4v");
  assert.equal(hero.block.dataset.inView, undefined);
  assert.equal(hero.video.playCount, 0);
  cleanup();
});

test("a visible hero makes one play attempt when its media becomes ready", async () => {
  const page = harness();
  const hero = page.media[0];
  hero.video.readyState = 0;
  const cleanup = initProductMedia(page.root, page.env);

  page.observer.enter(0, 0.55);
  page.runAnimationFrame();
  page.runAnimationFrame();
  hero.video.readyState = 3;
  hero.video.dispatch("canplay");
  await settle();

  assert.equal(hero.video.playCount, 1);
  cleanup();
});

test("cleanup disconnects observation, removes handlers, and pauses all media", async () => {
  const page = harness();
  const cleanup = initProductMedia(page.root, page.env);
  cleanup();

  const pauseCounts = page.media.map(({ video }) => video.pauseCount);
  page.media[0].button.dispatch("click");
  page.media[0].video.dispatch("error");
  await settle();

  assert.equal(page.observer.disconnected, true);
  assert.deepEqual(page.media.map(({ video }) => video.pauseCount), pauseCounts);
  assert.equal(page.media[0].video.playCount, 0);
  assert.equal(page.media[0].block.dataset.mediaState, undefined);
});
