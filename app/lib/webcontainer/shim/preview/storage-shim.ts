/**
 * The preview runs in a sandboxed iframe without `allow-same-origin`, so the
 * browser throws a SecurityError as soon as code touches `localStorage` or
 * `sessionStorage`. Generated apps use them a lot (todo lists, settings), and
 * one unguarded access would leave the preview blank. This script, injected
 * first, replaces them with an in-memory Storage when they are blocked. Data
 * lasts until the preview reloads. Plain ES5 so it never fails to parse.
 */
export function renderStorageShimScript(): string {
  return `(function () {
  function memoryStorage() {
    var data = {};
    var keys = [];
    return {
      get length() { return keys.length; },
      key: function (index) { return index >= 0 && index < keys.length ? keys[index] : null; },
      getItem: function (key) { key = String(key); return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
      setItem: function (key, value) {
        key = String(key);
        if (!Object.prototype.hasOwnProperty.call(data, key)) keys.push(key);
        data[key] = String(value);
      },
      removeItem: function (key) {
        key = String(key);
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          delete data[key];
          keys.splice(keys.indexOf(key), 1);
        }
      },
      clear: function () { data = {}; keys = []; }
    };
  }

  ['localStorage', 'sessionStorage'].forEach(function (name) {
    try {
      window[name].getItem('__ca_probe__');
    } catch (blocked) {
      try {
        Object.defineProperty(window, name, { value: memoryStorage(), configurable: true });
      } catch (ignored) {}
    }
  });
})();`;
}
