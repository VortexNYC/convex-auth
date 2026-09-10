import { httpRouter, type Id } from "convex/server";
import { httpAction } from "./_generated/server";
import { components } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
  ".webmanifest": "application/manifest+json",
  ".xml": "application/xml",
};

function getMimeType(path: string): string {
  const dotIndex = path.lastIndexOf(".");
  const ext = dotIndex === -1 ? "" : path.substring(dotIndex).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

function isHtmlContentType(contentType: string): boolean {
  return contentType.startsWith("text/html");
}

function isHashedAsset(path: string): boolean {
  const match = path.match(/[-.]([\dA-Za-z_-]{6,32})\.[A-Za-z\d]+$/);
  return match !== null && /[\d_-]/.test(match[1]);
}

function cacheControlFor(path: string): string {
  return !path.toLowerCase().endsWith(".html") && isHashedAsset(path)
    ? "public, max-age=31536000, immutable"
    : "public, max-age=0, must-revalidate";
}

function etagMatches(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  const weakEtag = etag.startsWith("W/") ? etag.slice(2) : etag;
  for (const candidate of ifNoneMatch.split(",").map((s) => s.trim())) {
    const normalized = candidate.startsWith("W/") ? candidate.slice(2) : candidate;
    if (normalized === weakEtag) return true;
  }
  return false;
}

function decodeRequestPath(pathname: string): string | null {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return null;
  }
}

type Asset = {
  appStorageId?: string;
  blobId?: string;
  contentType: string;
  etag?: string;
  storageUrl?: string;
};

const serveStaticFile = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const decodedPath = decodeRequestPath(url.pathname);
  if (decodedPath === null) {
    return new Response("Bad Request", {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });
  }

  let path = decodedPath;
  if (path === "" || path === "/") {
    path = "/index.html";
  }

  // Try the exact path first, then the directory index. We disable the SPA
  // fallback because the docs site is a static MPA with directory indexes.
  const candidates = [path];
  if (!path.toLowerCase().endsWith("/index.html")) {
    candidates.push(path.endsWith("/") ? `${path}index.html` : `${path}/index.html`);
  }

  for (const candidate of candidates) {
    const asset: Asset | null = await ctx.runQuery(
      components.staticHosting.lib.resolveAssetForHttp,
      { path: candidate, spaFallback: false },
    );
    if (asset) {
      return serveAsset(ctx, request, asset, candidate, url.origin);
    }
  }

  return new Response("Not Found", {
    status: 404,
    headers: { "Content-Type": "text/plain" },
  });
});

async function serveAsset(
  ctx: ActionCtx,
  request: Request,
  asset: Asset,
  path: string,
  origin: string,
): Promise<Response> {
  const contentType = asset.contentType || getMimeType(path);
  const cacheControl = cacheControlFor(path);

  if (asset.blobId && !isHtmlContentType(contentType)) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${origin}/fs/blobs/${asset.blobId}`,
        "Cache-Control": cacheControl,
      },
    });
  }

  if (asset.etag && etagMatches(request.headers.get("If-None-Match"), asset.etag)) {
    return new Response(null, {
      status: 304,
      headers: { ETag: asset.etag, "Cache-Control": cacheControl },
    });
  }

  if (asset.appStorageId) {
    const blob = await ctx.storage.get(asset.appStorageId as Id<"_storage">);
    if (!blob) {
      return new Response("Storage error", { status: 500 });
    }
    return new Response(blob, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": cacheControl,
        ...(asset.etag ? { ETag: asset.etag } : {}),
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  if (!asset.storageUrl) {
    return new Response("Asset not available", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const storageResponse = await fetch(asset.storageUrl);
  if (!storageResponse.ok || !storageResponse.body) {
    return new Response("Storage error", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return new Response(storageResponse.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": cacheControl,
      ...(asset.etag ? { ETag: asset.etag } : {}),
      "X-Content-Type-Options": "nosniff",
    },
  });
}

const http = httpRouter();
http.route({
  pathPrefix: "/",
  method: "GET",
  handler: serveStaticFile,
});

export default http;
