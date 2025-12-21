// Renderer logic for Streamio
(function () {
  // Simple M3U parser (same as main parser logic)
  function parseM3U(text) {
    if (!text) return [];
    const lines = text.split(/\r?\n/).map((l) => l.trim());
    const items = [];
    let lastExtinf = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      if (line.startsWith("#EXTINF")) {
        lastExtinf = line;
        continue;
      }
      if (line.startsWith("#")) continue;
      const url = line;
      let name = "";
      let group = "";
      let logo = "";
      if (lastExtinf) {
        const after = lastExtinf.split(":").slice(1).join(":");
        const parts = after.split(",");
        const attrs = {};
        const attrRegex = /([A-Za-z0-9\-]+)="([^"]*)"/g;
        let m;
        while ((m = attrRegex.exec(parts[0] || "")) !== null)
          attrs[m[1]] = m[2];
        name = (parts.slice(1).join(",") || attrs["tvg-name"] || "").trim();
        logo = attrs["tvg-logo"] || "";
        group = attrs["group-title"] || "";
      }
      const id = `${name || url}__${items.length}`;
      items.push({
        id,
        name: name || url,
        group,
        logo,
        url,
        rawLine: lastExtinf || "",
      });
      lastExtinf = null;
    }
    return items;
  }

  // UI helpers
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const state = {
    channels: [],
    favorites: new Set(),
    settings: {
      lowBandwidth: true,
      autoReconnect: false,
      bufferSeconds: 20,
      limitToSD: true,
    },
    playlistUrl: "",
    failureCounts: {},
    current: null,
    retriesLeft: 3,
    qualityPreference: "auto",
    availableQualities: [],
    theme: "dark",
  };

  const video = $("#video");
  let hls = null;

  function showSpinner(show) {
    const el = $("#overlay-spinner");
    el.classList.toggle("hidden", !show);
  }

  function showMessage(text, timeout = 4000) {
    const el = $("#player-message");
    el.textContent = text;
    el.style.display = text ? "block" : "none";
    if (text && timeout) setTimeout(() => (el.style.display = "none"), timeout);
  }

  function showChannelsLoading(show) {
    const el = $("#channels-loading");
    el.classList.toggle("hidden", !show);
  }

  function buildList(channels) {
    const groups = {};
    channels.forEach((c) => {
      const g = c.group || "Ungrouped";
      groups[g] = groups[g] || [];
      groups[g].push(c);
    });

    const container = $("#channel-groups");
    container.innerHTML = "";
    Object.keys(groups)
      .sort()
      .forEach((g) => {
        const groupEl = document.createElement("div");
        groupEl.className = "group";
        const h = document.createElement("h4");
        h.textContent = g;
        groupEl.appendChild(h);
        const ul = document.createElement("ul");
        ul.className = "channel-list";
        groups[g].forEach((ch) => {
          const li = document.createElement("li");
          li.className = "channel-item";
          li.dataset.id = ch.id;
          const img = document.createElement("img");
          img.src = ch.logo || "";
          img.alt = "";
          img.onerror = () => (img.style.display = "none");
          const meta = document.createElement("div");
          meta.className = "meta";
          meta.innerHTML = `<div class="name">${escapeHtml(ch.name)}</div>`;
          const favBtn = document.createElement("button");
          favBtn.className = "favorite-btn";
          favBtn.innerHTML = state.favorites.has(ch.id) ? "★" : "☆";
          favBtn.onclick = (e) => {
            e.stopPropagation();
            toggleFavorite(ch.id, favBtn);
          };
          li.appendChild(img);
          li.appendChild(meta);
          li.appendChild(favBtn);
          li.onclick = () => selectChannel(ch);
          ul.appendChild(li);
        });
        groupEl.appendChild(ul);
        container.appendChild(groupEl);
      });
  }

  function escapeHtml(s) {
    return s.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[c])
    );
  }

  async function loadInitialData() {
    // Load theme preference
    const savedTheme = localStorage.getItem("streamio_theme") || "dark";
    state.theme = savedTheme;
    if (savedTheme === "light") {
      document.documentElement.classList.add("light-mode");
      $("#themeBtn").textContent = "☀️";
    } else {
      document.documentElement.classList.remove("light-mode");
      $("#themeBtn").textContent = "🌙";
    }

    const res = await window.api.getSettings();
    state.settings = res.settings || state.settings;
    state.playlistUrl = res.playlistUrl || "";
    (res.favorites || []).forEach((f) => state.favorites.add(f));

    // populate settings UI
    $("#playlistUrl").value = state.playlistUrl;
    $("#lowBandwidth").checked = !!state.settings.lowBandwidth;
    $("#autoReconnect").checked = !!state.settings.autoReconnect;
    $("#bufferSize").value = state.settings.bufferSeconds || 20;

    // load cached playlist
    showChannelsLoading(true);
    const cached = await window.api.getCachedPlaylist();
    showChannelsLoading(false);
    if (cached) {
      state.channels = parseM3U(cached);
      buildList(state.channels);
      buildFavorites();
    }
  }

  function buildFavorites() {
    const el = $("#favorites-list");
    el.innerHTML = "";
    const favs = state.channels.filter((c) => state.favorites.has(c.id));
    favs.forEach((ch) => {
      const li = document.createElement("li");
      li.className = "channel-item";
      li.style.cursor = "pointer";
      li.style.position = "relative";
      li.textContent = ch.name + " ";

      // Add remove button (X)
      const removeBtn = document.createElement("button");
      removeBtn.textContent = "✕";
      removeBtn.style.position = "absolute";
      removeBtn.style.right = "8px";
      removeBtn.style.top = "50%";
      removeBtn.style.transform = "translateY(-50%)";
      removeBtn.style.background = "none";
      removeBtn.style.border = "none";
      removeBtn.style.color = "#ff6b6b";
      removeBtn.style.cursor = "pointer";
      removeBtn.style.fontSize = "16px";
      removeBtn.style.padding = "0 4px";
      removeBtn.onclick = async (e) => {
        e.stopPropagation();
        await window.api.toggleFavorite(ch.id);
        state.favorites.delete(ch.id);
        buildFavorites();
      };
      li.appendChild(removeBtn);

      li.onclick = () => selectChannel(ch);
      el.appendChild(li);
    });
  }

  async function toggleFavorite(id, btnEl) {
    const res = await window.api.toggleFavorite(id);
    state.favorites = new Set(res.favorites || []);
    btnEl.innerHTML = state.favorites.has(id) ? "★" : "☆";
    buildFavorites();
  }

  function selectChannel(ch) {
    state.current = ch;
    $("#nowplaying").textContent = ch.name;
    startPlayback(ch.url);
  }

  function cleanupPlayer() {
    if (hls) {
      hls.destroy();
      hls = null;
    }
    video.pause();
    video.src = "";
  }

  function applyQualityPreference(url) {
    if (state.qualityPreference === "auto") return url;

    const qualityMap = {
      "1080p": ["1080p", "1080", "full", "hd"],
      "720p": ["720p", "720", "hd"],
      "480p": ["480p", "480", "sd"],
      "360p": ["360p", "360", "low"],
    };

    const targets = qualityMap[state.qualityPreference] || [];
    for (const target of targets) {
      if (url.includes(target)) return url;
      const replaced = url.replace(/(hd|sd|720|1080|480|360)/i, target);
      if (replaced !== url) return replaced;
    }
    return url;
  }

  function detectAndApplyQuality(hlsInstance) {
    try {
      const levels = hlsInstance.levels || [];
      state.availableQualities = [];
      const seen = new Set();

      levels.forEach((level) => {
        const height = level.height;
        let quality = "480p";
        if (height >= 1080) quality = "1080p";
        else if (height >= 720) quality = "720p";
        else if (height >= 480) quality = "480p";
        else if (height >= 360) quality = "360p";

        if (!seen.has(quality)) {
          seen.add(quality);
          state.availableQualities.push({
            quality,
            level: levels.indexOf(level),
            height,
          });
        }
      });

      if (state.availableQualities.length > 0) {
        state.availableQualities.sort((a, b) => b.height - a.height);
        if (state.qualityPreference !== "auto") {
          const target = state.availableQualities.find(
            (q) => q.quality === state.qualityPreference
          );
          if (target) {
            hlsInstance.currentLevel = target.level;
          }
        }
      }
    } catch (e) {
      console.log("Could not detect HLS levels", e);
    }
  }

  function startPlayback(url) {
    cleanupPlayer();
    showSpinner(true);
    showMessage("");
    state.retriesLeft = 3;
    attemptLoad(url);
  }

  function attemptLoad(url) {
    const settings = state.settings;
    const buffer = settings.bufferSeconds || 20;

    console.log("Attempting to load:", url);

    // Apply quality preference first
    url = applyQualityPreference(url);

    // prefer SD when low bandwidth mode enabled and quality is auto
    if (
      (settings.lowBandwidth || settings.limitToSD) &&
      state.qualityPreference === "auto"
    ) {
      // try common patterns
      url = url.replace(/(\/|\-)?(hd|720p|1080p)/i, (m) =>
        m.toLowerCase().includes("hd")
          ? m.replace(/hd/i, "sd")
          : m.replace(/720p|1080p/, "480p")
      );
    }

    // Try HLS.js first for HLS streams
    if (url.includes(".m3u8") && window.Hls && window.Hls.isSupported()) {
      console.log("Using HLS.js for:", url);
      hls = new window.Hls({
        maxBufferLength: buffer,
        maxMaxBufferLength: buffer * 2,
        startFragPrefetch: true,
        lowLatencyMode: true,
        loader: window.Hls.DefaultConfig.loader,
      });
      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        console.log("HLS manifest parsed");
        detectAndApplyQuality(hls);
        showSpinner(false);
        video.play().catch((err) => console.error("Play error:", err));
      });

      hls.on(window.Hls.Events.ERROR, (event, data) => {
        console.error("HLS error", data);
        // Try native playback as fallback
        if (data.fatal) {
          console.log("HLS fatal error, trying native playback");
          tryNativePlayback(url);
        } else {
          handlePlaybackError(data);
        }
      });
    } else {
      // For non-HLS streams (MPEG-TS, HTTP streams, etc.), use native playback
      console.log("Using native playback for:", url);
      tryNativePlayback(url);
    }
  }

  function tryNativePlayback(url) {
    console.log("Starting native playback:", url);
    cleanupPlayer();
    video.src = url;

    // Set timeout to detect if stream doesn't load
    const loadTimeout = setTimeout(() => {
      if (video.networkState === 0 || video.networkState === 3) {
        console.warn("Stream loading timeout, trying alternate method");
        clearTimeout(loadTimeout);
        handlePlaybackError({ message: "Stream load timeout" });
      }
    }, 8000);

    const playPromise = video.play();
    showSpinner(false);

    if (playPromise !== undefined) {
      playPromise.catch((error) => {
        console.error("Playback error:", error);
        clearTimeout(loadTimeout);
        handlePlaybackError(error);
      });
    }

    video.addEventListener(
      "canplay",
      () => {
        console.log("Video can play");
        clearTimeout(loadTimeout);
        showSpinner(false);
      },
      { once: true }
    );

    video.addEventListener(
      "playing",
      () => {
        console.log("Video playing");
        clearTimeout(loadTimeout);
      },
      { once: true }
    );

    video.addEventListener("error", (e) => {
      console.error("Video error event:", e.target.error);
      console.error("Video error:", e);
      handlePlaybackError(e);
    });

    video.addEventListener("stalled", () => {
      showMessage("Buffering...", 2000);
    });
  }

  function handlePlaybackError(data) {
    showSpinner(false);
    state.retriesLeft = (state.retriesLeft || 3) - 1;
    if (state.retriesLeft > 0 && state.settings.autoReconnect) {
      showMessage(
        `Playback failed, retrying (${3 - state.retriesLeft + 1})...`
      );
      setTimeout(() => {
        showSpinner(true);
        attemptLoad(state.current.url);
      }, 1500);
    } else {
      // mark failure
      const id = state.current && state.current.id;
      if (id) {
        state.failureCounts[id] = (state.failureCounts[id] || 0) + 1;
        if (state.failureCounts[id] >= 3) {
          showMessage("Channel appears to be dead. Skipping.", 5000);
        } else {
          showMessage(
            "Playback failed. Check network or try another channel.",
            5000
          );
        }
      }
    }
  }

  // Controls
  $("#playBtn").onclick = () => {
    if (video.paused) video.play();
  };
  $("#pauseBtn").onclick = () => {
    if (!video.paused) video.pause();
  };
  $("#stopBtn").onclick = () => {
    cleanupPlayer();
    showSpinner(false);
    showMessage("Stopped");
  };

  // Quality selector
  $("#qualitySelect").onchange = (e) => {
    state.qualityPreference = e.target.value;
    if (state.current) {
      showMessage(`Quality set to ${e.target.value}`, 1500);
      startPlayback(state.current.url);
    }
  };

  // Theme toggle
  function toggleTheme() {
    const html = document.documentElement;
    if (state.theme === "dark") {
      state.theme = "light";
      html.classList.add("light-mode");
      $("#themeBtn").textContent = "☀️";
      localStorage.setItem("streamio_theme", "light");
    } else {
      state.theme = "dark";
      html.classList.remove("light-mode");
      $("#themeBtn").textContent = "🌙";
      localStorage.setItem("streamio_theme", "dark");
    }
  }

  $("#themeBtn").onclick = toggleTheme;

  // Search with debouncing for smooth performance
  let searchTimeout;
  $("#search").addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    const q = e.target.value.toLowerCase().trim();

    // If search is empty, show all channels immediately
    if (!q) {
      buildList(state.channels);
      return;
    }

    // Debounce filtering for non-empty searches (150ms delay)
    searchTimeout = setTimeout(() => {
      const filtered = state.channels.filter(
        (c) =>
          c.name.toLowerCase().includes(q) || c.group.toLowerCase().includes(q)
      );
      buildList(filtered);
    }, 150);
  });

  // Refresh playlist
  $("#refreshBtn").onclick = async () => {
    const url = $("#playlistUrl").value || state.playlistUrl;
    if (!url) {
      showMessage("No playlist URL set in settings", 3000);
      return;
    }
    const btn = $("#refreshBtn");
    btn.disabled = true;
    btn.textContent = "Loading...";
    const originalText = "Refresh";

    showChannelsLoading(true);
    const res = await window.api.fetchPlaylist(url);
    showChannelsLoading(false);

    btn.disabled = false;
    btn.textContent = originalText;

    if (!res.ok) {
      showMessage("Failed to fetch playlist: " + res.error, 4000);
      return;
    }
    state.channels = parseM3U(res.text);
    await window.api.saveCachedPlaylist(res.text);
    buildList(state.channels);
    buildFavorites();
    showMessage(`Playlist refreshed - ${state.channels.length} channels`, 2000);
  };

  // Settings modal
  $("#settingsBtn").onclick = () => {
    $("#settings").classList.remove("hidden");
    $("#playlistUrl").focus();
  };
  $("#closeSettings").onclick = () => $("#settings").classList.add("hidden");
  $("#loadDefaultUrl").onclick = () => {
    $("#playlistUrl").value = "https://iptv-org.github.io/iptv/index.m3u";
    showMessage("✓ Default URL loaded", 1500);
  };
  $("#aboutBtn").onclick = () => {
    $("#about").classList.remove("hidden");
  };
  $("#closeAbout").onclick = () => $("#about").classList.add("hidden");
  $("#saveSettings").onclick = async () => {
    console.log("Save Settings clicked!");
    const btn = $("#saveSettings");
    const originalText = btn.textContent;
    btn.textContent = "Saving...";
    btn.disabled = true;
    try {
      console.log("Gathering settings...");
      const payload = {
        settings: {
          lowBandwidth: !!$("#lowBandwidth").checked,
          autoReconnect: !!$("#autoReconnect").checked,
          bufferSeconds: Number($("#bufferSize").value) || 20,
          limitToSD: true,
        },
        playlistUrl: $("#playlistUrl").value.trim(),
      };
      console.log("Sending to main process:", payload);
      const result = await window.api.setSettings(payload);
      console.log("Got result:", result);
      if (result && result.ok) {
        state.settings = payload.settings;
        state.playlistUrl = payload.playlistUrl;
        showMessage("✓ Settings saved successfully", 2000);

        // Close settings modal
        setTimeout(() => {
          $("#settings").classList.add("hidden");
        }, 500);

        // Auto-load channels if URL exists
        if (payload.playlistUrl) {
          console.log("Auto-loading channels from:", payload.playlistUrl);
          setTimeout(() => {
            autoLoadChannels(payload.playlistUrl);
          }, 600);
        }
      } else {
        showMessage("✗ Failed to save settings", 3000);
      }
    } catch (err) {
      console.error("Save error:", err);
      showMessage("✗ Error: " + (err.message || "Save failed"), 3000);
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  };

  async function autoLoadChannels(url, retries = 3) {
    showChannelsLoading(true);
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`Fetching channels (attempt ${attempt}/${retries})...`);
        const res = await window.api.fetchPlaylist(url);
        showChannelsLoading(false);

        if (res.ok) {
          state.channels = parseM3U(res.text);
          await window.api.saveCachedPlaylist(res.text);
          buildList(state.channels);
          buildFavorites();
          showMessage(`✓ Loaded ${state.channels.length} channels`, 2000);
          return;
        } else {
          if (attempt < retries) {
            console.log(`Fetch failed, retrying... (${attempt}/${retries})`);
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
      } catch (err) {
        console.error(`Error fetching channels (attempt ${attempt}):`, err);
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }

    showChannelsLoading(false);
    showMessage(
      "✗ Failed to load channels after " + retries + " attempts",
      3000
    );
  }

  $("#clearCache").onclick = async () => {
    await window.api.clearCache();
    state.channels = [];
    buildList([]);
    buildFavorites();
    showMessage("Cache cleared", 1600);
  };

  $("#importFile").onclick = async () => {
    console.log("Import File clicked!");
    const path = await window.api.chooseFileForPlaylist();
    console.log("Selected file path:", path);
    if (!path) return;
    showSpinner(true);
    showMessage("Loading playlist file...");
    try {
      const res = await window.api.readLocalFile(path);
      showSpinner(false);
      if (res && res.ok) {
        state.channels = parseM3U(res.text);
        await window.api.saveCachedPlaylist(res.text);
        buildList(state.channels);
        buildFavorites();
        showMessage(`✓ Imported ${state.channels.length} channels`, 3000);
      } else {
        showMessage("✗ Failed to read file: " + (res && res.error), 3000);
      }
    } catch (e) {
      showSpinner(false);
      showMessage("✗ Error importing file: " + e.message, 3000);
    }
  };

  // Disclaimer
  window.api.on("show-disclaimer", () =>
    $("#disclaimer").classList.remove("hidden")
  );
  $("#dismissDisclaimer").onclick = () =>
    $("#disclaimer").classList.add("hidden");

  // load
  loadInitialData();
})();
