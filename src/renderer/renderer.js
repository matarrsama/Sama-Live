// Renderer logic for Sama Live
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

  // Default playlist options - masked when displayed
  const PLAYLISTS = {
    IPTV: {
      name: "IPTV",
      url: "https://iptv-org.github.io/iptv/index.m3u",
      masked: "****" + "*".repeat(60),
    },
    XUMO: {
      name: "XUMO",
      url: "https://www.apsattv.com/xumo.m3u",
      masked: "****" + "*".repeat(57),
    },
  };

  let actualPlaylistUrl = ""; // Store the real URL internally
  let selectedPlaylist = null; // Track which default playlist is selected

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
    isOnline: navigator.onLine,
    connectivityCheckInterval: null,
    wasPlayingBeforeOffline: false,
    volume: 0.8, // Default 80%
  };

  const video = $("#video");
  let hls = null;

  // Internet connectivity monitoring
  async function checkInternetConnectivity() {
    try {
      // Try to fetch a small, lightweight resource with short timeout
      const response = await fetch("https://www.google.com/favicon.ico", {
        method: "HEAD",
        mode: "no-cors",
        timeout: 5000,
      });
      return true;
    } catch (err) {
      return false;
    }
  }

  function startConnectivityMonitoring() {
    if (state.connectivityCheckInterval) return; // Already monitoring

    console.log("Starting connectivity monitoring");
    state.connectivityCheckInterval = setInterval(async () => {
      const isOnline = await checkInternetConnectivity();

      if (isOnline && !state.isOnline) {
        // Internet is back!
        console.log("Internet connection restored");
        state.isOnline = true;
        showMessage("✓ Internet connection restored", 2000);

        // Auto-resume playback if auto-reconnect is enabled
        if (
          state.settings.autoReconnect &&
          state.wasPlayingBeforeOffline &&
          state.current
        ) {
          console.log("Auto-resuming playback of:", state.current.name);
          showMessage("Auto-resuming playback...", 2000);
          setTimeout(() => {
            startPlayback(state.current.url);
          }, 1500);
        }
      } else if (!isOnline && state.isOnline) {
        // Internet is down
        console.log("Internet connection lost");
        state.isOnline = false;
        state.wasPlayingBeforeOffline = !video.paused;

        if (state.wasPlayingBeforeOffline) {
          showMessage(
            "⚠ Internet connection lost. Waiting for connection...",
            3000
          );
          video.pause();
          showSpinner(true);
        }
      }
    }, 5000); // Check every 5 seconds
  }

  function stopConnectivityMonitoring() {
    if (state.connectivityCheckInterval) {
      clearInterval(state.connectivityCheckInterval);
      state.connectivityCheckInterval = null;
      console.log("Stopped connectivity monitoring");
    }
  }

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

  // Store groups data for lazy rendering
  let groupsCache = {};
  let expandedGroups = new Set(); // Groups expanded due to user interaction
  let isSearchActive = false; // Track if search is currently active

  function createChannelItem(ch) {
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
    favBtn.innerHTML = state.favorites.has(ch.id) ? "✓" : "☆";
    favBtn.classList.toggle("favorited", state.favorites.has(ch.id));
    favBtn.onclick = (e) => {
      e.stopPropagation();
      toggleFavorite(ch.id, favBtn);
    };
    li.appendChild(img);
    li.appendChild(meta);
    li.appendChild(favBtn);
    li.onclick = () => selectChannel(ch);
    return li;
  }

  function renderGroupChannels(groupName, ul, channels) {
    ul.innerHTML = ""; // Clear previous
    const batchSize = 50; // Render in batches to prevent UI freeze
    let index = 0;

    const renderBatch = () => {
      const end = Math.min(index + batchSize, channels.length);
      for (let i = index; i < end; i++) {
        ul.appendChild(createChannelItem(channels[i]));
      }
      index = end;
      if (index < channels.length) {
        requestAnimationFrame(renderBatch);
      }
    };

    renderBatch();
  }

  function formatGroupName(groupName) {
    // Format group name by taking the last meaningful part
    // "Animation;Classic;Entertainment;Family" -> "Family" with "Animation > Classic > Entertainment >" tooltip
    if (!groupName || !groupName.includes(";")) {
      return groupName;
    }

    const parts = groupName.split(";").filter((p) => p.trim());
    if (parts.length === 1) {
      return parts[0];
    }

    // Return just the last category for display
    return parts[parts.length - 1];
  }

  function buildList(channels) {
    groupsCache = {};
    channels.forEach((c) => {
      const g = c.group || "Ungrouped";
      groupsCache[g] = groupsCache[g] || [];
      groupsCache[g].push(c);
    });

    const container = $("#channel-groups");
    container.innerHTML = "";

    const groupNames = Object.keys(groupsCache).sort();

    // For large lists (>1000 channels), default groups to collapsed
    const shouldCollapse = channels.length > 1000;
    const isSingleGroup = groupNames.length === 1; // Always expand single groups

    groupNames.forEach((g, index) => {
      const groupEl = document.createElement("div");
      groupEl.className = "group";
      groupEl.dataset.group = g;

      const h = document.createElement("h4");
      h.className = "group-header";

      // Collapse indicator
      // Always expand: single groups, search mode, or user-clicked, or small playlists
      const isExpanded =
        isSingleGroup || isSearchActive
          ? true
          : expandedGroups.has(g) || !shouldCollapse;
      const indicator = document.createElement("span");
      indicator.className = "collapse-indicator";
      indicator.textContent = isExpanded ? "▼" : "▶";

      const groupNameDisplay = document.createElement("span");
      groupNameDisplay.style.flex = "1";
      groupNameDisplay.style.minWidth = "0";

      const displayName = formatGroupName(g);
      groupNameDisplay.textContent = displayName;
      groupNameDisplay.title = g; // Full name in tooltip

      const countBadge = document.createElement("span");
      countBadge.className = "channel-count";
      countBadge.textContent = groupsCache[g].length;

      h.appendChild(indicator);
      h.appendChild(groupNameDisplay);
      h.appendChild(countBadge);

      const ul = document.createElement("ul");
      ul.className = "channel-list";

      // Initially render only if expanded
      if (isExpanded) {
        renderGroupChannels(g, ul, groupsCache[g]);
      } else {
        ul.classList.add("hidden");
      }

      h.onclick = (e) => {
        const isCurrentlyExpanded = !ul.classList.contains("hidden");

        if (isCurrentlyExpanded) {
          // Collapse
          ul.classList.add("hidden");
          indicator.textContent = "▶";
          expandedGroups.delete(g);
        } else {
          // Expand
          ul.classList.remove("hidden");
          indicator.textContent = "▼";
          expandedGroups.add(g);

          // Render channels only when expanding and list is empty
          if (ul.innerHTML === "") {
            renderGroupChannels(g, ul, groupsCache[g]);
          }
        }
      };

      groupEl.appendChild(h);
      groupEl.appendChild(ul);
      container.appendChild(groupEl);
    });

    console.log(
      `Rendered ${groupNames.length} groups with ${channels.length} total channels`
    );
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
    // Check if this is first run and show how-to guide
    const isFirstRun = await window.api.getFirstRun();
    if (isFirstRun) {
      $("#howToStart").classList.remove("hidden");
    }

    // Load theme preference
    const savedTheme = localStorage.getItem("sama-live_theme") || "dark";
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
    state.volume = res.volume || 0.8; // Load saved volume or default to 80%
    actualPlaylistUrl = state.playlistUrl; // Keep track of real URL internally
    (res.favorites || []).forEach((f) => state.favorites.add(f));

    // Apply saved volume to video element
    video.volume = state.volume;

    // populate settings UI - mask if it's a default playlist URL
    let isDefaultPlaylist = false;
    for (const [key, playlist] of Object.entries(PLAYLISTS)) {
      if (state.playlistUrl === playlist.url) {
        $("#playlistSelect").value = key;
        $("#playlistUrl").value = playlist.masked;
        isDefaultPlaylist = true;
        selectedPlaylist = key;
        break;
      }
    }

    if (!isDefaultPlaylist) {
      $("#playlistSelect").value = "";
      $("#playlistUrl").value = state.playlistUrl;
    }

    $("#lowBandwidth").checked = !!state.settings.lowBandwidth;
    $("#autoReconnect").checked = !!state.settings.autoReconnect;
    $("#bufferSize").value = state.settings.bufferSeconds || 20;

    // load cached playlist
    showChannelsLoading(true);
    const cached = await window.api.getCachedPlaylist();
    showChannelsLoading(false);
    if (cached) {
      state.channels = parseM3U(cached);
      buildSearchIndex(); // Build search index once for all channels
      buildList(state.channels);
      buildFavorites();
    }
  }

  function buildFavorites() {
    const el = $("#favorites-list");
    el.innerHTML = "";
    const favs = state.channels.filter((c) => state.favorites.has(c.id));

    // For large favorite lists, limit display to 20 and add "show more" option
    const displayLimit = 20;
    const showMore = favs.length > displayLimit;

    favs.slice(0, displayLimit).forEach((ch) => {
      const li = createFavoriteItem(ch);
      el.appendChild(li);
    });

    if (showMore) {
      const moreBtn = document.createElement("li");
      moreBtn.className = "channel-item";
      moreBtn.style.textAlign = "center";
      moreBtn.textContent = `+ ${favs.length - displayLimit} more`;
      moreBtn.style.cursor = "pointer";
      moreBtn.onclick = () => {
        // Show all favorites
        el.innerHTML = "";
        favs.forEach((ch) => {
          el.appendChild(createFavoriteItem(ch));
        });
      };
      el.appendChild(moreBtn);
    }
  }

  function createFavoriteItem(ch) {
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
      // Update the specific channel button instead of rebuilding entire list
      const channelBtn = $(`[data-id="${ch.id}"] .favorite-btn`);
      if (channelBtn) {
        channelBtn.innerHTML = "☆";
        channelBtn.classList.remove("favorited");
      }
    };
    li.appendChild(removeBtn);

    li.onclick = () => selectChannel(ch);
    return li;
  }

  async function toggleFavorite(id, btnEl) {
    const res = await window.api.toggleFavorite(id);
    state.favorites = new Set(res.favorites || []);
    const isFavorited = state.favorites.has(id);
    btnEl.innerHTML = isFavorited ? "✓" : "☆";
    btnEl.classList.toggle("favorited", isFavorited);
    buildFavorites();
  }

  function selectChannel(ch) {
    // Remove active class from previously selected channel
    const prevActive = document.querySelector(".channel-item.active");
    if (prevActive) {
      prevActive.classList.remove("active");
    }

    // Clear cached data from previous channel before switching
    if (state.current && state.current.id !== ch.id) {
      // Different channel selected - complete cleanup
      cleanupPlayer(); // This destroys HLS instance
      clearAllVideoListeners(); // Remove all lingering event listeners
      clearAllTimeouts(); // Clear any pending timeouts
      video.src = ""; // Clear video element source
      video.currentTime = 0; // Reset playback position
    }

    state.current = ch;
    state.retriesLeft = 3; // Reset retry counter for new channel
    $("#nowplaying").textContent = ch.name;

    // Highlight the selected channel
    const channelEl = document.querySelector(`[data-id="${ch.id}"]`);
    if (channelEl) {
      channelEl.classList.add("active");
    }

    if (state.settings.autoReconnect) {
      startConnectivityMonitoring();
    }
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

  // Track all timeouts created during playback so we can clear them
  let playbackTimeouts = [];

  function createTimeout(fn, delay) {
    const timeoutId = setTimeout(fn, delay);
    playbackTimeouts.push(timeoutId);
    return timeoutId;
  }

  function clearAllTimeouts() {
    playbackTimeouts.forEach((id) => clearTimeout(id));
    playbackTimeouts = [];
  }

  // Keep track of video event listeners for cleanup
  let videoListeners = [];

  function addVideoListener(event, handler, options = {}) {
    video.addEventListener(event, handler, options);
    videoListeners.push({ event, handler, options });
  }

  function clearAllVideoListeners() {
    videoListeners.forEach(({ event, handler, options }) => {
      video.removeEventListener(event, handler, options);
    });
    videoListeners = [];
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
    // Complete cleanup before starting new playback
    cleanupPlayer();
    clearAllVideoListeners(); // Remove all lingering event listeners
    clearAllTimeouts(); // Clear any pending timeouts

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

      // Optimize HLS config based on bandwidth settings
      const hlsConfig = {
        maxBufferLength: buffer,
        maxMaxBufferLength: buffer * 2,
        startFragPrefetch: true,
        lowLatencyMode: false, // Disable low latency for stability
        enableWorker: true,
        loader: window.Hls.DefaultConfig.loader,
      };

      // More aggressive buffering for low bandwidth mode
      if (settings.lowBandwidth) {
        hlsConfig.maxBufferLength = Math.max(buffer, 30);
        hlsConfig.maxMaxBufferLength = Math.max(buffer * 2, 60);
        hlsConfig.maxBufferHole = 0.5; // Allow smaller gaps
      }

      hls = new window.Hls(hlsConfig);
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
          // Non-fatal errors (like buffer stalls) - just log them
          console.warn("Non-fatal HLS error, continuing playback");
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
    const loadTimeout = createTimeout(() => {
      if (video.networkState === 0 || video.networkState === 3) {
        console.warn("Stream loading timeout, trying alternate method");
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

    addVideoListener(
      "canplay",
      () => {
        console.log("Video can play");
        clearTimeout(loadTimeout);
        showSpinner(false);
      },
      { once: true }
    );

    addVideoListener(
      "playing",
      () => {
        console.log("Video playing");
        clearTimeout(loadTimeout);
      },
      { once: true }
    );

    addVideoListener("error", (e) => {
      console.error("Video error event:", e.target.error);
      console.error("Video error:", e);
      clearTimeout(loadTimeout);
      handlePlaybackError(e);
    });

    addVideoListener("stalled", () => {
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
      createTimeout(() => {
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
    stopConnectivityMonitoring();
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
      localStorage.setItem("sama-live_theme", "light");
    } else {
      state.theme = "dark";
      html.classList.remove("light-mode");
      $("#themeBtn").textContent = "🌙";
      localStorage.setItem("sama-live_theme", "dark");
    }
  }

  $("#themeBtn").onclick = toggleTheme;

  // Search with debouncing for smooth performance
  let searchTimeout;
  let searchIndex = {}; // Cache for fast searching

  function buildSearchIndex() {
    searchIndex = {};
    state.channels.forEach((ch) => {
      const key = `${ch.name.toLowerCase()}|${ch.group.toLowerCase()}`;
      searchIndex[ch.id] = key;
    });
  }

  $("#search").addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    const q = e.target.value.toLowerCase().trim();

    // If search is empty, show all channels immediately
    if (!q) {
      isSearchActive = false;
      buildList(state.channels);
      return;
    }

    // Debounce filtering for non-empty searches (100ms delay)
    searchTimeout = setTimeout(() => {
      const filtered = state.channels.filter((c) =>
        searchIndex[c.id]?.includes(q)
      );

      if (filtered.length === 0) {
        $("#channel-groups").innerHTML =
          '<p style="padding: 16px; color: #999;">No channels found</p>';
        return;
      }

      // Mark search as active to show all matching groups expanded
      isSearchActive = true;
      buildList(filtered);
    }, 100);
  });

  // Refresh playlist
  $("#refreshBtn").onclick = async () => {
    // Use actualPlaylistUrl (real URL) instead of displayed value (which might be masked)
    const url = actualPlaylistUrl || state.playlistUrl;
    if (!url || url.includes("*")) {
      showMessage(
        "No valid playlist URL set. Load a URL in settings first.",
        3000
      );
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
    buildSearchIndex(); // Rebuild search index for new channels
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

  // Handle input changes - if user types, show what they typed
  $("#playlistUrl").addEventListener("input", (e) => {
    const value = e.target.value;
    let isMasked = false;

    // Check if value matches any masked URL
    for (const [key, playlist] of Object.entries(PLAYLISTS)) {
      if (value === playlist.masked) {
        isMasked = true;
        break;
      }
    }

    if (value && !isMasked) {
      // User entered their own URL, update actual URL and clear selection
      actualPlaylistUrl = value;
      selectedPlaylist = null;
      $("#playlistSelect").value = "";
    }
  });

  // Handle playlist dropdown selection
  $("#playlistSelect").onchange = () => {
    const selected = $("#playlistSelect").value;
    if (selected && PLAYLISTS[selected]) {
      selectedPlaylist = selected;
      const playlist = PLAYLISTS[selected];
      $("#playlistUrl").value = playlist.masked;
    } else {
      selectedPlaylist = null;
      $("#playlistUrl").value = "";
    }
  };

  // Handle loading selected playlist
  $("#loadSelectedPlaylist").onclick = async () => {
    if (!selectedPlaylist || !PLAYLISTS[selectedPlaylist]) {
      showMessage("⚠ Please select a playlist first", 1500);
      return;
    }
    const playlist = PLAYLISTS[selectedPlaylist];
    const newUrl = playlist.url;
    const playlistUrlChanged = newUrl !== state.playlistUrl;

    // Update actualPlaylistUrl for display
    actualPlaylistUrl = newUrl;
    $("#playlistUrl").value = playlist.masked;

    // If playlist URL changed, clear old channels and load new ones
    if (playlistUrlChanged) {
      state.channels = [];
      searchIndex = {}; // Clear search index for old channels
      isSearchActive = false;
      expandedGroups.clear();
      buildList([]);
      buildFavorites();
      // Auto-load the new playlist
      await autoLoadChannels(newUrl);
    }

    showMessage(`✓ ${playlist.name} playlist loaded`, 1500);
  };
  $("#aboutBtn").onclick = () => {
    $("#about").classList.remove("hidden");
    // Display app version
    window.electronAPI.getAppVersion().then((data) => {
      $("#appVersion").textContent = data.version;
    });
  };
  $("#closeAbout").onclick = () => $("#about").classList.add("hidden");

  // Check for updates button
  if ($("#checkUpdatesBtn")) {
    $("#checkUpdatesBtn").onclick = async () => {
      console.log("Manually checking for updates...");
      const btn = $("#checkUpdatesBtn");
      const statusEl = $("#updateStatus");
      const originalText = btn.textContent;

      btn.disabled = true;
      btn.textContent = "Checking...";
      statusEl.textContent = "Checking for updates...";

      try {
        const result = await window.electronAPI.checkForUpdates();
        console.log("Update check result:", result);

        if (result.ok) {
          if (result.updateAvailable) {
            statusEl.textContent = `✓ Update available: v${result.version}`;
            statusEl.style.color = "#4CAF50";
          } else {
            statusEl.textContent = "✓ App is up to date";
            statusEl.style.color = "#4CAF50";
          }
        } else {
          statusEl.textContent = `✗ Check failed: ${result.error}`;
          statusEl.style.color = "#f44336";
        }
      } catch (err) {
        console.error("Error checking for updates:", err);
        statusEl.textContent = `✗ Error: ${err.message}`;
        statusEl.style.color = "#f44336";
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    };
  }
  $("#saveSettings").onclick = async () => {
    console.log("Save Settings clicked!");
    const btn = $("#saveSettings");
    const originalText = btn.textContent;
    btn.textContent = "Saving...";
    btn.disabled = true;
    try {
      console.log("Gathering settings...");
      const autoReconnectEnabled = !!$("#autoReconnect").checked;
      const payload = {
        settings: {
          lowBandwidth: !!$("#lowBandwidth").checked,
          autoReconnect: autoReconnectEnabled,
          bufferSeconds: Number($("#bufferSize").value) || 20,
          limitToSD: true,
        },
        playlistUrl: actualPlaylistUrl || $("#playlistUrl").value.trim(),
      };
      console.log("Sending to main process:", payload);
      const result = await window.api.setSettings(payload);
      console.log("Got result:", result);
      if (result && result.ok) {
        state.settings = payload.settings;
        state.playlistUrl = payload.playlistUrl;

        // Stop monitoring if auto-reconnect is disabled
        if (!autoReconnectEnabled) {
          stopConnectivityMonitoring();
        }
        // Start monitoring if currently playing and auto-reconnect is enabled
        else if (state.current && !video.paused) {
          startConnectivityMonitoring();
        }

        showMessage("✓ Settings saved successfully", 2000);

        // Close settings modal
        setTimeout(() => {
          $("#settings").classList.add("hidden");
        }, 500);
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
          buildSearchIndex(); // Rebuild search index for new channels
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
    // Note: state.favorites is NOT cleared - favorite IDs are preserved
    // They will reappear when you reload the playlist
    buildFavorites();
    showMessage(
      "✓ Cache cleared (Favorites preserved - reload playlist to restore)",
      3000
    );
  };

  // Load Playlist button - loads the playlist from the URL

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

  // How to Get Started
  $("#startWatching").onclick = async () => {
    $("#howToStart").classList.add("hidden");
    await window.api.markFirstRunComplete();
  };

  // Disclaimer
  window.api.on("show-disclaimer", () =>
    $("#disclaimer").classList.remove("hidden")
  );
  $("#dismissDisclaimer").onclick = () =>
    $("#disclaimer").classList.add("hidden");

  // Volume persistence
  video.addEventListener("volumechange", async () => {
    state.volume = video.volume;
    await window.api.setVolume(video.volume);
  });

  // load
  loadInitialData();
})();
