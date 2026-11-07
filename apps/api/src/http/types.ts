import type { TokenScope } from "@garden/shared";
import type { Thumbnailer } from "../lib/thumbnails";
import type { VerifyAccessJwt } from "./auth/access-jwt";

export type Actor =
  | { type: "anonymous" }
  | { type: "owner"; via: "access"; credential: "header" | "cookie" }
  | { type: "owner"; via: "dev-bypass" }
  | {
      type: "token";
      tokenId: string;
      name: string;
      scope: TokenScope;
      client?: "extension" | "pwa";
    };

export interface AppBindings {
  DB: D1Database;
  MEDIA: R2Bucket;
  /** Cloudflare Images binding for card thumbnails; optional so a deployment without it serves originals. */
  IMAGES?: ImagesBinding;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  OWNER_EMAIL?: string;
  DEV_OWNER_BYPASS?: string;
  CORS_ORIGINS?: string;
  MAX_IMAGE_BYTES?: string;
  MAX_VIDEO_BYTES?: string;
}

export interface AppVariables {
  actor: Actor;
}

export type AppEnv = { Bindings: AppBindings; Variables: AppVariables };

/** Dependencies injectable for tests; production wiring supplies defaults. */
export interface AppDeps {
  verifyAccessJwt?: VerifyAccessJwt;
  /** Fetch implementation used for remote image import and link unfurl; tests inject fixtures. */
  fetchImpl?: typeof fetch;
  /** Thumbnail generator; defaults to the `IMAGES` binding. Tests inject a fake. */
  thumbnailer?: Thumbnailer;
}
