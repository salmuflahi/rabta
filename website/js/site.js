/* ==========================================================================
   Rabta — site behaviour

   Progressive enhancement throughout. Every section is readable, every
   answer is visible and every image is present with JavaScript disabled;
   this file only adds motion, tab switching and clipboard convenience.

   No dependencies, no network requests.
   ========================================================================== */

(function () {
  "use strict";

  // Tells the inline bootstrap in <head> that JS arrived, so it leaves the
  // `js` class in place. If this file never loads, that class is dropped and
  // every reveal falls back to plain visible content.
  window.__rabta = true;

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ----------------------------------------------------------------------
     Scroll reveal
     One observer, CSS does the animating. Elements are revealed once and
     then forgotten, so nothing is observed for the life of the page.
     -------------------------------------------------------------------- */

  function initReveal() {
    var targets = document.querySelectorAll(".reveal");
    if (!targets.length) return;

    if (reduced.matches || !("IntersectionObserver" in window)) {
      targets.forEach(function (el) {
        el.classList.add("is-in");
      });
      return;
    }

    // The huge top margin is deliberate. Without it, anything scrolled past
    // — which is everything above the target when someone deep-links to
    // /#download — never intersects, so it would stay at opacity 0 and the
    // page would look empty when they scrolled back up. Treating everything
    // above the viewport as already intersecting reveals it immediately.
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        });
      },
      { rootMargin: "100000px 0px -8% 0px", threshold: 0 }
    );

    targets.forEach(function (el, i) {
      // Stagger only within a group, so a long list never delays by seconds.
      var group = el.closest("[data-stagger]");
      if (group) {
        var peers = Array.prototype.slice.call(
          group.querySelectorAll(".reveal")
        );
        el.style.setProperty(
          "--reveal-delay",
          Math.min(peers.indexOf(el), 6) * 60 + "ms"
        );
      }
      io.observe(el);
    });
  }

  /* ----------------------------------------------------------------------
     Nav — compress and separate once content sits behind it
     -------------------------------------------------------------------- */

  function initNav() {
    var nav = document.querySelector(".nav");
    if (!nav) return;

    var sentinel = document.createElement("div");
    sentinel.setAttribute("aria-hidden", "true");
    sentinel.style.cssText = "position:absolute;top:0;height:1px;width:1px;";
    document.body.prepend(sentinel);

    if (!("IntersectionObserver" in window)) return;

    new IntersectionObserver(
      function (entries) {
        nav.classList.toggle("is-stuck", !entries[0].isIntersecting);
      },
      { threshold: 0 }
    ).observe(sentinel);
  }

  /* ----------------------------------------------------------------------
     Demo showcase — real tab semantics
     Roving tabindex, Left/Right/Home/End, and panels that only fetch their
     screenshot when shown (or once the page has gone idle).
     -------------------------------------------------------------------- */

  function initTabs() {
    var list = document.querySelector("[data-tablist]");
    if (!list) return;

    var tabs = Array.prototype.slice.call(list.querySelectorAll("[role=tab]"));
    var panels = tabs.map(function (tab) {
      return document.getElementById(tab.getAttribute("aria-controls"));
    });

    function select(index, focus) {
      tabs.forEach(function (tab, i) {
        var on = i === index;
        tab.setAttribute("aria-selected", String(on));
        tab.tabIndex = on ? 0 : -1;
        if (panels[i]) panels[i].hidden = !on;
      });
      if (focus) tabs[index].focus();
      // Keep the active tab in view when the strip scrolls horizontally.
      if (tabs[index].scrollIntoView) {
        tabs[index].scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: reduced.matches ? "auto" : "smooth",
        });
      }
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener("click", function () {
        select(i, false);
      });
      tab.addEventListener("keydown", function (event) {
        var next = null;
        if (event.key === "ArrowRight") next = (i + 1) % tabs.length;
        else if (event.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = tabs.length - 1;
        if (next === null) return;
        event.preventDefault();
        select(next, true);
      });
    });

    // Warm the panels the visitor has not opened, but only once the page is
    // otherwise done. Flipping lazy -> eager lets the browser fetch through
    // the normal <picture> negotiation even though the panel is display:none,
    // so nobody downloads a format their browser cannot use.
    function warm() {
      panels.forEach(function (panel) {
        if (!panel) return;
        panel.querySelectorAll('img[loading="lazy"]').forEach(function (img) {
          img.loading = "eager";
        });
      });
    }

    var schedule = window.requestIdleCallback
      ? function (fn) {
          window.requestIdleCallback(fn, { timeout: 4000 });
        }
      : function (fn) {
          window.setTimeout(fn, 2500);
        };

    if (document.readyState === "complete") schedule(warm);
    else window.addEventListener("load", function () {
      schedule(warm);
    });
  }

  /* ----------------------------------------------------------------------
     FAQ accordion
     grid-template-rows 0fr -> 1fr, so no height is ever measured and
     answers of any length animate correctly.
     -------------------------------------------------------------------- */

  function initFaq() {
    document.querySelectorAll("[data-faq] .faq__q").forEach(function (button) {
      var answer = document.getElementById(button.getAttribute("aria-controls"));
      if (!answer) return;

      // Collapsed is a JS-only state; without JS the answers stay readable.
      var open = button.getAttribute("aria-expanded") === "true";
      answer.dataset.open = String(open);

      button.addEventListener("click", function () {
        var next = button.getAttribute("aria-expanded") !== "true";
        button.setAttribute("aria-expanded", String(next));
        answer.dataset.open = String(next);
      });
    });
  }

  /* ----------------------------------------------------------------------
     Copy to clipboard
     -------------------------------------------------------------------- */

  function initCopy() {
    document.querySelectorAll("[data-copy]").forEach(function (button) {
      if (!navigator.clipboard) {
        button.hidden = true;
        return;
      }
      var original = button.textContent;
      button.addEventListener("click", function () {
        navigator.clipboard.writeText(button.dataset.copy).then(
          function () {
            button.textContent = "Copied";
            window.setTimeout(function () {
              button.textContent = original;
            }, 1600);
          },
          function () {
            button.textContent = "Press ⌘C";
            window.setTimeout(function () {
              button.textContent = original;
            }, 2000);
          }
        );
      });
    });
  }

  /* ----------------------------------------------------------------------
     Hero capsule sequence

     Four beats: capture -> sealed -> restored -> settle. Runs twice, then
     stops for good and leaves the DOM in the same restored state the page
     ships with, so there is no idle work and nothing competes with the
     headline once the point has been made.

     The settled state is the CSS default, which means the no-JS page, the
     reduced-motion page and the finished animation all render identically.
     -------------------------------------------------------------------- */

  function initCapsule() {
    var capsule = document.querySelector("[data-capsule]");
    if (!capsule) return;

    var replay = capsule.querySelector("[data-replay]");
    var state = capsule.querySelector("[data-capsule-state]");

    var BEATS = [
      { name: "capture", ms: 1000, label: "Capturing" },
      { name: "sealed", ms: 1300, label: "Saved" },
      { name: "restored", ms: 2900, label: "Restored" },
    ];
    var MAX_CYCLES = 2;

    var timer = null;
    var step = 0;
    var cycles = 0;
    var running = false;
    var visible = true;
    var finished = false;

    function paint(beat) {
      capsule.dataset.beat = beat.name;
      if (state) state.textContent = beat.label;
    }

    function settle() {
      finished = true;
      running = false;
      window.clearTimeout(timer);
      timer = null;
      // Back to the shipped default: restored, with no transitions pending.
      delete capsule.dataset.beat;
      if (state) state.textContent = "Restored";
    }

    function advance() {
      if (!running || !visible) return;

      if (step >= BEATS.length) {
        cycles += 1;
        step = 0;
        if (cycles >= MAX_CYCLES) {
          settle();
          return;
        }
      }

      var beat = BEATS[step];
      paint(beat);
      step += 1;
      timer = window.setTimeout(advance, beat.ms);
    }

    function start() {
      if (reduced.matches) return;
      window.clearTimeout(timer);
      finished = false;
      running = true;
      step = 0;
      cycles = 0;
      advance();
    }

    function pause() {
      running = false;
      window.clearTimeout(timer);
      timer = null;
    }

    function resume() {
      if (finished || reduced.matches || running) return;
      running = true;
      advance();
    }

    // Off-screen and background tabs do no work at all.
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(
        function (entries) {
          visible = entries[0].isIntersecting;
          if (visible) resume();
          else pause();
        },
        { threshold: 0.25 }
      ).observe(capsule);
    }

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) pause();
      else if (visible) resume();
    });

    if (replay) {
      replay.addEventListener("click", function () {
        start();
      });
    }

    // If the visitor has asked for less motion, the page simply stays in its
    // settled state — the sequence never runs and never needs to be undone.
    if (reduced.matches) return;

    window.setTimeout(function () {
      if (visible && !document.hidden) start();
    }, 700);
  }

  /* -------------------------------------------------------------------- */

  function init() {
    initNav();
    initReveal();
    initTabs();
    initFaq();
    initCopy();
    initCapsule();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
