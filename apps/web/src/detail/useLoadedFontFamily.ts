import { useEffect, useState } from "react";

const DEFAULT_TIMEOUT_MS = 2500;

export interface LoadedFontFamily {
  /** `family` once genuinely loaded, otherwise `fallbackFamily`. */
  fontFamily: string;
  loaded: boolean;
}

/**
 * Loads `family` from `sourceUrl` via the FontFace API for the item detail
 * view's font specimen (T9 scope B) — the same "load live, race a timeout,
 * fall back to Geist" behavior `card-painters.ts` uses for the canvas card
 * texture, so the (much larger) detail specimen shows the real font too,
 * not just a CSS `font-family` stack that silently falls through to Geist
 * because nothing ever fetched "family" in the first place.
 */
export function useLoadedFontFamily(
  family: string,
  sourceUrl: string | undefined,
  fallbackFamily: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): LoadedFontFamily {
  const [result, setResult] = useState<LoadedFontFamily>({
    fontFamily: fallbackFamily,
    loaded: false,
  });

  useEffect(() => {
    setResult({ fontFamily: fallbackFamily, loaded: false });

    if (
      !sourceUrl ||
      typeof FontFace === "undefined" ||
      typeof document === "undefined" ||
      !document.fonts
    ) {
      return;
    }

    let cancelled = false;
    const face = new FontFace(family, `url(${sourceUrl})`);
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("font load timeout")), timeoutMs);
    });

    Promise.race([face.load(), timeout])
      .then((loadedFace) => {
        if (cancelled) return;
        document.fonts.add(loadedFace as FontFace);
        setResult({ fontFamily: family, loaded: true });
      })
      .catch(() => {
        if (cancelled) return;
        setResult({ fontFamily: fallbackFamily, loaded: false });
      });

    return () => {
      cancelled = true;
    };
  }, [family, sourceUrl, fallbackFamily, timeoutMs]);

  return result;
}
