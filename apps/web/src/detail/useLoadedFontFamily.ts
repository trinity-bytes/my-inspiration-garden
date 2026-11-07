import { useEffect, useState } from "react";
import { loadFontOnce } from "../fonts/load-font";

const DEFAULT_TIMEOUT_MS = 2500;

export interface LoadedFontFamily {
  /** `family` once genuinely loaded, otherwise `fallbackFamily`. */
  fontFamily: string;
  loaded: boolean;
}

/**
 * Loads `family` from `sourceUrl` for the item detail view's font specimen,
 * through the same shared loader `card-painters.ts` uses for the canvas card
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
    if (!sourceUrl) return;

    let cancelled = false;
    void loadFontOnce(family, sourceUrl, timeoutMs).then((loaded) => {
      if (cancelled) return;
      setResult(
        loaded
          ? { fontFamily: family, loaded: true }
          : { fontFamily: fallbackFamily, loaded: false },
      );
    });

    return () => {
      cancelled = true;
    };
  }, [family, sourceUrl, fallbackFamily, timeoutMs]);

  return result;
}
