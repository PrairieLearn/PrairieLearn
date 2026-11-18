// Streamdown imports rehype-raw even when its `raw` plugin isn't used, which
// pulls parse5 into the browser bundle. We never pass that plugin (AI chat
// shows HTML as text), so this no-op stands in for it.
export default function rehypeRaw() {}
