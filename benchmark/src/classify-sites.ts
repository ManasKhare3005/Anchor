import { JSDOM } from "jsdom";
import { capture, classifySite, type SiteObservation } from "@anchor/matcher";
import { listSiteDirs, loadSite, type LoadedSite } from "./sites.ts";

export interface StateRow {
  site: string;
  page: string;
  kind: string;
  expected: string;
  got: SiteObservation["state"];
}

const url = (site: string, page: string) => `http://localhost/sites/${site}/${page}`;

function doc(loaded: LoadedSite, page: string): Document {
  return new JSDOM(loaded.read(page), { url: url(loaded.site.id, page) }).window.document;
}

/** Fingerprints for every feature, captured on v1/home.html. */
export function fingerprintsOf(loaded: LoadedSite) {
  const home = doc(loaded, loaded.site.home);
  return loaded.site.features.map((f) =>
    capture(home.querySelector(f.v1) as Element, {
      url: url(loaded.site.id, loaded.site.home),
      now: "2026-01-01T00:00:00.000Z",
      id: `${loaded.site.id}:${f.id}`,
    }),
  );
}

/** Classify every state page and the v2 home. v2 is expected to read as a redesign. */
export function classifyAllSites(dirs = listSiteDirs()): StateRow[] {
  return dirs.flatMap((dir) => {
    const loaded = loadSite(dir);
    const fps = fingerprintsOf(loaded);
    const pages = [
      { page: "v2/home.html", kind: "v2", expected: "redesign" },
      ...loaded.site.states.map((s) => ({ page: s.page, kind: s.kind, expected: s.expect })),
    ];
    return pages.map(({ page, kind, expected }) => ({
      site: loaded.site.id,
      page,
      kind,
      expected,
      got: classifySite(doc(loaded, page), fps, `${page}#1`).state,
    }));
  });
}
