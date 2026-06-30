import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://ieltsuz.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  // Public, indexable routes only.
  const routes = ["", "/login", "/register"];

  return routes.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: path === "" ? "daily" : "monthly",
    priority: path === "" ? 1 : 0.6,
  }));
}
