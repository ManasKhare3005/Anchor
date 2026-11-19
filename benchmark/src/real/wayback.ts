import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/**
 * Fetches archived copies of public pages from the Wayback Machine into a git-ignored cache.
 *
 * Dev tool only: never part of the extension (Hard Rule 6 is about the shipped extension). Uses
 * Node's built-in fetch, no new dependencies. Polite: one request at a time, at least 1.5 s apart,
 * retries with backoff. The `id_` URL form returns the original HTML without the Wayback toolbar
 * or rewritten links.
 */

export const BENCH_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const CACHE_DIR = join(BENCH_DIR, "cache");
const USER_AGENT = "AnchorBenchmark/0.1 (accessibility research; offline benchmark)";
const MIN_GAP_MS = 1500;

export const RealSiteSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  category: z.string(),
  url: z.string().url(),
  before: z.string().regex(/^\d{8}$/),
  after: z.string().regex(/^\d{8}$/),
});
export type RealSite = z.infer<typeof RealSiteSchema>;

export function loadRealSites(): RealSite[] {
  const raw = JSON.parse(readFileSync(join(BENCH_DIR, "sites.json"), "utf8")) as {
    sites: unknown[];
  };
  return raw.sites.map((s) => RealSiteSchema.parse(s));
}

let lastRequest = 0;

async function politeFetch(url: string, attempt = 1): Promise<Response> {
  const wait = lastRequest + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
  try {
    const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 5000 * attempt));
      return politeFetch(url, attempt + 1);
    }
    return res;
  } catch (err) {
    if (attempt < 4) {
      await new Promise((r) => setTimeout(r, 5000 * attempt));
      return politeFetch(url, attempt + 1);
    }
    throw err;
  }
}

export interface Capture {
  timestamp: string;
  length: number;
}

/** Captures near a target date (±45 days), closest first. HTML, status 200 only. */
export async function capturesNear(url: string, target: string): Promise<Capture[]> {
  const t = Date.UTC(+target.slice(0, 4), +target.slice(4, 6) - 1, +target.slice(6, 8));
  const day = 86_400_000;
  const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, "");
  const api =
    `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}&output=json` +
    `&from=${fmt(t - 45 * day)}&to=${fmt(t + 45 * day)}` +
    `&filter=statuscode:200&filter=mimetype:text/html&fl=timestamp,length&collapse=timestamp:8`;
  const res = await politeFetch(api);
  if (!res.ok) throw new Error(`CDX ${res.status} for ${url}`);
  const rows = (await res.json()) as string[][];
  return rows
    .slice(1)
    .map(([timestamp = "", length = "0"]) => ({ timestamp, length: Number(length) }))
    .sort((a, b) => {
      const da = Math.abs(
        Date.UTC(+a.timestamp.slice(0, 4), +a.timestamp.slice(4, 6) - 1, +a.timestamp.slice(6, 8)) -
          t,
      );
      const db = Math.abs(
        Date.UTC(+b.timestamp.slice(0, 4), +b.timestamp.slice(4, 6) - 1, +b.timestamp.slice(6, 8)) -
          t,
      );
      return da - db;
    });
}

const BLOCK_PAGE =
  /(robot check|are you a (human|robot)|complete the captcha|solve the captcha|access denied|request unsuccessful|pardon our interruption|verify you are (a )?human|enable javascript and cookies to continue)/i;

/** Title plus visible text: scripts and styles removed, so config strings like "CAPTCHA_ENABLED" don't count. */
function visibleText(html: string): string {
  const title = /<title[^>]*>([^<]*)/i.exec(html)?.[1] ?? "";
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
  return `${title} ${body.slice(0, 5000)}`;
}

/** Why a page is unusable, or null if it looks like a real home page. */
export function problemWith(html: string): string | null {
  if (html.length < 15_000) return `too small (${html.length} bytes)`;
  if (BLOCK_PAGE.test(visibleText(html))) return "bot-check or block page";
  const links = (html.match(/<a\s[^>]*href=/gi) ?? []).length;
  if (links < 25) return `too few links (${links}); likely rendered client-side`;
  return null;
}

export function cachePath(site: string, timestamp: string): string {
  return join(CACHE_DIR, site, `${timestamp}.html`);
}

export function cachedFor(site: string, which: "before" | "after"): string | null {
  const meta = join(CACHE_DIR, site, "meta.json");
  if (!existsSync(meta)) return null;
  const m = JSON.parse(readFileSync(meta, "utf8")) as Record<string, string | undefined>;
  const ts = m[which];
  return ts && existsSync(cachePath(site, ts)) ? ts : null;
}

/**
 * Fetch the closest usable capture for a target date. Tries up to `tries` captures, skipping
 * block pages and client-rendered shells. Returns the timestamp used, or a reason it failed.
 */
export async function fetchUsable(
  site: RealSite,
  which: "before" | "after",
  tries = 6,
): Promise<{ timestamp: string } | { error: string }> {
  const cached = cachedFor(site.id, which);
  if (cached) return { timestamp: cached };
  const captures = await capturesNear(site.url, site[which]);
  if (!captures.length) return { error: "no captures within ±45 days" };
  const problems: string[] = [];
  for (const c of captures.slice(0, tries)) {
    const res = await politeFetch(`https://web.archive.org/web/${c.timestamp}id_/${site.url}`);
    if (!res.ok) {
      problems.push(`${c.timestamp}: HTTP ${res.status}`);
      continue;
    }
    const html = await res.text();
    const problem = problemWith(html);
    if (problem) {
      problems.push(`${c.timestamp}: ${problem}`);
      continue;
    }
    mkdirSync(join(CACHE_DIR, site.id), { recursive: true });
    writeFileSync(cachePath(site.id, c.timestamp), html);
    const metaFile = join(CACHE_DIR, site.id, "meta.json");
    const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, "utf8")) : {};
    meta[which] = c.timestamp;
    writeFileSync(metaFile, JSON.stringify(meta, null, 2));
    return { timestamp: c.timestamp };
  }
  return { error: problems.join("; ") };
}
