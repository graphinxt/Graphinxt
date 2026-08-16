#!/usr/bin/env node
/**
 * Graphinxt static build
 * ----------------------
 * Turns the PHP-include site into plain HTML that Vercel can serve.
 *
 *   src/   -> you edit this (keeps partials/header.html + partials/footer.html DRY)
 *   dist/  -> generated, deployed by Vercel, never edited by hand, never committed
 *
 * Run:  node build.js
 */

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const OUT = path.join(__dirname, 'dist');

/* Legacy root files that must NOT ship: duplicates of the /folder/index.html
   pages. Shipping them creates duplicate-content URLs in Google. */
const SKIP_FILES = new Set([
  'header.html', 'footer.html', '.index.html', 'service.php', '.htaccess',
]);

/* A root-level foo.html is a legacy duplicate ONLY if src/foo/index.php (or
   .html) also exists. Anything without a folder twin — /privacy, /portal,
   /issue-code — is still a live page and must ship. */
function isLegacyDuplicate(name, rel) {
  if (path.dirname(rel) !== '.') return false;
  if (!name.endsWith('.html')) return false;
  const stem = name.replace(/\.html$/, '');
  if (RENAME[name] || stem === '404' || stem === 'index') return false;
  return fs.existsSync(path.join(SRC, stem, 'index.php')) ||
         fs.existsSync(path.join(SRC, stem, 'index.html'));
}

/* Directories that must NOT ship. bd/ and finalBD/ are old copies of the whole
   site sitting inside the live web root. */
const SKIP_DIRS = new Set(['bd', 'finalBD', 'node_modules', '.git', 'partials']);

/* Client-side routers: renamed so they don't collide with /blog and /services. */
const RENAME = {
  'blog.html': 'blog-article.html',
  'service.html': 'service-detail.html',
};

const INCLUDE_RE = /<\?php\s+include\s+['"]([^'"]+)['"]\s*;?\s*\?>/g;

let stats = { pages: 0, assets: 0, includes: 0, skipped: 0 };

function resolveInclude(rawPath, fromFile) {
  // Original site used '../header.php' from any depth. Always resolve to the
  // matching file in src/partials/, whatever depth the page sits at.
  const base = path.basename(rawPath).replace(/\.php$/, '.html');
  const candidate = path.join(SRC, 'partials', base);
  if (fs.existsSync(candidate)) return fs.readFileSync(candidate, 'utf8');
  console.warn(`  ! missing partial "${rawPath}" referenced by ${fromFile}`);
  return '';
}

/**
 * header.html / footer.html contain root-relative-ish asset paths. Pages live at
 * different depths, so rewrite ../ prefixes to absolute /paths once, centrally.
 */
function absolutiseAssets(html) {
  return html
    .replace(/(href|src)=("|')(\.\.\/)+assets\//g, '$1=$2/assets/')
    .replace(/(href|src)=("|')assets\//g, '$1=$2/assets/');
}

function walk(dir, rel = '') {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const relPath = path.join(rel, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) { stats.skipped++; continue; }
      walk(abs, relPath);
      continue;
    }

    if (SKIP_FILES.has(entry.name) || entry.name.includes('.bak') ||
        isLegacyDuplicate(entry.name, relPath)) {
      stats.skipped++;
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();

    // Pages: .php and .html both get include-expansion, both land as .html
    if (ext === '.php' || ext === '.html') {
      // Standalone PHP handlers are replaced by /api functions — do not ship.
      if (/^(send|send-lead|mail|header|footer)\.php$/.test(entry.name)) {
        stats.skipped++;
        continue;
      }

      let html = fs.readFileSync(abs, 'utf8');
      html = html.replace(INCLUDE_RE, (_m, p) => {
        stats.includes++;
        return absolutiseAssets(resolveInclude(p, relPath));
      });

      // Strip any leftover PHP tags so nothing renders as visible text.
      html = html.replace(/<\?php[\s\S]*?\?>/g, '');

      let outName = entry.name.replace(/\.php$/, '.html');
      if (RENAME[outName]) outName = RENAME[outName];

      const outPath = path.join(OUT, path.dirname(relPath), outName);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, html);
      stats.pages++;
      continue;
    }

    // Everything else (css, js, images, robots.txt, sitemap.xml) copies through.
    const outPath = path.join(OUT, relPath);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.copyFileSync(abs, outPath);
    stats.assets++;
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
walk(SRC);

console.log(
  `\nBuild complete\n` +
  `  pages written : ${stats.pages}\n` +
  `  includes done : ${stats.includes}\n` +
  `  assets copied : ${stats.assets}\n` +
  `  files skipped : ${stats.skipped}\n`
);
