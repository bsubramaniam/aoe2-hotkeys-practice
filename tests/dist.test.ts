import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { containsHtmlTemplateLiteral, validateDist } from "../scripts/validate-dist.mjs";
import { BUILTIN_COMMAND_PANELS } from "../src/builtin-command-panels";

const distDirectory = resolve("dist");
const sourceDirectory = resolve("src");
const pagePaths = [
  "index.html",
  "404.html",
  "drills.html",
  "drills/create.html",
  "drills/edit.html",
  "privacy.html",
] as const;

function readDist(path: string): string {
  return readFileSync(join(distDirectory, path), "utf8");
}

function filesRecursively(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesRecursively(path) : [path];
  });
}

describe("generated Cloudflare artifact", () => {
  it("contains distinct, content-complete static pages and passes deploy validation", () => {
    expect(validateDist()).toEqual({
      pages: [
        "index.html",
        "404.html",
        "drills.html",
        "drills/create.html",
        "drills/edit.html",
        "privacy.html",
      ],
    });
  });

  it("emits distinct authored documents instead of copied application shells", () => {
    const pages = pagePaths.map(readDist);
    const home = readDist("index.html");
    const drills = readDist("drills.html");

    expect(new Set(pages).size).toBe(pagePaths.length);
    expect(pages.every((page) => !page.includes('<div id="app"></div>'))).toBe(true);
    expect(home).toContain('id="page-title"');
    expect(readDist("404.html")).toContain('id="not-found-title"');
    expect(drills).toContain('id="drills-title"');
    expect(readDist("drills/create.html")).toContain('id="create-drill-title"');
    expect(readDist("drills/edit.html")).toContain('id="edit-drill-title"');
    expect(readDist("privacy.html")).toContain("Privacy &amp; Beta Terms");
    expect(home).toContain('<option value="1">Standard</option>');
    expect(home).toContain('<strong id="drill-duration">1:29</strong>');
    expect(drills).toContain("confirm it with a left click");
    expect(drills).toContain("<dt>Moderate duration</dt><dd>1:29</dd>");
    expect(drills).toContain("hotkeys and left clicks");
    expect(drills).not.toMatch(/marked zone|click zones/i);
  });

  it("keeps Cloudflare output flat without folder-index fallbacks", () => {
    for (const path of [
      "drills/index.html",
      "drills/create/index.html",
      "drills/edit/index.html",
      "privacy/index.html",
    ]) {
      expect(existsSync(join(distDirectory, path)), path).toBe(false);
    }
  });

  it("uses extensionless public navigation routes", () => {
    for (const path of pagePaths) {
      const html = readDist(path);
      expect(html, path).not.toMatch(/href="\/(?:drills|privacy)\.html(?:[?#"])/i);
    }
    expect(readDist("index.html")).toContain('href="/drills"');
    expect(readDist("index.html")).toContain('href="/privacy"');
  });

  it("contains no inline styles, inline scripts, or template elements", () => {
    for (const path of pagePaths) {
      const html = readDist(path);
      expect(html, path).not.toMatch(/<style\b/i);
      expect(html, path).not.toMatch(/\sstyle\s*=/i);
      expect(html, path).not.toMatch(/<template\b/i);
      for (const script of html.matchAll(/<script\b([^>]*)>/gi)) {
        expect(script[1], path).toMatch(/\bsrc\s*=/i);
      }
    }
  });

  it("keeps the zero-missing-hotkeys warning visually hidden", () => {
    const stylesheet = filesRecursively(join(distDirectory, "assets"))
      .filter((path) => path.endsWith(".css"))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    expect(stylesheet).toMatch(/\.mapping-warning\[hidden\]\s*\{\s*display:\s*none/);
  });

  it("references only generated assets that exist in dist", () => {
    for (const path of pagePaths) {
      for (const asset of readDist(path).matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)) {
        const assetPath = asset[1];
        expect(assetPath, path).toBeDefined();
        if (assetPath) expect(existsSync(join(distDirectory, assetPath.slice(1))), `${path}: ${assetPath}`).toBe(true);
      }
    }
  });

  it("keeps application source and generated bundles free of HTML-string rendering", () => {
    const forbidden = /innerHTML|outerHTML|insertAdjacentHTML|document\.write|DOMParser|createContextualFragment|<template/i;
    const sourceFiles = filesRecursively(sourceDirectory).filter((path) => path.endsWith(".ts"));
    const bundles = filesRecursively(distDirectory).filter((path) => path.endsWith(".js"));

    for (const path of sourceFiles) {
      const code = readFileSync(path, "utf8");
      expect(code, relative(sourceDirectory, path)).not.toMatch(forbidden);
      expect(containsHtmlTemplateLiteral(code), relative(sourceDirectory, path)).toBe(false);
    }
    for (const path of bundles) {
      const code = readFileSync(path, "utf8");
      expect(code, relative(distDirectory, path)).not.toMatch(forbidden);
      expect(code, relative(distDirectory, path)).not.toMatch(/\.style\.|\sstyle=/);
    }
  });

  it("detects HTML in template literals without confusing a quoted backtick key", () => {
    expect(containsHtmlTemplateLiteral("const view = `<section>Rendered</section>`;")).toBe(true);
    expect(containsHtmlTemplateLiteral('const key = "`"; const label = `Count: ${count}`;')).toBe(false);
  });

  it("ships strict Cloudflare headers without unsafe CSP sources", () => {
    const headers = readDist("_headers");

    expect(headers).not.toMatch(/unsafe-/i);
    expect(headers).toContain("Content-Security-Policy:");
    expect(headers).toContain("script-src-attr 'none'");
    expect(headers).toContain("style-src-attr 'none'");
    expect(headers).toContain("object-src 'none'");
    expect(headers).toContain("frame-ancestors 'none'");
    expect(headers).toContain("X-Content-Type-Options: nosniff");
    expect(headers).toContain("Referrer-Policy: no-referrer");
    expect(headers).toContain("Permissions-Policy:");
  });

  it("caches content-hashed assets immutably without caching HTML", () => {
    const headers = readDist("_headers");
    const rootRule = headers.split(/\r?\n\s*\r?\n/)[0] ?? "";

    expect(headers).toMatch(/\/assets\/\*\s+[\s\S]*?Cache-Control:\s*public,\s*max-age=31536000,\s*immutable/i);
    expect(rootRule).not.toContain("Cache-Control:");
  });

  it("ships a permissive robots file without an invalid sitemap URL", () => {
    const robots = readDist("robots.txt");

    expect(robots).toMatch(/^User-agent:\s*\*\s*$/im);
    expect(robots).toMatch(/^Allow:\s*\/\s*$/im);
    expect(robots).not.toMatch(/^Disallow:/im);
    expect(robots).toContain("Sitemap: https://aoe2hotkey.vejak-app.workers.dev/sitemap.xml");
  });

  it("ships an absolute canonical sitemap for public indexable pages", () => {
    const sitemap = readDist("sitemap.xml");
    const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

    expect(sitemap).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(urls).toEqual([
      "https://aoe2hotkey.vejak-app.workers.dev/",
      "https://aoe2hotkey.vejak-app.workers.dev/drills",
      "https://aoe2hotkey.vejak-app.workers.dev/drills/create",
      "https://aoe2hotkey.vejak-app.workers.dev/privacy",
    ]);
    expect(sitemap).not.toContain(".html");
    expect(sitemap).not.toContain("/drills/edit");
    expect(sitemap).not.toContain("/404");
  });

  it("ships the required runtime dependency notice", () => {
    const notices = readDist("THIRD_PARTY_NOTICES.txt");

    for (const panel of [
      "villager-command-panel.png",
      "economic-buildings-panel.png",
      "military-buildings-panel.png",
      ...BUILTIN_COMMAND_PANELS.map((definition) => definition.asset),
    ]) {
      expect(existsSync(join(distDirectory, "assets", "microsoft-game-content", panel)), panel).toBe(true);
    }
    expect(notices).toContain("assets/microsoft-game-content/");
    expect(notices).toContain("Game Content Usage Rules");
    expect(notices).toContain("must comply with");
    expect(notices).toContain("remove and replace the files");
    expect(notices).toMatch(/not endorsed by or\s+affiliated with Microsoft/);
    expect(notices).toContain("fflate 0.8.3");
    expect(notices).toContain("Copyright (c) 2026 Arjun Barrett");
    expect(notices).toContain("MIT License");
  });

  it("keeps the privacy page complete and independent from JavaScript", () => {
    const privacy = readDist("privacy.html");
    const visibleText = privacy.replace(/<[^>]+>/g, " ");

    expect(privacy).not.toMatch(/<script\b/i);
    expect(privacy).toContain("Last updated: 24 July 2026");
    expect(privacy).toContain("Only custom drills are stored persistently");
    expect(privacy).toContain("browser-local drill ID");
    expect(privacy).toContain("derived from its name");
    expect(privacy).toContain("does not use cookies or local storage for analytics");
    expect(privacy).toContain("does not fingerprint individuals for analytics");
    expect(privacy).toContain("strictly necessary security cookies");
    expect(privacy).toContain("does not transmit the contents of your hotkey files");
    expect(privacy).toContain("Use of the trainer and imported drill files is at your own risk.");
    expect(privacy).toContain("Game Content Usage Rules");
    expect(privacy).toContain("https://www.xbox.com/en-us/developers/rules");
    expect(privacy).toContain("MIT License does not cover the cropped Microsoft game content");
    expect(privacy).toContain("must comply with Microsoft");
    expect(privacy.match(/not endorsed by or affiliated with/g)).toHaveLength(2);
    expect(visibleText).not.toContain("vejak.app@gmail.com");
    expect(privacy).toContain("mailto:vejak.app@gmail.com");
  });
});
