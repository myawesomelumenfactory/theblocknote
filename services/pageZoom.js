/**
 * The root CSS `zoom` (see --app-zoom in App.css).
 * Mouse clientX/clientY stay in viewport pixels, while getBoundingClientRect()
 * under a zoomed root reports zoomed pixels, so pointer math must divide by this.
 */
export function pageZoom() {
  if (typeof document === 'undefined') return 1
  const zoom = Number.parseFloat(getComputedStyle(document.documentElement).zoom)
  return Number.isFinite(zoom) && zoom > 0 ? zoom : 1
}

/** Pointer position relative to an element's top-left, in the element's CSS pixels. */
export function pointerOffset(event, element) {
  const rect = element.getBoundingClientRect()
  const zoom = pageZoom()
  return {
    x: event.clientX / zoom - rect.left,
    y: event.clientY / zoom - rect.top,
    width: rect.width,
    height: rect.height,
  }
}
