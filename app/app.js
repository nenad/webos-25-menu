(() => {
  "use strict";

  const APP_ID = "io.github.nenad.webos25menu";
  const ROOT_SCRIPT =
    "/media/developer/apps/usr/palm/applications/io.github.nenad.webos25menu/root/install.sh";
  const APPS_SHORTCUT_ID = "com.webos.app.discovery";
  const HIDE_APPS_SHORTCUT_KEY = "hideAppsShortcut";
  const WALLPAPER_CACHE_KEY = "commonsWallpaperCacheV1";
  const WALLPAPER_INDEX_KEY = "commonsWallpaperIndex";
  const COMMONS_API_URL =
    "https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*" +
    "&generator=categorymembers&gcmtitle=Category%3AFeatured%20pictures%20of%20landscapes" +
    "&gcmtype=file&gcmlimit=24&prop=imageinfo" +
    "&iiprop=url%7Csize%7Cextmetadata&iiurlwidth=1920";
  const INSTALLER_ACTIONS = new Set([
    "status",
    "install",
    "install-force",
    "uninstall",
    "list-apps"
  ]);
  const FALLBACK_LAUNCH_POINTS = [
    {
      id: "com.webos.app.discovery",
      title: "Apps",
      iconColor: "#173f5f",
      params: {}
    }
  ];

  const appsElement = document.getElementById("apps");
  const messageElement = document.getElementById("message");
  const settingsPanel = document.getElementById("settingsPanel");
  const settingsButton = document.getElementById("settingsButton");
  const mapperStatus = document.getElementById("mapperStatus");
  const forceMapper = document.getElementById("forceMapper");
  const weatherCity = document.getElementById("weatherCity");
  const wallpaperLayers = [
    document.getElementById("wallpaperLayerA"),
    document.getElementById("wallpaperLayerB")
  ];
  const wallpaperAttribution = document.getElementById("wallpaperAttribution");
  const wallpaperToggle = document.getElementById("wallpaperToggle");
  const wallpaperDetails = document.getElementById("wallpaperDetails");
  const openWallpaperSource = document.getElementById("openWallpaperSource");
  const appsShortcutToggle = document.getElementById("appsShortcutToggle");

  let messageTimer;
  let wallpaperPlaylist = [];
  let activeWallpaper = null;
  let activeWallpaperLayer = -1;
  let wallpaperRefreshPromise = null;
  let wallpaperGeneration = 0;

  function showMessage(text, persistent = false) {
    messageElement.textContent = text;
    messageElement.hidden = false;
    clearTimeout(messageTimer);
    if (!persistent) {
      messageTimer = setTimeout(() => {
        messageElement.hidden = true;
      }, 4500);
    }
  }

  function lunaCall(uri, payload, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      if (typeof PalmServiceBridge === "undefined") {
        reject(new Error("PalmServiceBridge is unavailable"));
        return;
      }

      const bridge = new PalmServiceBridge();
      const timeout = setTimeout(() => reject(new Error(`Timeout calling ${uri}`)), timeoutMs);

      bridge.onservicecallback = raw => {
        clearTimeout(timeout);
        try {
          const response = JSON.parse(raw);
          if (response.returnValue === false) {
            reject(new Error(response.errorText || response.error || `Call failed: ${uri}`));
          } else {
            resolve(response);
          }
        } catch (error) {
          reject(error);
        }
      };

      bridge.call(uri, JSON.stringify(payload || {}));
    });
  }

  function iconFor(app) {
    const icon = app.extraLargeIcon || app.mediumLargeIcon || app.largeIcon || app.icon;
    if (!icon) return "assets/icon.png";
    if (/^(data:|https?:|file:)/.test(icon)) return icon;
    return icon.startsWith("/") ? `file://${icon}` : icon;
  }

  function renderApps(apps) {
    appsElement.textContent = "";

    apps.forEach((app, index) => {
      const button = document.createElement("button");
      button.className = "app-tile launcher-focusable";
      button.type = "button";
      button.dataset.index = String(index);
      button.style.setProperty("--tile-color", app.iconColor || app.bgColor || "#243247");

      const icon = document.createElement("span");
      icon.className = "app-icon";
      const image = document.createElement("img");
      image.src = iconFor(app);
      image.alt = "";
      image.addEventListener("error", () => {
        image.src = "assets/icon.png";
      }, { once: true });
      icon.appendChild(image);

      const title = document.createElement("span");
      title.className = "app-title";
      title.textContent = app.title || app.id;

      button.append(icon, title);
      button.addEventListener("focus", () => {
        button.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      });
      button.addEventListener("click", () => launchApp(app));
      appsElement.appendChild(button);
    });

    const first = appsElement.querySelector(".app-tile");
    if (first && settingsPanel.hidden) requestAnimationFrame(() => first.focus());
  }

  function isAppsShortcutHidden() {
    return localStorage.getItem(HIDE_APPS_SHORTCUT_KEY) === "true";
  }

  function updateAppsShortcutToggle() {
    const hidden = isAppsShortcutHidden();
    appsShortcutToggle.textContent = `Hide Apps shortcut: ${hidden ? "On" : "Off"}`;
    appsShortcutToggle.setAttribute("aria-pressed", String(hidden));
  }

  function visibleLaunchPoints(launchPoints) {
    return launchPoints.filter(app =>
      app.id !== APP_ID &&
      (!isAppsShortcutHidden() || app.id !== APPS_SHORTCUT_ID)
    );
  }

  async function loadLaunchPoints() {
    try {
      const response = await runInstaller("list-apps");
      const launchPoints = visibleLaunchPoints(response.launchPoints || []);
      const fallback = isAppsShortcutHidden() ? [] : FALLBACK_LAUNCH_POINTS;
      renderApps(launchPoints.length ? launchPoints : fallback);
    } catch (error) {
      console.warn("Stock Home launch points unavailable:", error);
      renderApps(isAppsShortcutHidden() ? [] : FALLBACK_LAUNCH_POINTS);
    }
  }

  async function launchApp(app) {
    try {
      await lunaCall("luna://com.webos.applicationManager/launch", {
        id: app.id,
        params: app.params || {}
      });
    } catch (error) {
      console.error(error);
      showMessage(`Could not launch ${app.title || app.id}`);
    }
  }

  function updateClock() {
    document.getElementById("clock").textContent = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(new Date());
  }

  function weatherSymbol(code, isDay) {
    if (code === 0) return isDay ? "\u2600" : "\u25cf";
    if (code <= 3) return "\u2600";
    if (code <= 48) return "\u224b";
    if (code <= 67) return "\u2602";
    if (code <= 77) return "\u273b";
    if (code <= 82) return "\u2602";
    if (code <= 86) return "\u273b";
    return "\u03df";
  }

  function setWeatherVisible(visible) {
    ["weatherDivider", "weatherIcon", "temperature", "location"].forEach(id => {
      document.getElementById(id).hidden = !visible;
    });
  }

  async function resolveWeatherCity() {
    const saved = localStorage.getItem("weatherCity")?.trim();
    if (saved) return saved;

    try {
      const preference = await lunaCall(
        "luna://com.palm.preferences/appProperties/getAppProperty",
        { appId: "com.webos.app.home", key: "location" }
      );
      return preference.location?.localizedName ||
        preference.value?.localizedName ||
        preference.localizedName ||
        "";
    } catch (error) {
      console.warn("Could not read TV location:", error);
      return "";
    }
  }

  async function loadWeather() {
    const city = await resolveWeatherCity();
    if (!city) {
      setWeatherVisible(false);
      return;
    }

    try {
      const geocodingUrl =
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}` +
        "&count=1&language=en&format=json";
      const geocodingResponse = await fetch(geocodingUrl);
      if (!geocodingResponse.ok) throw new Error("Weather geocoding failed");
      const geocoding = await geocodingResponse.json();
      const place = geocoding.results?.[0];
      if (!place) throw new Error(`No coordinates found for ${city}`);

      const weatherUrl =
        "https://api.open-meteo.com/v1/forecast" +
        `?latitude=${place.latitude}&longitude=${place.longitude}` +
        "&current=temperature_2m,weather_code,is_day&timezone=auto";
      const weatherResponse = await fetch(weatherUrl);
      if (!weatherResponse.ok) throw new Error("Weather request failed");
      const weather = await weatherResponse.json();
      const current = weather.current;
      if (!current) throw new Error("Weather data is incomplete");

      document.getElementById("temperature").textContent =
        `${Math.round(current.temperature_2m)}\u00b0C`;
      document.getElementById("weatherIcon").textContent =
        weatherSymbol(current.weather_code, current.is_day === 1);
      document.getElementById("location").textContent =
        place.name || city;
      setWeatherVisible(true);
    } catch (error) {
      console.warn("Weather unavailable:", error);
      setWeatherVisible(false);
    }
  }

  function readWallpaperCache() {
    try {
      const cache = JSON.parse(localStorage.getItem(WALLPAPER_CACHE_KEY) || "null");
      return cache && Array.isArray(cache.images) ? cache : null;
    } catch (error) {
      console.warn("Ignoring invalid wallpaper cache:", error);
      return null;
    }
  }

  function writeWallpaperCache(images, fetchedAt) {
    try {
      localStorage.setItem(WALLPAPER_CACHE_KEY, JSON.stringify({ fetchedAt, images }));
    } catch (error) {
      console.warn("Could not cache wallpaper metadata:", error);
    }
  }

  async function refreshWallpaperPlaylist() {
    const cache = readWallpaperCache();
    if (WallpaperCore.cacheIsFresh(cache)) return cache.images;
    if (wallpaperRefreshPromise) return wallpaperRefreshPromise;

    wallpaperRefreshPromise = (async () => {
      try {
        const response = await fetch(COMMONS_API_URL);
        if (!response.ok) throw new Error(`Wikimedia returned HTTP ${response.status}`);
        const data = await response.json();
        const images = WallpaperCore.normalizeCommonsPages(data.query?.pages);
        const playlist = WallpaperCore.resolvePlaylist(cache, images);
        if (images.length) writeWallpaperCache(images, Date.now());
        if (!playlist.length) throw new Error("Wikimedia returned no landscape images");
        return playlist;
      } catch (error) {
        console.warn("Wikimedia wallpapers unavailable:", error);
        return WallpaperCore.resolvePlaylist(cache, []);
      } finally {
        wallpaperRefreshPromise = null;
      }
    })();

    return wallpaperRefreshPromise;
  }

  function preloadWallpaper(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(`Could not load wallpaper ${url}`));
      image.src = url;
    });
  }

  function showWallpaperAttribution(image) {
    if (!image) {
      wallpaperAttribution.hidden = true;
      wallpaperDetails.textContent = "Using the built-in neutral background.";
      openWallpaperSource.hidden = true;
      openWallpaperSource.dataset.url = "";
      return;
    }

    wallpaperAttribution.textContent = `Photo: ${image.artist} · ${image.license}`;
    wallpaperAttribution.hidden = false;
    wallpaperDetails.textContent =
      `${image.title} — ${image.artist} — ${image.license}` +
      (image.sourceUrl ? ` — ${image.sourceUrl}` : "");
    openWallpaperSource.dataset.url = image.sourceUrl || image.licenseUrl || "";
    openWallpaperSource.hidden = !openWallpaperSource.dataset.url;
  }

  async function applyHourlyWallpaper(generation = wallpaperGeneration) {
    if (!WallpaperCore.isEnabled(localStorage) || !wallpaperPlaylist.length) {
      showWallpaperAttribution(null);
      return;
    }

    const now = Date.now();
    const attempts = Math.min(wallpaperPlaylist.length, 5);
    for (let offset = 0; offset < attempts; offset += 1) {
      const image = WallpaperCore.selectHourly(wallpaperPlaylist, now, offset);
      if (!image) break;
      if (activeWallpaper?.url === image.url) {
        showWallpaperAttribution(image);
        return;
      }

      try {
        await preloadWallpaper(image.url);
        if (generation !== wallpaperGeneration || !WallpaperCore.isEnabled(localStorage)) return;

        const nextLayer = activeWallpaperLayer === 0 ? 1 : 0;
        const previousLayer = activeWallpaperLayer;
        wallpaperLayers[nextLayer].style.backgroundImage = `url("${image.url.replace(/"/g, "%22")}")`;
        let activated = false;
        const activate = () => {
          if (
            activated ||
            generation !== wallpaperGeneration ||
            !WallpaperCore.isEnabled(localStorage)
          ) return;
          activated = true;
          wallpaperLayers[nextLayer].classList.add("active");
          if (previousLayer >= 0 && previousLayer !== nextLayer) {
            wallpaperLayers[previousLayer].classList.remove("active");
          }
          activeWallpaperLayer = nextLayer;
          activeWallpaper = image;
          localStorage.setItem(
            WALLPAPER_INDEX_KEY,
            String(WallpaperCore.hourlyIndex(now, wallpaperPlaylist.length, offset))
          );
          showWallpaperAttribution(image);
        };
        requestAnimationFrame(activate);
        setTimeout(activate, 250);
        return;
      } catch (error) {
        console.warn("Skipping unavailable wallpaper:", error);
      }
    }

    if (!activeWallpaper) showWallpaperAttribution(null);
  }

  function updateWallpaperToggle() {
    const enabled = WallpaperCore.isEnabled(localStorage);
    wallpaperToggle.textContent = `Hourly Wikimedia wallpapers: ${enabled ? "On" : "Off"}`;
    wallpaperToggle.setAttribute("aria-pressed", String(enabled));
  }

  function stopWallpapers() {
    wallpaperGeneration += 1;
    activeWallpaper = null;
    activeWallpaperLayer = -1;
    wallpaperLayers.forEach(layer => {
      layer.classList.remove("active");
      layer.style.backgroundImage = "";
    });
    showWallpaperAttribution(null);
    updateWallpaperToggle();
  }

  async function startWallpapers() {
    updateWallpaperToggle();
    if (!WallpaperCore.isEnabled(localStorage)) {
      stopWallpapers();
      return;
    }

    const generation = ++wallpaperGeneration;
    wallpaperPlaylist = await refreshWallpaperPlaylist();
    if (generation !== wallpaperGeneration) return;
    await applyHourlyWallpaper(generation);
  }

  async function wallpaperTick() {
    if (!WallpaperCore.isEnabled(localStorage)) return;
    const cache = readWallpaperCache();
    if (!WallpaperCore.cacheIsFresh(cache)) {
      wallpaperPlaylist = await refreshWallpaperPlaylist();
    }
    await applyHourlyWallpaper();
  }

  function parseInstallerOutput(response) {
    const stdout = (response.stdoutString || "").trim();
    const line = stdout.split("\n").filter(Boolean).pop();
    if (!line) throw new Error(response.stderrString || "Installer returned no status");
    return JSON.parse(line);
  }

  async function runInstaller(action) {
    if (!INSTALLER_ACTIONS.has(action)) throw new Error("Invalid installer action");
    const response = await lunaCall(
      "luna://org.webosbrew.hbchannel.service/exec",
      { command: `${ROOT_SCRIPT} ${action}` },
      20000
    );
    return parseInstallerOutput(response);
  }

  function describeMapperStatus(status) {
    forceMapper.hidden = !status.conflict;
    document.getElementById("enableMapper").disabled = status.installed && status.running;
    document.getElementById("disableMapper").disabled = !status.installed;

    if (!status.root) return "Homebrew Channel is not elevated. Root access is required.";
    if (!status.compatible) return status.message || "This TV did not pass compatibility checks.";
    if (status.running) return "Enabled and running.";
    if (status.installed) return "Installed but not running. Refresh or reinstall.";
    if (status.conflict) return "A conflicting remote mapper is enabled.";
    return "Compatible and ready to enable.";
  }

  async function refreshMapperStatus() {
    mapperStatus.textContent = "Checking compatibility…";
    try {
      const status = await runInstaller("status");
      mapperStatus.textContent = describeMapperStatus(status);
      return status;
    } catch (error) {
      console.error(error);
      mapperStatus.textContent =
        `Setup service unavailable: ${error.message}. Install and elevate Homebrew Channel.`;
      forceMapper.hidden = true;
      return null;
    }
  }

  async function changeMapper(action) {
    mapperStatus.textContent = action === "uninstall" ? "Disabling…" : "Enabling…";
    try {
      const result = await runInstaller(action);
      if (!result.ok) throw new Error(result.message || "Setup failed");
      showMessage(result.message || "Configuration updated");
    } catch (error) {
      console.error(error);
      showMessage(error.message, true);
    } finally {
      await refreshMapperStatus();
    }
  }

  function beginWeatherEditing() {
    weatherCity.readOnly = false;
    weatherCity.blur();
    setTimeout(() => weatherCity.focus(), 0);
  }

  function openSettings() {
    settingsPanel.hidden = false;
    weatherCity.readOnly = true;
    weatherCity.value = localStorage.getItem("weatherCity") || "";
    updateAppsShortcutToggle();
    refreshMapperStatus();
    requestAnimationFrame(() => document.getElementById("closeSettings").focus());
  }

  function closeSettings() {
    settingsPanel.hidden = true;
    settingsButton.focus();
  }

  function focusables() {
    if (!settingsPanel.hidden) {
      return [...settingsPanel.querySelectorAll(".focusable:not([hidden]):not([disabled])")];
    }
    return [...document.querySelectorAll(".launcher-focusable, #settingsButton")];
  }

  function moveFocus(delta) {
    const items = focusables();
    if (!items.length) return;
    const current = Math.max(0, items.indexOf(document.activeElement));
    items[Math.max(0, Math.min(items.length - 1, current + delta))].focus();
  }

  document.addEventListener("keydown", event => {
    const isBack = event.key === "Escape" ||
      event.keyCode === 461 ||
      event.keyIdentifier === "webOS_Back";

    if (isBack) {
      event.preventDefault();
      event.stopPropagation();
      if (!settingsPanel.hidden) closeSettings();
      return;
    }

    if (event.target instanceof HTMLInputElement) {
      if (event.key === "Enter" || event.keyCode === 13) {
        event.preventDefault();
        event.stopPropagation();
        if (event.target.readOnly) {
          beginWeatherEditing();
        } else {
          event.target.blur();
          event.target.readOnly = true;
          document.getElementById("saveWeather").focus();
        }
        return;
      }
      if (!event.target.readOnly) return;
    }

    switch (event.key) {
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        moveFocus(-1);
        break;
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        moveFocus(1);
        break;
      case "Enter":
        if (document.activeElement instanceof HTMLButtonElement) {
          event.preventDefault();
          document.activeElement.click();
        }
        break;
    }
  });

  settingsButton.addEventListener("click", openSettings);
  document.getElementById("closeSettings").addEventListener("click", closeSettings);
  document.getElementById("refreshStatus").addEventListener("click", refreshMapperStatus);
  document.getElementById("enableMapper").addEventListener("click", () => changeMapper("install"));
  forceMapper.addEventListener("click", () => changeMapper("install-force"));
  document.getElementById("disableMapper").addEventListener("click", () => changeMapper("uninstall"));

  appsShortcutToggle.addEventListener("click", () => {
    const hidden = !isAppsShortcutHidden();
    localStorage.setItem(HIDE_APPS_SHORTCUT_KEY, String(hidden));
    updateAppsShortcutToggle();
    loadLaunchPoints();
    showMessage(`Apps shortcut ${hidden ? "hidden" : "shown"}`);
  });

  wallpaperToggle.addEventListener("click", () => {
    const enabled = !WallpaperCore.isEnabled(localStorage);
    localStorage.setItem("wallpaperEnabled", String(enabled));
    if (enabled) startWallpapers();
    else stopWallpapers();
    showMessage(`Hourly Wikimedia wallpapers ${enabled ? "enabled" : "disabled"}`);
  });

  openWallpaperSource.addEventListener("click", async () => {
    const target = openWallpaperSource.dataset.url;
    if (!target) return;
    try {
      await lunaCall("luna://com.webos.applicationManager/launch", {
        id: "com.webos.app.browser",
        params: { target }
      });
    } catch (error) {
      console.error(error);
      showMessage("Could not open the Wikimedia source");
    }
  });

  weatherCity.addEventListener("click", () => {
    if (weatherCity.readOnly) beginWeatherEditing();
  });

  document.getElementById("saveWeather").addEventListener("click", () => {
    weatherCity.readOnly = true;
    const city = weatherCity.value.trim();
    if (city) localStorage.setItem("weatherCity", city);
    else localStorage.removeItem("weatherCity");
    loadWeather();
    showMessage("Weather preference saved");
  });

  document.getElementById("clearWeather").addEventListener("click", () => {
    weatherCity.readOnly = true;
    localStorage.removeItem("weatherCity");
    weatherCity.value = "";
    loadWeather();
    showMessage("Using the TV weather location");
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      updateClock();
      loadLaunchPoints();
      loadWeather();
      wallpaperTick();
    }
  });

  document.addEventListener("webOSRelaunch", () => {
    updateClock();
    loadLaunchPoints();
    loadWeather();
    wallpaperTick();
  });

  updateClock();
  setInterval(updateClock, 15000);
  setInterval(wallpaperTick, 60000);
  loadLaunchPoints();
  loadWeather();
  startWallpapers();
})();
