# Graphinxt — project context

Marketing/agency site for Graphinxt (graphinxt.com). Serves UK, USA, Canada,
Australia, New Zealand. Paid Google Ads traffic runs to this site, so URL
stability and form reliability are business-critical, not cosmetic.

## Stack

Plain HTML, CSS and vanilla JS. No framework, no React, no bundler.
A small Node script (`build.js`) expands shared partials and writes `dist/`.
Vercel runs that script on every push.

## Layout

```
src/                  <- edit here, this is the source of truth
  partials/
    header.html       <- site nav, injected into every page
    footer.html       <- site footer, injected into every page
  index.php           <- pages keep the .php extension; build.js emits .html
  about/index.php
  services/index.php
  services/{web,app,branding,ads}/index.php
  blog/index.php      <- article LISTING page
  blog.html           <- article ROUTER, reads ?id= (emitted as blog-article.html)
  service.html        <- service ROUTER, reads ?id= (emitted as service-detail.html)
  tools/index.php     <- 12 free AI tools, main lead magnet
  assets/             <- css, js, images
api/
  lead.js             <- all form submissions land here
build.js              <- include expander
vercel.json           <- routing, replaces the old .htaccess
dist/                 <- GENERATED. Never edit. Never commit.
```

## Rules

- Never edit anything in `dist/`. Edit `src/`, then run `node build.js`.
- Never change an existing public URL. Paid ads point at `/tools`,
  `/services/ads`, `/website-check`. A 404 there costs money directly.
- Blog articles and the remaining service pages are data objects inside
  `blog.html` and `service.html`. To add an article, add an entry to the
  data object AND a `<loc>` to `src/sitemap.xml`. Do not create a new file.
- Every page needs its own unique `rel="canonical"`. Four service pages
  previously all pointed at `/services`; do not reintroduce that.
- Forms POST to `/api/lead`. There is no PHP anywhere. Do not add any.
- Secrets live in Vercel environment variables only. Nothing with a key
  goes in `src/` — it ships to the browser.
- `.htaccess` does nothing on Vercel. Routing changes go in `vercel.json`.

## Brand

- Dark base `#363638`, darker `#2a2a2c`, gold accent `#e9c46f`
- Light mode toggled via `body.light-mode`, variables already defined
- Font: Montserrat
- Contact: reach@graphinxt.com, WhatsApp +971 56 478 5139

## Before finishing any task

1. Run `node build.js` and confirm it reports no missing partials.
2. Confirm the page count did not drop.
3. Do not push directly to `main`; work on a branch and check the Vercel
   preview URL.
