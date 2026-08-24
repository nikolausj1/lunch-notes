export const PAPER = "#fbf8ee";

/**
 * Keep Safari's chrome (the iPhone status-bar area) in step with the page:
 * cream while the full-width mobile header is at the top, the desk color
 * once it has been pushed off (and always on desktop, where the header is
 * a floating slip instead).
 */
export function syncThemeColor() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  const headerShowing =
    window.innerWidth < 640 && root.dataset.headerOff !== "1";
  const desk =
    getComputedStyle(root).getPropertyValue("--desk").trim() || "#e6e6e6";
  meta.content = headerShowing ? PAPER : desk;
}
