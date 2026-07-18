(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WallpaperCore = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const HOUR_MS = 60 * 60 * 1000;
  const DAY_MS = 24 * HOUR_MS;

  function cleanMetadata(value) {
    return String(value || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, "\"")
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isEnabled(storage) {
    return storage.getItem("wallpaperEnabled") !== "false";
  }

  function cacheIsFresh(cache, now = Date.now()) {
    return Boolean(
      cache &&
      Array.isArray(cache.images) &&
      cache.images.length &&
      Number.isFinite(cache.fetchedAt) &&
      now - cache.fetchedAt < DAY_MS
    );
  }

  function normalizeCommonsPages(pages) {
    return Object.values(pages || {}).flatMap(page => {
      const info = page.imageinfo?.[0];
      if (!info) return [];
      const width = Number(info.thumbwidth || info.width || 0);
      const height = Number(info.thumbheight || info.height || 0);
      const url = info.thumburl || info.url;
      if (!url || width < height * 1.2) return [];

      const metadata = info.extmetadata || {};
      return [{
        url,
        sourceUrl: info.descriptionurl || "",
        title: cleanMetadata(metadata.ImageDescription?.value) ||
          String(page.title || "").replace(/^File:/, ""),
        artist: cleanMetadata(metadata.Artist?.value || metadata.Credit?.value) || "Wikimedia Commons",
        license: cleanMetadata(metadata.LicenseShortName?.value) || "See source",
        licenseUrl: cleanMetadata(metadata.LicenseUrl?.value),
        width,
        height
      }];
    });
  }

  function hourlyIndex(now, length, offset = 0) {
    if (!length) return -1;
    const hour = Math.floor(now / HOUR_MS);
    return ((hour + offset) % length + length) % length;
  }

  function selectHourly(images, now = Date.now(), offset = 0) {
    const index = hourlyIndex(now, images.length, offset);
    return index < 0 ? null : images[index];
  }

  function resolvePlaylist(cache, fetchedImages) {
    if (Array.isArray(fetchedImages) && fetchedImages.length) return fetchedImages;
    if (cache && Array.isArray(cache.images) && cache.images.length) return cache.images;
    return [];
  }

  return {
    HOUR_MS,
    DAY_MS,
    cleanMetadata,
    isEnabled,
    cacheIsFresh,
    normalizeCommonsPages,
    hourlyIndex,
    selectHourly,
    resolvePlaylist
  };
}));
