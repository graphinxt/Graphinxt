# Graphinxt → GitHub + Vercel: audit and migration

## What the zip actually contained

Not a static site. PHP, but only barely — the only PHP work being done was
`include 'header.php'` and `include 'footer.php'`, plus three mail scripts.
That is why this converts cleanly instead of needing a rebuild.

It also contained three copies of the entire website.

| Tree | Size | Status |
|---|---|---|
| `/` (root) | live | the real site |
| `/bd/` | 1.4 MB | full older copy, publicly reachable |
| `/finalBD/` | 1.5 MB | full older copy, publicly reachable |

Plus `.index.html` (3,713 lines), `service.php`, and four `.bak-20260810`
files sitting in the web root.

---

## Findings, ranked by money lost

### 1. Four service pages were de-indexing themselves — FIXED

`/services/ads`, `/services/app`, `/services/branding` and `/services/web`
each declared `<link rel="canonical" href="https://graphinxt.com/services">`.

That instructs Google to drop those pages and rank `/services` instead. Your
homepage "Claim Free Demo" button and your ads point at `/services/ads`. You
have been paying for traffic to a page you told Google not to index, and its
organic ranking has been suppressed the entire time.

Fixed in `src/`. Expect movement in Search Console within 2–4 weeks of deploy.

### 2. Two duplicate site copies are crawlable — YOU MUST FIX ON HOSTINGER

`robots.txt` only disallows `/issue-code`. Nothing blocks `/bd/` or
`/finalBD/`. Both contain the same titles, meta descriptions and body copy as
your live pages, and `bd/robots.txt` even points at the main sitemap.

That is textbook duplicate content across three URL sets. Excluded from the
Vercel build, but **they are live on Hostinger right now** — delete both
folders from `public_html` today, independent of this migration.

### 3. All lead email ran through PHP `mail()` — REPLACED

`send-lead.php`, `send.php` and `mail.php` used `mail()` with
`From: noreply@graphinxt.com`. Shared-host `mail()` sends from an IP that is
almost certainly not in your SPF record, so an unknown share of your leads has
been going to spam. There was also no rate limiting and no spam trap.

Replaced with `api/lead.js` (Resend + rate limit + honeypot). All eight files
that referenced the old endpoints have been rewired to `/api/lead`.

Note: `mail.php` was still labelled "Hoor Aesthetics" in its header comment —
a leftover from another project.

### 4. `.htaccess` routing does not exist on Vercel — TRANSLATED

Your clean URLs, the `?id=` redirects and the `.html` → extensionless rules
were all Apache. Vercel ignores `.htaccess` completely. Every rule has been
translated into `vercel.json`. This was the single most likely cause of a
"we moved to Vercel and everything 404'd" outcome.

### 5. No secrets were exposed — VERIFIED CLEAN

I scanned every JS, PHP and HTML file for API keys. The only `sk_live` hit was
a warning comment in `tools/index.php` telling you *not* to paste a Stripe
secret key. Your Stripe payment links and EmailJS public key are designed to be
public. **Nothing needs rotating.** Well handled.

---

## What is in this package

```
build.js        include expander: src/ -> dist/
vercel.json     routing, replaces .htaccess
api/lead.js     serverless form handler
CLAUDE.md       project context for Claude Code
package.json    build + local preview scripts
.gitignore      keeps dist/ and secrets out of git
src/            your site, PHP includes intact, fixes applied
```

Build verified: 22 pages, 24 includes expanded, zero PHP tags left in output.

The `src/partials/` approach matters. Flattening every page to standalone HTML
would have meant editing the nav in 22 files. You keep one `header.html`, and
the build step does the copying.

---

## Steps

### 1. Local check

```bash
npm run dev        # builds and serves dist/ at localhost:3000
```

Click every nav item, submit a form, load a blog article and a service page.

### 2. Git

```bash
git init
git add .
git commit -m "Migrate from Hostinger PHP to static build + Vercel"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/graphinxt.git
git push -u origin main
```

### 3. Resend (do before deploying, or forms will fail)

1. resend.com → add domain `graphinxt.com`
2. Add the DKIM/SPF records it gives you at your DNS provider
3. Copy the API key

### 4. Vercel

Import the repo. It reads `vercel.json`, so build command and output directory
are already set. Add one environment variable:

```
RESEND_API_KEY = re_xxxxxxxxxx
```

Deploy, then test on the `*.vercel.app` URL:

- `/` `/about` `/tools` `/services` `/services/ads` `/blog`
- `/blog/pricing-guide` (router with `?id=`)
- `/services/seo` (router — no folder exists for this one)
- `/about.html` should 308 → `/about`
- Submit the homepage contact form → should land on `/thank-you` and email you

### 5. Domain

1. Lower TTL to 300 on Hostinger DNS, wait a day
2. Vercel → Settings → Domains → add `graphinxt.com` and `www.graphinxt.com`,
   set the apex as primary
3. Use the exact record value shown on the Vercel domain card
4. **Do not touch MX, SPF, DKIM or TXT records** — `reach@graphinxt.com`
   depends on them
5. Keep Hostinger paid for 30 days as rollback

### 6. After cutover

- Search Console → resubmit `sitemap.xml`
- Search Console → Removals → clear any indexed `/bd/` or `/finalBD/` URLs
- Delete `bd/` and `finalBD/` from Hostinger `public_html`
- Watch Ads landing page reports for 48h

---

## Still open — decisions only you can make

**Blog articles live inside a JS object in `blog.html`.** All ~50 articles are
rendered client-side from `?id=`. Google does execute JS, but it crawls
server-rendered content faster and more reliably, and there is no per-article
`<title>` or meta description in the initial HTML. For a site whose whole SEO
strategy is content, this is the biggest remaining structural weakness. Fixing
it means generating a real HTML file per article at build time — `build.js` is
already the right place, and it's roughly 40 lines of additional code.

**`/portal` and `/issue-code` are unclear.** Both shipped. If they are internal
or unfinished, tell me and I'll remove or protect them.

**Root `styles.css` and `script.js`** may be dead files superseded by
`assets/`. I kept them rather than risk breaking a page that references them.
Worth a check.
