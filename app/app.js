(() => {
  "use strict";

  const APP_ID = "io.github.nenad.webos25menu";
  const ROOT_SCRIPT =
    "/media/developer/apps/usr/palm/applications/io.github.nenad.webos25menu/root/install.sh";
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

  let launchPoints = [];
  let messageTimer;

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
    launchPoints = apps;
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

  async function loadLaunchPoints() {
    let visible = [];
    try {
      const response = await lunaCall(
        "luna://com.webos.applicationManager/listLaunchPoints",
        {}
      );
      visible = (response.launchPoints || []).filter(app =>
        app.hidden !== true && app.id !== APP_ID
      );
    } catch (error) {
      console.warn("Public launch-point API unavailable:", error);
    }

    if (!visible.length) {
      try {
        const response = await runInstaller("list-apps");
        visible = (response.launchPoints || []).filter(app => app.id !== APP_ID);
      } catch (error) {
        console.warn("Root app inventory unavailable:", error);
      }
    }

    renderApps(visible.length ? visible : FALLBACK_LAUNCH_POINTS);
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

  function openSettings() {
    settingsPanel.hidden = false;
    weatherCity.value = localStorage.getItem("weatherCity") || "";
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

    if (event.target instanceof HTMLInputElement) return;

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

  document.getElementById("saveWeather").addEventListener("click", () => {
    const city = weatherCity.value.trim();
    if (city) localStorage.setItem("weatherCity", city);
    else localStorage.removeItem("weatherCity");
    loadWeather();
    showMessage("Weather preference saved");
  });

  document.getElementById("clearWeather").addEventListener("click", () => {
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
    }
  });

  document.addEventListener("webOSRelaunch", () => {
    updateClock();
    loadLaunchPoints();
    loadWeather();
  });

  updateClock();
  setInterval(updateClock, 15000);
  loadLaunchPoints();
  loadWeather();
})();
