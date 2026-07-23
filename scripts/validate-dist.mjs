import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const expectedPages = new Map([
  ["index.html", ["id=\"page-title\"", "Your hotkeys."]],
  ["404.html", ["id=\"not-found-title\"", "Page not found."]],
  ["drills.html", ["id=\"drills-title\"", "Available drills"]],
  ["drills/create.html", ["id=\"create-drill-title\"", "Create custom drill"]],
  ["drills/edit.html", ["id=\"edit-drill-title\"", "Edit custom drill"]],
  ["privacy.html", ["Privacy &amp; Beta Terms", "Only custom drills are stored persistently", "Use of the trainer and imported drill files is at your own risk."]],
]);
const productionOrigin = "https://aoe2hotkey.vejak-app.workers.dev";

function filesRecursively(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesRecursively(path) : [path];
  });
}

export function containsHtmlTemplateLiteral(code) {
  const templateLiterals = code.match(/(?<!["'])`(?:\\[\s\S]|[^\\`])*`/g) ?? [];
  return templateLiterals.some((literal) => /<\/?[a-z][^>]*>/i.test(literal));
}

export function validateDist(distDirectory = resolve("dist")) {
  const failures = [];
  const pageContents = [];

  for (const [relativePath, markers] of expectedPages) {
    const path = join(distDirectory, relativePath);
    if (!existsSync(path)) {
      failures.push(`Missing page: ${relativePath}`);
      continue;
    }
    const html = readFileSync(path, "utf8");
    pageContents.push(html);
    if (html.includes('<div id="app"></div>')) failures.push(`${relativePath} is an empty app shell`);
    for (const marker of markers) {
      if (!html.includes(marker)) failures.push(`${relativePath} is missing page content: ${marker}`);
    }
    if (/<style\b/i.test(html) || /\sstyle\s*=/i.test(html)) failures.push(`${relativePath} contains inline CSS`);
    if (/<template\b/i.test(html)) failures.push(`${relativePath} contains an HTML template`);
    if (/href="\/(?:drills|privacy)\.html(?:[?#"])/i.test(html)) failures.push(`${relativePath} links to an HTML filename instead of an extensionless route`);
    for (const script of html.matchAll(/<script\b([^>]*)>/gi)) {
      if (!/\bsrc\s*=/.test(script[1] ?? "")) failures.push(`${relativePath} contains inline JavaScript`);
    }
    for (const asset of html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)) {
      const assetPath = join(distDirectory, asset[1].slice(1));
      if (!existsSync(assetPath)) failures.push(`${relativePath} references missing asset: ${asset[1]}`);
    }
  }

  if (new Set(pageContents).size !== expectedPages.size) failures.push("Generated pages are not distinct documents");

  for (const forbidden of [
    "drills/index.html",
    "drills/create/index.html",
    "drills/edit/index.html",
    "privacy/index.html",
  ]) {
    if (existsSync(join(distDirectory, forbidden))) failures.push(`Unexpected folder-index page: ${forbidden}`);
  }

  const privacyPath = join(distDirectory, "privacy.html");
  if (existsSync(privacyPath)) {
    const privacy = readFileSync(privacyPath, "utf8");
    if (/<script\b/i.test(privacy)) failures.push("privacy.html must not require JavaScript");
    const visibleText = privacy.replace(/<[^>]+>/g, " ");
    if (visibleText.includes("vejak.app@gmail.com")) failures.push("privacy.html displays the contact email address");
  }

  const headersPath = join(distDirectory, "_headers");
  if (!existsSync(headersPath)) {
    failures.push("Missing Cloudflare _headers file");
  } else {
    const headers = readFileSync(headersPath, "utf8");
    if (/unsafe-/i.test(headers)) failures.push("Cloudflare CSP contains an unsafe source");
    for (const directive of ["Content-Security-Policy", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy"]) {
      if (!headers.includes(directive)) failures.push(`Cloudflare headers are missing ${directive}`);
    }
    if (!/\/assets\/\*\s+[\s\S]*?Cache-Control:\s*public,\s*max-age=31536000,\s*immutable/i.test(headers)) {
      failures.push("Cloudflare headers are missing immutable caching for hashed assets");
    }
  }

  const robotsPath = join(distDirectory, "robots.txt");
  if (!existsSync(robotsPath)) {
    failures.push("Missing robots.txt file");
  } else {
    const robots = readFileSync(robotsPath, "utf8");
    if (!/^User-agent:\s*\*\s*$/im.test(robots)) failures.push("robots.txt is missing the wildcard user-agent rule");
    if (!/^Allow:\s*\/\s*$/im.test(robots)) failures.push("robots.txt does not allow the website to be crawled");
    if (!new RegExp(`^Sitemap:\\s*${productionOrigin.replaceAll(".", "\\.")}\/sitemap\\.xml\\s*$`, "im").test(robots)) {
      failures.push("robots.txt does not reference the production sitemap");
    }
  }

  const sitemapPath = join(distDirectory, "sitemap.xml");
  if (!existsSync(sitemapPath)) {
    failures.push("Missing sitemap.xml file");
  } else {
    const sitemap = readFileSync(sitemapPath, "utf8");
    const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    const expectedUrls = ["/", "/drills", "/drills/create", "/privacy"].map((path) => `${productionOrigin}${path}`);
    if (JSON.stringify(sitemapUrls) !== JSON.stringify(expectedUrls)) failures.push("sitemap.xml does not contain the expected canonical URLs");
    if (sitemapUrls.some((url) => url.includes(".html") || url.includes("/drills/edit") || url.includes("/404"))) {
      failures.push("sitemap.xml contains a non-canonical or state-dependent URL");
    }
  }

  const noticesPath = join(distDirectory, "THIRD_PARTY_NOTICES.txt");
  if (!existsSync(noticesPath)) {
    failures.push("Missing third-party notices");
  } else {
    const notices = readFileSync(noticesPath, "utf8");
    for (const marker of ["fflate 0.8.3", "Copyright (c) 2026 Arjun Barrett", "MIT License"]) {
      if (!notices.includes(marker)) failures.push(`Third-party notices are missing: ${marker}`);
    }
  }

  if (existsSync(distDirectory)) {
    for (const path of filesRecursively(distDirectory).filter((file) => file.endsWith(".js"))) {
      const code = readFileSync(path, "utf8");
      if (/\.style\.|\sstyle=/.test(code)) failures.push(`${path.slice(distDirectory.length + 1)} assigns runtime inline styles`);
      if (/innerHTML|outerHTML|insertAdjacentHTML|document\.write|DOMParser|createContextualFragment|<template/i.test(code)) {
        failures.push(`${path.slice(distDirectory.length + 1)} contains forbidden HTML rendering`);
      }
    }
  }

  const sourceDirectory = resolve("src");
  if (existsSync(sourceDirectory)) {
    for (const path of filesRecursively(sourceDirectory).filter((file) => file.endsWith(".ts"))) {
      const code = readFileSync(path, "utf8");
      const relative = path.slice(sourceDirectory.length + 1);
      if (/innerHTML|outerHTML|insertAdjacentHTML|document\.write|DOMParser|createContextualFragment/i.test(code)) {
        failures.push(`src/${relative} contains forbidden HTML insertion or parsing`);
      }
      if (containsHtmlTemplateLiteral(code)) failures.push(`src/${relative} contains HTML inside a template literal`);
    }
  }

  if (failures.length > 0) throw new Error(`Deploy validation failed:\n- ${failures.join("\n- ")}`);
  return { pages: [...expectedPages.keys()] };
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && currentFile === resolve(process.argv[1])) {
  const result = validateDist();
  console.log(`Validated ${result.pages.length} distinct static HTML pages.`);
}
