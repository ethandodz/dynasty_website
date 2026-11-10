import { defineConfig } from 'astro/config';

// The site is served from https://<user>.github.io/<repo>/ on GitHub Pages.
// If you move it to a custom domain, set BASE_PATH to "/" in the deploy workflow.
export default defineConfig({
  site: process.env.SITE_URL || 'https://ethandodz.github.io',
  base: process.env.BASE_PATH ?? '/dynasty_website',
  trailingSlash: 'ignore',
});
