import { useEffect, useState } from "react";
import { detectOwnerSession, type OwnerSessionStatus } from "./owner-session";

export interface UseOwnerSessionResult {
  status: OwnerSessionStatus;
}

/**
 * Resolves whether the current visitor is the garden owner. Starts
 * `"loading"`, then settles to `"owner"` or `"visitor"` once the detection
 * probe (`detectOwnerSession`) resolves. Safe to call from any component;
 * never updates state after unmount.
 */
export function useOwnerSession(): UseOwnerSessionResult {
  const [status, setStatus] = useState<OwnerSessionStatus>("loading");

  useEffect(() => {
    let cancelled = false;
    detectOwnerSession().then((result) => {
      if (!cancelled) setStatus(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { status };
}
