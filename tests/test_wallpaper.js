"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const wallpaper = require("../app/wallpaper.js");

function storageWith(value) {
  return {
    getItem(key) {
      return key === "wallpaperEnabled" ? value : null;
    }
  };
}

test("wallpapers default to enabled and honor disabled preference", () => {
  assert.equal(wallpaper.isEnabled(storageWith(null)), true);
  assert.equal(wallpaper.isEnabled(storageWith("true")), true);
  assert.equal(wallpaper.isEnabled(storageWith("false")), false);
});

test("selection changes deterministically at each hour", () => {
  const images = [{ url: "a" }, { url: "b" }, { url: "c" }];
  assert.equal(wallpaper.selectHourly(images, 0).url, "a");
  assert.equal(wallpaper.selectHourly(images, wallpaper.HOUR_MS).url, "b");
  assert.equal(wallpaper.selectHourly(images, wallpaper.HOUR_MS * 3).url, "a");
});

test("cache freshness expires after one day", () => {
  const cache = { fetchedAt: 1000, images: [{ url: "a" }] };
  assert.equal(wallpaper.cacheIsFresh(cache, 1000 + wallpaper.DAY_MS - 1), true);
  assert.equal(wallpaper.cacheIsFresh(cache, 1000 + wallpaper.DAY_MS), false);
  assert.equal(wallpaper.cacheIsFresh({ fetchedAt: 1000, images: [] }, 1001), false);
});

test("Commons pages are filtered to landscape images with clean metadata", () => {
  const pages = {
    1: {
      title: "File:Landscape.jpg",
      imageinfo: [{
        width: 2400,
        height: 1200,
        thumburl: "https://upload.wikimedia.org/landscape.jpg",
        descriptionurl: "https://commons.wikimedia.org/wiki/File:Landscape.jpg",
        extmetadata: {
          Artist: { value: "<b>Example &amp; Author</b>" },
          LicenseShortName: { value: "CC BY-SA 4.0" }
        }
      }]
    },
    2: {
      title: "File:Portrait.jpg",
      imageinfo: [{
        width: 1000,
        height: 1800,
        thumburl: "https://upload.wikimedia.org/portrait.jpg"
      }]
    }
  };

  const images = wallpaper.normalizeCommonsPages(pages);
  assert.equal(images.length, 1);
  assert.equal(images[0].artist, "Example & Author");
  assert.equal(images[0].license, "CC BY-SA 4.0");
});

test("failed or empty refresh falls back to stale cached playlist", () => {
  const cached = [{ url: "cached" }];
  assert.deepEqual(wallpaper.resolvePlaylist({ fetchedAt: 0, images: cached }, []), cached);
  assert.deepEqual(wallpaper.resolvePlaylist(null, []), []);
  assert.deepEqual(
    wallpaper.resolvePlaylist({ fetchedAt: 0, images: cached }, [{ url: "fresh" }]),
    [{ url: "fresh" }]
  );
});
