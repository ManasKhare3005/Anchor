import { fetchUsable, loadRealSites } from "./wayback.ts";

/** npm run real:fetch [site-id ...] — fill the cache; prints what worked and what didn't. */
const only = new Set(process.argv.slice(2));
for (const site of loadRealSites()) {
  if (only.size && !only.has(site.id)) continue;
  for (const which of ["before", "after"] as const) {
    try {
      const r = await fetchUsable(site, which);
      console.log(
        `${site.id.padEnd(10)} ${which.padEnd(6)} ${"timestamp" in r ? `ok ${r.timestamp}` : `FAILED ${r.error}`}`,
      );
    } catch (err) {
      console.log(`${site.id.padEnd(10)} ${which.padEnd(6)} ERROR ${(err as Error).message}`);
    }
  }
}
