/**
 * In-flight or settled loads keyed by family + URL. Card painting and the
 * detail specimen request the same font many times (every repaint, every
 * modal open); sharing one `FontFace` per source means the file is fetched
 * and registered in `document.fonts` once instead of once per request.
 */
const loads = new Map<string, Promise<void>>();

function startLoad(key: string, family: string, sourceUrl: string): Promise<void> {
  const existing = loads.get(key);
  if (existing) return existing;
  const load = new FontFace(family, `url(${sourceUrl})`).load().then((face) => {
    document.fonts.add(face);
  });
  // A failed load is forgotten so a later request can retry it (the network
  // may have recovered); a successful one stays cached.
  load.catch(() => {
    if (loads.get(key) === load) loads.delete(key);
  });
  loads.set(key, load);
  return load;
}

/**
 * Loads `family` from `sourceUrl` via the FontFace API, waiting at most
 * `timeoutMs` for it. Resolves `true` once the face is registered, `false`
 * (never throws) on failure, timeout, a missing URL, or no FontFace support.
 * A timed-out load keeps running in the background, so a later call can
 * still pick up the font once it arrives.
 */
export async function loadFontOnce(
  family: string,
  sourceUrl: string | undefined,
  timeoutMs: number,
): Promise<boolean> {
  if (
    !sourceUrl ||
    typeof FontFace === "undefined" ||
    typeof document === "undefined" ||
    !document.fonts
  ) {
    return false;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const load = startLoad(`${family}\u0000${sourceUrl}`, family, sourceUrl);
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("font load timeout")), timeoutMs);
    });
    await Promise.race([load, timeout]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Forgets every cached load so each test starts from an empty cache. */
export function resetLoadedFontsForTests(): void {
  loads.clear();
}
