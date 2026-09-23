declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    MEDIA: R2Bucket;
  }
}

interface Env extends Cloudflare.Env {}
