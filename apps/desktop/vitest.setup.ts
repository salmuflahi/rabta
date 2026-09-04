import "@testing-library/jest-dom/vitest";

// happy-dom 20 no longer puts Web Storage on the test global (vitest 2's
// environment shim copies a fixed key list off the Window, and the Window
// itself no longer carries `localStorage` as an own property). Every
// `localStorage.*` call in a test, and in the store's own readPrefs, was
// hitting `undefined` — forty tests failed on that alone before any of them
// reached an assertion. A small spec-shaped in-memory Storage restores them;
// it is reset per file because vitest isolates files, and tests that need a
// clean slate already call `clear()` themselves.
class MemoryStorage implements Storage {
  #map = new Map<string, string>();
  get length() {
    return this.#map.size;
  }
  clear() {
    this.#map.clear();
  }
  getItem(key: string) {
    return this.#map.has(key) ? (this.#map.get(key) as string) : null;
  }
  key(index: number) {
    return [...this.#map.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.#map.delete(key);
  }
  setItem(key: string, value: string) {
    this.#map.set(String(key), String(value));
  }
  [name: string]: unknown;
}

for (const key of ["localStorage", "sessionStorage"] as const) {
  if (typeof (globalThis as Record<string, unknown>)[key] === "undefined") {
    const storage = new MemoryStorage();
    Object.defineProperty(globalThis, key, { value: storage, configurable: true, writable: true });
    const w = (globalThis as unknown as { window?: object }).window;
    if (w && typeof (w as Record<string, unknown>)[key] === "undefined") {
      Object.defineProperty(w, key, { value: storage, configurable: true, writable: true });
    }
  }
}
