/** Prefix a site path with the base path (the site lives under /dynasty_website/ on GitHub Pages). */
export function url(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function teamUrl(slug: string): string {
  return url(`/teams/${slug}/`);
}
