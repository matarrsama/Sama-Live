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

  const DEFAULT_VIRTUALIZE_THRESHOLD = 1500;
  const VIRTUALIZE_THRESHOLD = Math.max(
    0,
    Number(localStorage.getItem("sama-live_virtual_threshold")) ||
      DEFAULT_VIRTUALIZE_THRESHOLD
  );
  const VIRTUAL_ITEM_HEIGHT = 48;
  const VIRTUAL_OVERSCAN = 8;
  const TRANSPARENT_PIXEL =
    "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

  const logoUrlToCachedUrl = new Map();
  let logoObserver = null;
  let virtualCleanupFns = [];

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
  let actualPlaylistUrl2 = ""; // Optional second URL
  let selectedPlaylist = null; // Track which default playlist is selected
  let selectedPlaylist2 = null; // Track which default playlist is selected for URL2

  const state = {
    channels: [],
    channels1: [],
    channels2: [],
    favorites: new Set(),
    favoriteOrder: [], // Track order of added favorites (newest first)
    settings: {
      lowBandwidth: true,
      autoReconnect: false,
      bufferSeconds: 20,
      limitToSD: true,
    },
    playlistUrl: "",
    playlistUrl2: "",
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

  // Enhanced Internet connectivity monitoring with multiple endpoints
  const connectivityEndpoints = [
    "https://www.google.com/favicon.ico",
    "https://www.cloudflare.com/favicon.ico",
    "https://www.github.com/favicon.ico",
    "https://httpbin.org/get"
  ];

  async function checkInternetConnectivity() {
    const timeout = 3000; // Reduced timeout for faster detection
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // Try multiple endpoints with Promise.any for faster success detection
      const promises = connectivityEndpoints.map(async (endpoint) => {
        try {
          const response = await fetch(endpoint, {
            method: "HEAD",
            mode: "no-cors",
            signal: controller.signal,
            cache: "no-cache"
          });
          return true;
        } catch (err) {
          return false;
        }
      });

      const result = await Promise.any(promises);
      clearTimeout(timeoutId);
      return result;
    } catch (err) {
      clearTimeout(timeoutId);
      return false;
    }
  }

  // Network quality monitoring
  let networkQualityCheck = null;
  let lastNetworkSpeed = null;

  async function measureNetworkQuality() {
    if (!state.current) return null;

    try {
      const startTime = performance.now();
      const response = await fetch(state.current.url, {
        method: "HEAD",
        cache: "no-cache"
      });
      const endTime = performance.now();
      const responseTime = endTime - startTime;

      // Simple quality assessment based on response time
      let quality = "good";
      if (responseTime > 2000) quality = "poor";
      else if (responseTime > 1000) quality = "fair";

      lastNetworkSpeed = { responseTime, quality };
      console.log(`Network quality: ${quality} (${responseTime.toFixed(0)}ms)`);
      return lastNetworkSpeed;
    } catch (err) {
      lastNetworkSpeed = { responseTime: 9999, quality: "poor" };
      return lastNetworkSpeed;
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

        // Measure network quality after reconnection
        await measureNetworkQuality();

        // Auto-resume playback if auto-reconnect is enabled
        if (
          state.settings.autoReconnect &&
          state.wasPlayingBeforeOffline &&
          state.current
        ) {
          console.log("Auto-resuming playback after reconnection");
          showMessage("Resuming playback...", 1500);
          // Reset retry count for fresh start
          state.retryCount = 0;
          state.retriesLeft = 3;
          startPlayback(state.current.url);
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
        }
      }

      // Periodic network quality check during playback
      if (isOnline && state.current && !video.paused && Math.random() < 0.2) {
        // 20% chance each check to avoid too frequent measurements
        await measureNetworkQuality();
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

  let bufferingInterval = null;
  let bufferingStartTs = 0;
  let bufferingStartAhead = 0;

  function clearBufferingIndicator() {
    if (bufferingInterval) {
      clearInterval(bufferingInterval);
      bufferingInterval = null;
    }
    const container = $("#buffering-indicator");
    if (container) container.classList.add("hidden");
    const fill = $("#buffering-progress-fill");
    if (fill) fill.style.width = "0%";
    const subtitle = $("#buffering-subtitle");
    if (subtitle) subtitle.textContent = "";
  }

  function getBufferedAheadSeconds() {
    try {
      const t = video.currentTime;
      const ranges = video.buffered;
      if (!ranges || ranges.length === 0 || !isFinite(t)) return 0;
      for (let i = 0; i < ranges.length; i++) {
        const start = ranges.start(i);
        const end = ranges.end(i);
        if (t >= start && t <= end) {
          return Math.max(0, end - t);
        }
      }
      return 0;
    } catch {
      return 0;
    }
  }

  function estimateSecondsRemaining(targetAhead, currentAhead) {
    const remaining = Math.max(0, targetAhead - currentAhead);
    if (remaining <= 0) return 0;

    const elapsed = (Date.now() - bufferingStartTs) / 1000;
    const gained = Math.max(0, currentAhead - bufferingStartAhead);
    if (elapsed >= 0.75 && gained > 0.25) {
      const rate = gained / elapsed;
      if (rate > 0) return Math.max(0, remaining / rate);
    }
    return remaining;
  }

  function showBufferingIndicator(reason = "Buffering") {
    const container = $("#buffering-indicator");
    if (!container) return;

    container.classList.remove("hidden");
    const title = $("#buffering-title");
    if (title) title.textContent = `${reason}…`;

    if (!bufferingInterval) {
      bufferingStartTs = Date.now();
      bufferingStartAhead = getBufferedAheadSeconds();
      bufferingInterval = setInterval(() => {
        const target = Number(state.settings.bufferSeconds) || 20;
        const ahead = getBufferedAheadSeconds();
        const remaining = estimateSecondsRemaining(target, ahead);

        const subtitle = $("#buffering-subtitle");
        if (subtitle) {
          subtitle.textContent = `${ahead.toFixed(1)}s buffered • ~${Math.ceil(
            remaining
          )}s remaining`;
        }

        const fill = $("#buffering-progress-fill");
        if (fill) {
          const pct = target > 0 ? Math.max(0, Math.min(1, ahead / target)) : 0;
          fill.style.width = `${Math.round(pct * 100)}%`;
        }

        if (!video.paused && !video.ended && ahead >= target && video.readyState >= 3) {
          clearBufferingIndicator();
        }
      }, 200);
    }
  }

  function hideBufferingIndicator() {
    clearBufferingIndicator();
  }

  function attachBufferingVideoListeners() {
    addVideoListener("waiting", () => {
      showBufferingIndicator("Buffering");
    });

    addVideoListener("stalled", () => {
      showBufferingIndicator("Buffering");
    });

    addVideoListener(
      "canplay",
      () => {
        hideBufferingIndicator();
      },
      { once: true }
    );

    addVideoListener(
      "playing",
      () => {
        hideBufferingIndicator();
      },
      { once: true }
    );

    addVideoListener("seeking", () => {
      showBufferingIndicator("Seeking");
    });
  }

  function showMessage(text, timeout = 4000) {
    const el = $("#player-message");
    el.textContent = text;
    
    // Clear any existing timeouts
    if (window.messageTimeout) {
      clearTimeout(window.messageTimeout);
      window.messageTimeout = null;
    }
    
    if (text) {
      // Force reflow to ensure the transition works
      void el.offsetHeight;
      
      // Add show class to make message visible
      el.classList.add('show');
      
      // Set timeout to hide message
      if (timeout) {
        window.messageTimeout = setTimeout(() => {
          el.classList.remove('show');
          // Remove text after transition completes
          setTimeout(() => {
            el.textContent = '';
          }, 300); // Match this with CSS transition duration
        }, timeout);
      }
    } else {
      // If no text, hide the message
      el.classList.remove('show');
      // Remove text after transition completes
      setTimeout(() => {
        el.textContent = '';
      }, 300);
    }
  }

  function showChannelsLoading(show) {
    const el = $("#channels-loading");
    el.classList.toggle("hidden", !show);
  }

  // Store groups data for lazy rendering
  let groupsCache = {};
  let expandedGroups = new Set(); // Groups expanded due to user interaction
  let expandedGroupsOrderBySection = {}; // Track order of expanded groups per section
  let isSearchActive = false; // Track if search is currently active

  let playlist1Collapsed =
    localStorage.getItem("sama-live_playlist1_collapsed") === "true";
  let playlist2Collapsed =
    localStorage.getItem("sama-live_playlist2_collapsed") === "true";

  function cleanupVirtualLists() {
    if (!virtualCleanupFns.length) return;
    virtualCleanupFns.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.warn("Virtual list cleanup failed", e);
      }
    });
    virtualCleanupFns = [];
  }

  function getLogoObserver() {
    if (logoObserver) return logoObserver;
    const root = $("#sidebar") || null;
    logoObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const img = entry.target;
          logoObserver.unobserve(img);
          const url = img.dataset.logoUrl;
          if (url) loadLogoIntoImg(img, url);
        }
      },
      {
        root,
        rootMargin: "400px 0px",
        threshold: 0.01,
      }
    );
    return logoObserver;
  }

  async function resolveLogoUrl(logoUrl) {
    if (!logoUrl) return "";
    if (logoUrl.startsWith("data:")) return logoUrl;

    if (logoUrlToCachedUrl.has(logoUrl)) {
      return await logoUrlToCachedUrl.get(logoUrl);
    }

    const p = (async () => {
      try {
        if (window.api && typeof window.api.getCachedLogo === "function") {
          const res = await window.api.getCachedLogo(logoUrl);
          if (res && res.ok && res.url) return res.url;
        }
      } catch (e) {
        return logoUrl;
      }
      return logoUrl;
    })();

    logoUrlToCachedUrl.set(logoUrl, p);
    return await p;
  }

  async function loadLogoIntoImg(img, logoUrl) {
    try {
      const resolved = await resolveLogoUrl(logoUrl);
      if (img.dataset.logoUrl !== logoUrl) return;
      img.src = resolved || "";
    } catch (e) {
      if (img.dataset.logoUrl === logoUrl) img.src = logoUrl;
    }
  }

  function setupLazyLogo(img, logoUrl) {
    img.dataset.logoUrl = logoUrl || "";
    img.decoding = "async";
    img.loading = "lazy";
    img.src = TRANSPARENT_PIXEL;
    img.alt = "";
    img.onerror = () => (img.style.display = "none");
    if (!logoUrl) {
      img.style.display = "none";
      return;
    }
    try {
      getLogoObserver().observe(img);
    } catch {
      loadLogoIntoImg(img, logoUrl);
    }
  }

  function createChannelItem(ch) {
    const li = document.createElement("li");
    li.className = "channel-item";
    li.dataset.id = ch.id;
    const img = document.createElement("img");
    setupLazyLogo(img, ch.logo || "");
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
    ul.innerHTML = "";
    ul.classList.remove("virtual-list");
    ul.style.height = "";
    ul.style.position = "";
    ul.style.paddingTop = "";
    ul.style.paddingBottom = "";
    if (ul.__virtualCleanup) {
      try {
        ul.__virtualCleanup();
      } catch (e) {
        console.warn("Virtual cleanup failed", e);
      }
      ul.__virtualCleanup = null;
    }

    if (channels.length >= VIRTUALIZE_THRESHOLD) {
      renderVirtualGroupChannels(groupName, ul, channels);
      return;
    }

    const batchSize = 50;
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

  function renderVirtualGroupChannels(groupName, ul, channels) {
    const sidebar = $("#sidebar-scroll") || $("#sidebar");
    if (!sidebar) {
      for (let i = 0; i < channels.length; i++) {
        ul.appendChild(createChannelItem(channels[i]));
      }
      return;
    }

    const getOffsetTopWithin = (el, ancestor) => {
      let top = 0;
      let node = el;
      while (node && node !== ancestor && node instanceof HTMLElement) {
        top += node.offsetTop || 0;
        node = node.offsetParent;
      }
      return top;
    };

    ul.classList.add("virtual-list");
    ul.style.position = "relative";
    ul.style.height = `${channels.length * VIRTUAL_ITEM_HEIGHT}px`;

    let rafScheduled = false;
    let lastRangeKey = "";

    let ulTopInSidebar = getOffsetTopWithin(ul, sidebar);

    const computeRange = () => {
      const viewTop = sidebar.scrollTop;
      const viewBottom = sidebar.scrollTop + sidebar.clientHeight;
      const start = Math.max(
        0,
        Math.floor((viewTop - ulTopInSidebar) / VIRTUAL_ITEM_HEIGHT) -
          VIRTUAL_OVERSCAN
      );
      const end = Math.min(
        channels.length,
        Math.ceil((viewBottom - ulTopInSidebar) / VIRTUAL_ITEM_HEIGHT) +
          VIRTUAL_OVERSCAN
      );
      return { start, end };
    };

    const render = () => {
      rafScheduled = false;
      const { start, end } = computeRange();
      const rangeKey = `${start}:${end}`;
      if (rangeKey === lastRangeKey) return;
      lastRangeKey = rangeKey;

      ul.innerHTML = "";
      const frag = document.createDocumentFragment();
      for (let i = start; i < end; i++) {
        const li = createChannelItem(channels[i]);
        li.style.position = "absolute";
        li.style.top = `${i * VIRTUAL_ITEM_HEIGHT}px`;
        li.style.left = "0";
        li.style.right = "0";
        frag.appendChild(li);
      }
      ul.appendChild(frag);
    };

    const onScrollOrResize = () => {
      if (rafScheduled) return;
      rafScheduled = true;
      requestAnimationFrame(render);
    };

    sidebar.addEventListener("scroll", onScrollOrResize, { passive: true });
    const onResize = () => {
      ulTopInSidebar = getOffsetTopWithin(ul, sidebar);
      onScrollOrResize();
    };
    window.addEventListener("resize", onResize);
    ul.__virtualCleanup = () => {
      sidebar.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onResize);
    };
    virtualCleanupFns.push(ul.__virtualCleanup);
    render();
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
    cleanupVirtualLists();
    const container = $("#channel-groups");
    container.innerHTML = "";

    // In search mode, keep the original single combined list behavior
    if (isSearchActive) {
      renderGroupsInto(channels, container, "search");
      return;
    }

    const section1 = createPlaylistSection(
      "Playlist 1",
      "playlist1",
      playlist1Collapsed,
      (collapsed) => {
        playlist1Collapsed = collapsed;
        localStorage.setItem(
          "sama-live_playlist1_collapsed",
          String(collapsed)
        );
      },
      async () => {
        await confirmDeletePlaylist(1);
      }
    );

    container.appendChild(section1.root);
    renderGroupsInto(state.channels1 || [], section1.body, "p1");

    const has2 = (state.channels2 || []).length > 0;
    if (has2) {
      const divider = document.createElement("div");
      divider.className = "playlist-divider";
      container.appendChild(divider);

      const section2 = createPlaylistSection(
        "Playlist 2",
        "playlist2",
        playlist2Collapsed,
        (collapsed) => {
          playlist2Collapsed = collapsed;
          localStorage.setItem(
            "sama-live_playlist2_collapsed",
            String(collapsed)
          );
        },
        async () => {
          await confirmDeletePlaylist(2);
        }
      );

      container.appendChild(section2.root);
      renderGroupsInto(state.channels2 || [], section2.body, "p2");
    }
  }

  function createPlaylistSection(title, key, collapsed, onToggle, onDelete) {
    const root = document.createElement("div");
    root.className = "playlist-section";
    root.dataset.section = key;

    const header = document.createElement("div");
    header.className = "playlist-section-header";

    const indicator = document.createElement("span");
    indicator.className = "collapse-indicator";
    indicator.textContent = collapsed ? "▶" : "▼";

    const label = document.createElement("span");
    label.className = "playlist-section-title";
    label.textContent = title;

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "playlist-delete-btn";
    deleteBtn.type = "button";
    deleteBtn.title = `Delete ${title}`;
    deleteBtn.setAttribute("aria-label", `Delete ${title}`);
    deleteBtn.textContent = "🗑";
    deleteBtn.onclick = async (e) => {
      e.stopPropagation();
      if (typeof onDelete === "function") await onDelete();
    };

    header.appendChild(indicator);
    header.appendChild(label);
    header.appendChild(deleteBtn);

    const body = document.createElement("div");
    body.className = "playlist-section-body";
    if (collapsed) body.classList.add("hidden");

    header.onclick = () => {
      const isOpen = !body.classList.contains("hidden");
      if (isOpen) {
        body.classList.add("hidden");
        indicator.textContent = "▶";
        onToggle(true);
      } else {
        body.classList.remove("hidden");
        indicator.textContent = "▼";
        onToggle(false);
      }
    };

    root.appendChild(header);
    root.appendChild(body);
    return { root, body };
  }

  async function confirmDeletePlaylist(which) {
    const title = which === 1 ? "Playlist 1" : "Playlist 2";
    showConfirmation(
      `Delete ${title}? This will remove its URL and clear its cached channels.`,
      async () => {
        await deletePlaylist(which);
        showMessage(`✓ ${title} deleted`, 2000);
      }
    );
  }

  async function deletePlaylist(which) {
    const url1 = actualPlaylistUrl || state.playlistUrl || "";
    const url2 = actualPlaylistUrl2 || state.playlistUrl2 || "";

    if (which === 2) {
      // Clear playlist 2 settings + caches
      actualPlaylistUrl2 = "";
      state.playlistUrl2 = "";
      selectedPlaylist2 = null;
      const url2El = $("#playlistUrl2");
      if (url2El) url2El.value = "";
      const sel2 = $("#playlistSelect2");
      if (sel2) sel2.value = "";

      if (window.api.saveCachedPlaylist2) await window.api.saveCachedPlaylist2("");
      if (window.api.saveCachedPlaylist) {
        // keep playlist1 cache as merged single
        const merged = (await window.api.getCachedPlaylist1?.()) || "";
        await window.api.saveCachedPlaylist(merged);
      }

      // Remove favorites that belonged to playlist2
      const keptFavs = Array.from(state.favorites).filter(
        (id) => typeof id === "string" && !id.startsWith("p2::")
      );
      const favRes = await window.api.setFavorites(keptFavs);
      state.favorites = new Set((favRes && favRes.favorites) || keptFavs);

      // Update settings
      await window.api.setSettings({ settings: state.settings, playlistUrl: url1, playlistUrl2: "" });

      // Update in-memory channel splits + UI
      state.channels2 = [];
      state.channels = state.channels1;
      buildSearchIndex();
      buildList(state.channels);
      buildFavorites();
      return;
    }

    // Delete playlist 1: if playlist2 exists, shift it into playlist1
    const has2 = !!url2;
    if (has2) {
      // Shift playlist2 -> playlist1
      actualPlaylistUrl = url2;
      state.playlistUrl = url2;
      actualPlaylistUrl2 = "";
      state.playlistUrl2 = "";
      selectedPlaylist = selectedPlaylist2;
      selectedPlaylist2 = null;

      // UI fields
      const sel1 = $("#playlistSelect");
      if (sel1) sel1.value = selectedPlaylist || "";
      const sel2 = $("#playlistSelect2");
      if (sel2) sel2.value = "";
      const urlEl1 = $("#playlistUrl");
      if (urlEl1) urlEl1.value = (selectedPlaylist && PLAYLISTS[selectedPlaylist]) ? PLAYLISTS[selectedPlaylist].masked : url2;
      const urlEl2 = $("#playlistUrl2");
      if (urlEl2) urlEl2.value = "";

      // Move caches
      const cached2 = (await window.api.getCachedPlaylist2?.()) || "";
      if (window.api.saveCachedPlaylist1) await window.api.saveCachedPlaylist1(cached2);
      if (window.api.saveCachedPlaylist2) await window.api.saveCachedPlaylist2("");
      if (window.api.saveCachedPlaylist) await window.api.saveCachedPlaylist(cached2);

      // Migrate favorites: p2::<id> -> <id>
      const migrated = Array.from(state.favorites)
        .map((id) => (typeof id === "string" && id.startsWith("p2::") ? id.slice(4) : id))
        .filter((id) => typeof id === "string" && id);
      const favRes = await window.api.setFavorites(migrated);
      state.favorites = new Set((favRes && favRes.favorites) || migrated);

      // Shift channels
      state.channels1 = state.channels2.map((c) => ({
        ...c,
        id: (c.id || "").startsWith("p2::") ? `p1::${c.id.slice(4)}` : c.id,
      }));
      state.channels2 = [];
      state.channels = state.channels1;

      await window.api.setSettings({ settings: state.settings, playlistUrl: url2, playlistUrl2: "" });
      buildSearchIndex();
      buildList(state.channels);
      buildFavorites();
      return;
    }

    // No playlist2 -> clear playlist1 entirely
    actualPlaylistUrl = "";
    state.playlistUrl = "";
    selectedPlaylist = null;
    const sel1 = $("#playlistSelect");
    if (sel1) sel1.value = "";
    const urlEl1 = $("#playlistUrl");
    if (urlEl1) urlEl1.value = "";

    if (window.api.saveCachedPlaylist) await window.api.saveCachedPlaylist("");
    if (window.api.saveCachedPlaylist1) await window.api.saveCachedPlaylist1("");
    if (window.api.saveCachedPlaylist2) await window.api.saveCachedPlaylist2("");

    // Remove all favorites (since channels are gone)
    const favRes = await window.api.setFavorites([]);
    state.favorites = new Set((favRes && favRes.favorites) || []);

    await window.api.setSettings({ settings: state.settings, playlistUrl: "", playlistUrl2: "" });
    state.channels = [];
    state.channels1 = [];
    state.channels2 = [];
    buildSearchIndex();
    buildList([]);
    buildFavorites();
  }

  function renderGroupsInto(channels, container, sectionKey) {
    const localGroups = {};
    channels.forEach((c) => {
      const g = c.group || "Ungrouped";
      localGroups[g] = localGroups[g] || [];
      localGroups[g].push(c);
    });

    const groupNames = Object.keys(localGroups).sort();
    const shouldCollapse = channels.length > 1000;
    const isSingleGroup = groupNames.length === 1;

    groupNames.forEach((g) => {
      const groupKey = `${sectionKey}::${g}`;
      const groupEl = document.createElement("div");
      groupEl.className = "group";
      groupEl.dataset.group = groupKey;

      const h = document.createElement("h4");
      h.className = "group-header";

      const isExpanded =
        isSingleGroup || isSearchActive
          ? true
          : expandedGroups.has(groupKey) || !shouldCollapse;
      const indicator = document.createElement("span");
      indicator.className = "collapse-indicator";
      indicator.textContent = isExpanded ? "▼" : "▶";

      const groupNameDisplay = document.createElement("span");
      groupNameDisplay.style.flex = "1";
      groupNameDisplay.style.minWidth = "0";

      const displayName = formatGroupName(g);
      groupNameDisplay.textContent = displayName;
      groupNameDisplay.title = g;

      const countBadge = document.createElement("span");
      countBadge.className = "channel-count";
      countBadge.textContent = localGroups[g].length;

      h.appendChild(indicator);
      h.appendChild(groupNameDisplay);
      h.appendChild(countBadge);

      const ul = document.createElement("ul");
      ul.className = "channel-list";

      if (isExpanded) {
        renderGroupChannels(g, ul, localGroups[g]);
      } else {
        ul.classList.add("hidden");
      }

      h.onclick = () => {
        const isCurrentlyExpanded = !ul.classList.contains("hidden");
        if (isCurrentlyExpanded) {
          if (ul.__virtualCleanup) {
            try {
              ul.__virtualCleanup();
            } catch (err) {
              console.warn("Virtual cleanup failed", err);
            }
            ul.__virtualCleanup = null;
          }
          ul.classList.add("hidden");
          indicator.textContent = "▶";
          expandedGroups.delete(groupKey);
          expandedGroupsOrderBySection[sectionKey] = [];
        } else {
          const prev =
            expandedGroupsOrderBySection[sectionKey] &&
            expandedGroupsOrderBySection[sectionKey][0];
          if (prev && prev !== groupKey) {
            const prevGroupEl = container.querySelector(
              `.group[data-group="${prev}"]`
            );
            if (prevGroupEl) {
              const prevUl = prevGroupEl.querySelector(".channel-list");
              const prevIndicator = prevGroupEl.querySelector(
                ".collapse-indicator"
              );
              if (prevUl && prevIndicator) {
                prevUl.classList.add("hidden");
                prevIndicator.textContent = "▶";
              }
            }
            expandedGroups.delete(prev);
          }

          ul.classList.remove("hidden");
          indicator.textContent = "▼";
          expandedGroups.add(groupKey);
          expandedGroupsOrderBySection[sectionKey] = [groupKey];

          if (ul.innerHTML === "") {
            renderGroupChannels(g, ul, localGroups[g]);
          }
          h.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      };

      groupEl.appendChild(h);
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
    state.playlistUrl2 = res.playlistUrl2 || "";
    state.volume = res.volume || 0.8; // Load saved volume or default to 80%
    actualPlaylistUrl = state.playlistUrl; // Keep track of real URL internally
    actualPlaylistUrl2 = state.playlistUrl2;
    (res.favorites || []).forEach((f) => state.favorites.add(f));

    // Initialize favorite order (reverse of current favorites for newest-first display)
    state.favoriteOrder = (res.favorites || []).slice().reverse();

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

    // populate playlist 2 UI - mask if it's a default playlist URL
    const playlistSelect2El = $("#playlistSelect2");
    const playlistUrl2El = $("#playlistUrl2");
    if (playlistSelect2El && playlistUrl2El) {
      let isDefaultPlaylist2 = false;
      for (const [key, playlist] of Object.entries(PLAYLISTS)) {
        if (state.playlistUrl2 && state.playlistUrl2 === playlist.url) {
          playlistSelect2El.value = key;
          playlistUrl2El.value = playlist.masked;
          isDefaultPlaylist2 = true;
          selectedPlaylist2 = key;
          break;
        }
      }

      if (!isDefaultPlaylist2) {
        playlistSelect2El.value = "";
        playlistUrl2El.value = state.playlistUrl2;
      }
    }

    // playlistUrl2 is populated above alongside playlistSelect2

    $("#lowBandwidth").checked = !!state.settings.lowBandwidth;
    $("#autoReconnect").checked = !!state.settings.autoReconnect;
    $("#bufferSize").value = state.settings.bufferSeconds || 20;

    // Migrate any legacy favorites (unprefixed IDs) -> playlist1 prefix
    if (window.api.setFavorites) {
      const needsMigration = Array.from(state.favorites).some(
        (id) => typeof id === "string" && !id.startsWith("p1::") && !id.startsWith("p2::")
      );
      if (needsMigration) {
        const migrated = Array.from(state.favorites).map((id) =>
          typeof id === "string" && !id.startsWith("p1::") && !id.startsWith("p2::")
            ? `p1::${id}`
            : id
        );
        const favRes = await window.api.setFavorites(migrated);
        state.favorites = new Set((favRes && favRes.favorites) || migrated);
      }
    }

    // load cached playlists
    showChannelsLoading(true);
    const cached = await window.api.getCachedPlaylist();
    const cached1 =
      window.api.getCachedPlaylist1 && (await window.api.getCachedPlaylist1());
    const cached2 =
      window.api.getCachedPlaylist2 && (await window.api.getCachedPlaylist2());
    showChannelsLoading(false);
    if (cached) {
      const p1 = (cached1 ? parseM3U(cached1) : parseM3U(cached)).map((c) => ({
        ...c,
        id: `p1::${c.id}`,
      }));
      const p2 = cached2
        ? parseM3U(cached2).map((c) => ({ ...c, id: `p2::${c.id}` }))
        : [];
      state.channels1 = p1;
      state.channels2 = p2;
      state.channels = [...p1, ...p2];
      buildSearchIndex(); // Build search index once for all channels
      buildList(state.channels);
      buildFavorites();
    }
  }

  function buildFavorites() {
    const el = $("#favorites-list");
    el.innerHTML = "";
    const favs = state.channels.filter((c) => state.favorites.has(c.id));

    // Sort by newest added - items in favoriteOrder come first (in reverse), then others
    favs.sort((a, b) => {
      const aIndex = state.favoriteOrder.indexOf(a.id);
      const bIndex = state.favoriteOrder.indexOf(b.id);

      // If both are in order, sort by order (newest first)
      if (aIndex !== -1 && bIndex !== -1) {
        return bIndex - aIndex; // Reverse order (newest first)
      }
      // If only one is in order, it comes first
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      // Otherwise keep original order
      return 0;
    });

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
    li.dataset.id = ch.id;

    // Add logo
    const img = document.createElement("img");
    img.src = ch.logo || "";
    img.alt = "";
    img.onerror = () => (img.style.display = "none");

    // Add metadata container
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = `<div class="name">${escapeHtml(ch.name)}</div>`;

    // Add remove button (X)
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "✕";
    removeBtn.className = "favorite-remove-btn";
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

    li.appendChild(img);
    li.appendChild(meta);
    li.appendChild(removeBtn);
    li.onclick = () => selectChannel(ch);
    return li;
  }

  async function toggleFavorite(id, btnEl) {
    const res = await window.api.toggleFavorite(id);
    state.favorites = new Set(res.favorites || []);
    const isFavorited = state.favorites.has(id);

    // Track the order of favorites (newest first)
    if (isFavorited) {
      // Add to the beginning of the order array (newest)
      state.favoriteOrder = [
        id,
        ...state.favoriteOrder.filter((fId) => fId !== id),
      ];
    } else {
      // Remove from order array
      state.favoriteOrder = state.favoriteOrder.filter((fId) => fId !== id);
    }

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

    // Hide welcome message when a channel is selected
    const welcomeMsg = $("#player-welcome");
    if (welcomeMsg) {
      welcomeMsg.classList.add("hidden");
    }

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
    clearBufferingIndicator();
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
    clearBufferingIndicator();
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
    hideBufferingIndicator();
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

      showBufferingIndicator("Loading");
      attachBufferingVideoListeners();

      // Optimize HLS config based on bandwidth settings and network quality
      const hlsConfig = {
        maxBufferLength: buffer,
        maxMaxBufferLength: buffer * 2,
        startFragPrefetch: true,
        lowLatencyMode: false, // Disable low latency for stability
        enableWorker: true,
        loader: window.Hls.DefaultConfig.loader,
        fragLoadingTimeOut: 20000, // 20 seconds fragment loading timeout
        fragLoadingMaxRetry: 4, // Increased retry count
        manifestLoadingTimeOut: 15000, // 15 seconds manifest loading timeout
        manifestLoadingMaxRetry: 3,
        maxBufferHole: 0.5, // Allow smaller gaps in buffer
        highBufferWatchdogPeriod: 2, // Check buffer every 2 seconds
        nudgeOffset: 0.1, // Small nudge to recover from stalls
        nudgeMaxRetry: 5, // Maximum nudge attempts
        backBufferLength: 30, // Keep 30 seconds behind current position
      };

      // Adaptive configuration based on network quality
      if (lastNetworkSpeed?.quality === "poor") {
        hlsConfig.maxBufferLength = Math.max(buffer, 40);
        hlsConfig.maxMaxBufferLength = Math.max(buffer * 2, 80);
        hlsConfig.fragLoadingTimeOut = 30000; // Longer timeout for poor networks
        hlsConfig.fragLoadingMaxRetry = 6; // More retries for poor networks
        hlsConfig.maxBufferHole = 1.0; // Allow larger gaps
        console.log("Using HLS config for poor network quality");
      } else if (lastNetworkSpeed?.quality === "fair") {
        hlsConfig.maxBufferLength = Math.max(buffer, 30);
        hlsConfig.maxMaxBufferLength = Math.max(buffer * 2, 60);
        hlsConfig.fragLoadingTimeOut = 25000;
        hlsConfig.fragLoadingMaxRetry = 5;
        console.log("Using HLS config for fair network quality");
      }

      // More aggressive buffering for low bandwidth mode
      if (settings.lowBandwidth) {
        hlsConfig.maxBufferLength = Math.max(hlsConfig.maxBufferLength, 30);
        hlsConfig.maxMaxBufferLength = Math.max(hlsConfig.maxMaxBufferLength, 60);
        hlsConfig.maxBufferHole = 0.5;
        console.log("Applied low bandwidth HLS settings");
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
        
        // Enhanced error handling with specific recovery strategies
        if (data.fatal) {
          console.log("HLS fatal error, trying recovery strategies");
          handleFatalHLSError(data, url);
        } else {
          // Non-fatal errors with specific handling
          handleNonFatalHLSError(data);
        }
      });
    } else {
      // For non-HLS streams (MPEG-TS, HTTP streams, etc.), use native playback
      console.log("Using native playback for:", url);
      tryNativePlayback(url);
    }
  }

  // Enhanced HLS error handling functions
  function handleFatalHLSError(data, url) {
    const errorDetails = String(data && data.details ? data.details : "");
    console.log("Fatal HLS error:", errorDetails);

    // Try different recovery strategies based on error type
    if (errorDetails.includes("MANIFEST_LOAD_ERROR") || errorDetails.includes("MANIFEST_PARSING_ERROR")) {
      // Manifest issues - try native playback immediately
      console.log("Manifest error, switching to native playback");
      tryNativePlayback(url);
    } else if (errorDetails.includes("NETWORK_ERROR") || errorDetails.includes("FRAG_LOAD_ERROR")) {
      // Network errors - retry with exponential backoff
      console.log("Network error, retrying with backoff");
      retryWithBackoff(url, "hls");
    } else {
      // Other fatal errors - try native playback as fallback
      console.log("Other fatal error, trying native playback");
      tryNativePlayback(url);
    }
  }

  function handleNonFatalHLSError(data) {
    const errorDetails = String(data && data.details ? data.details : "");
    
    if (errorDetails.includes("BUFFER_STALLED") || errorDetails.includes("BUFFER_NUDGE")) {
      showBufferingIndicator("Buffering");
      
      // Try to recover from buffer stall
      if (video && !video.paused) {
        const currentTime = video.currentTime;
        console.log("Attempting to recover from buffer stall");
        
        // Small nudge forward to try to unstick the buffer
        video.currentTime = currentTime + 0.1;
        
        // If still stuck after 2 seconds, try more aggressive recovery
        setTimeout(() => {
          if (video && video.currentTime === currentTime + 0.1) {
            console.log("Buffer stall recovery failed, trying restart");
            video.currentTime = currentTime;
            video.play().catch(err => console.log("Play recovery failed:", err));
          }
        }, 2000);
      }
    } else if (errorDetails.includes("FRAG_LOAD") || errorDetails.includes("FRAG_LOAD_TIMEOUT")) {
      showBufferingIndicator("Loading fragment");
      
      // Fragment loading issues - may indicate network problems
      if (!state.networkRetryScheduled) {
        state.networkRetryScheduled = true;
        setTimeout(() => {
          state.networkRetryScheduled = false;
          console.log("Fragment load issues detected, checking network quality");
          measureNetworkQuality();
        }, 5000);
      }
    } else {
      console.warn("Non-fatal HLS error:", errorDetails);
    }
  }

  function retryWithBackoff(url, playbackType = "hls") {
    const baseDelay = 1000; // 1 second base delay
    const maxDelay = 30000; // 30 seconds max delay
    const retryCount = (state.retryCount || 0) + 1;
    state.retryCount = retryCount;
    
    // Exponential backoff with jitter
    const exponentialDelay = Math.min(baseDelay * Math.pow(2, retryCount - 1), maxDelay);
    const jitter = Math.random() * 1000; // Add up to 1 second of jitter
    const delay = exponentialDelay + jitter;
    
    console.log(`Retrying ${playbackType} playback in ${delay.toFixed(0)}ms (attempt ${retryCount})`);
    
    if (retryCount <= 5) {
      createTimeout(() => {
        if (state.current && state.current.url === url) {
          console.log(`Executing retry attempt ${retryCount} for ${playbackType}`);
          if (playbackType === "hls") {
            attemptLoad(url);
          } else {
            tryNativePlayback(url);
          }
        }
      }, delay);
    } else {
      console.log("Max retries reached, giving up");
      handlePlaybackError({ message: "Max retries exceeded" });
    }
  }

  function tryNativePlayback(url) {
    console.log("Starting native playback:", url);
    cleanupPlayer();
    video.src = url;

    showBufferingIndicator("Loading");
    attachBufferingVideoListeners();

    // Adaptive timeout based on network quality
    const timeout = lastNetworkSpeed?.quality === "poor" ? 15000 : 
                    lastNetworkSpeed?.quality === "fair" ? 12000 : 8000;
    
    console.log(`Using ${timeout}ms timeout for native playback (network: ${lastNetworkSpeed?.quality || 'unknown'})`);

    // Set timeout to detect if stream doesn't load
    const loadTimeout = createTimeout(() => {
      if (video.networkState === 0 || video.networkState === 3) {
        console.warn("Stream loading timeout, trying alternate method");
        handlePlaybackError({ message: "Stream load timeout" });
      }
    }, timeout);

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
      showBufferingIndicator("Buffering");
    });
  }

  function handlePlaybackError(data) {
    showSpinner(false);
    hideBufferingIndicator();
    
    const error = data?.message || data?.error || "Unknown error";
    console.error("Playback error:", error);
    
    // Use enhanced retry system if auto-reconnect is enabled
    if (state.settings.autoReconnect) {
      const retryCount = (state.retryCount || 0) + 1;
      
      if (retryCount <= 5) {
        console.log(`Initiating enhanced retry ${retryCount}/5 for error: ${error}`);
        retryWithBackoff(state.current.url, "auto");
        return;
      } else {
        console.log("Max retries exceeded in handlePlaybackError");
        state.retryCount = 0; // Reset for future attempts
      }
    }
    
    // Fallback to original logic if auto-reconnect is disabled or max retries exceeded
    state.retriesLeft = (state.retriesLeft || 3) - 1;
    if (state.retriesLeft > 0) {
      showMessage(
        `Playback failed, retrying (${3 - state.retriesLeft + 1})...`
      );
      createTimeout(() => {
        showSpinner(true);
        attemptLoad(state.current.url);
      }, 1500);
    } else {
      // Mark failure
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
  hideBufferingIndicator();
  
  // Reset to fresh start state
  state.current = null;
  state.retriesLeft = 3;
  $("#nowplaying").textContent = "";
  $("#player-welcome").classList.remove("hidden");
  video.src = "";
  
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

  // Favorites collapse/expand toggle
  const favoritesSection = $("#favorites");
  const favoritesList = $("#favorites-list");
  const sectionHeader = document.querySelector("#favorites .section-header");
  const sectionToggle = document.querySelector("#favorites .section-toggle");

  // Load collapsed state from localStorage
  let favoritesCollapsed =
    localStorage.getItem("sama-live_favorites_collapsed") === "true";

  function updateFavoritesUI() {
    if (favoritesCollapsed) {
      favoritesList.style.display = "none";
      sectionToggle.textContent = "▶";
    } else {
      favoritesList.style.display = "";
      sectionToggle.textContent = "▼";
    }
  }

  sectionHeader.style.cursor = "pointer";
  sectionHeader.onclick = () => {
    favoritesCollapsed = !favoritesCollapsed;
    localStorage.setItem("sama-live_favorites_collapsed", favoritesCollapsed);
    updateFavoritesUI();
  };

  updateFavoritesUI();

  // Sidebar collapse/expand toggle
  const sidebar = $("#sidebar");
  const sidebarToggle = $("#sidebarToggle");
  const app = $("#app");

  // Always start with sidebar expanded
  let sidebarCollapsed = false;

  function updateSidebarUI() {
    if (sidebarCollapsed) {
      sidebar.classList.add("collapsed");
      app.classList.add("sidebar-collapsed");
      sidebarToggle.textContent = ">";
      sidebarToggle.title = "Show Sidebar";
    } else {
      sidebar.classList.remove("collapsed");
      app.classList.remove("sidebar-collapsed");
      sidebarToggle.textContent = "<";
      sidebarToggle.title = "Hide Sidebar";
    }
    
    // Save the current state to localStorage
    localStorage.setItem("sama-live_sidebar_collapsed", sidebarCollapsed);
  }

  sidebarToggle.onclick = () => {
    sidebarCollapsed = !sidebarCollapsed;
    localStorage.setItem("sama-live_sidebar_collapsed", sidebarCollapsed);
    updateSidebarUI();
  };

  updateSidebarUI();

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
    const url2 = actualPlaylistUrl2 || state.playlistUrl2;
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
    const res = await loadPlaylistsSeparate(url, url2);
    showChannelsLoading(false);

    btn.disabled = false;
    btn.textContent = originalText;

    if (!res.ok) {
      showMessage("Failed to fetch playlist: " + res.error, 4000);
      return;
    }

    const p1 = (res.text1 ? parseM3U(res.text1) : parseM3U(res.text)).map((c) => ({
      ...c,
      id: `p1::${c.id}`,
    }));
    const p2 = res.text2
      ? parseM3U(res.text2).map((c) => ({ ...c, id: `p2::${c.id}` }))
      : [];
    state.channels1 = p1;
    state.channels2 = p2;
    state.channels = [...p1, ...p2];
    await window.api.saveCachedPlaylist(res.text);
    if (window.api.saveCachedPlaylist1) {
      await window.api.saveCachedPlaylist1(res.text1 || "");
    }
    if (window.api.saveCachedPlaylist2) {
      await window.api.saveCachedPlaylist2(res.text2 || "");
    }
    buildSearchIndex(); // Rebuild search index for new channels
    buildList(state.channels);
    buildFavorites();
    const sources = url2 ? 2 : 1;
    showMessage(
      `Playlist refreshed (${sources} source${sources === 1 ? "" : "s"}) - ${state.channels.length} channels`,
      2000
    );
  };

  // Settings modal
  $("#settingsBtn").onclick = () => {
    $("#settings").classList.remove("hidden");
    $("#settings").classList.add("visible");
    $("#playlistUrl").focus();
  };
  $("#closeSettings").onclick = () => {
    $("#settings").classList.add("hidden");
    $("#settings").classList.remove("visible");
  };

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

  const playlistUrl2Input = $("#playlistUrl2");
  if (playlistUrl2Input) {
    playlistUrl2Input.addEventListener("input", (e) => {
      const value = (e.target.value || "");
      let isMasked = false;

      for (const [key, playlist] of Object.entries(PLAYLISTS)) {
        if (value === playlist.masked) {
          isMasked = true;
          break;
        }
      }

      if (value && !isMasked) {
        actualPlaylistUrl2 = value.trim();
        selectedPlaylist2 = null;
        const sel2 = $("#playlistSelect2");
        if (sel2) sel2.value = "";
      }
    });
  }

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

  // Handle playlist 2 dropdown selection
  const playlistSelect2 = $("#playlistSelect2");
  if (playlistSelect2) {
    playlistSelect2.onchange = () => {
      const selected = playlistSelect2.value;
      const url2El = $("#playlistUrl2");
      if (!url2El) return;

      if (selected && PLAYLISTS[selected]) {
        selectedPlaylist2 = selected;
        const playlist = PLAYLISTS[selected];
        url2El.value = playlist.masked;
      } else {
        selectedPlaylist2 = null;
        url2El.value = "";
        actualPlaylistUrl2 = "";
      }
    };
  }

  // Handle loading selected playlist
  $("#loadSelectedPlaylist").onclick = async () => {
    const loadBtn = $("#loadSelectedPlaylist");
    const loadBtnLabel = loadBtn ? loadBtn.querySelector(".btn-label") : null;
    const originalLabel = loadBtnLabel ? loadBtnLabel.textContent : "Load Selected";
    // Resolve URL 1
    let url1 = "";
    if (selectedPlaylist && PLAYLISTS[selectedPlaylist]) {
      const playlist = PLAYLISTS[selectedPlaylist];
      url1 = playlist.url;
      actualPlaylistUrl = url1;
      $("#playlistUrl").value = playlist.masked;
    } else {
      const customUrl = $("#playlistUrl").value.trim();
      if (!customUrl) {
        showMessage("⚠ Please enter a playlist URL", 1500);
        return;
      }
      url1 = customUrl;
      actualPlaylistUrl = customUrl;
    }

    // Resolve URL 2
    let url2 = "";
    if (selectedPlaylist2 && PLAYLISTS[selectedPlaylist2]) {
      const playlist2 = PLAYLISTS[selectedPlaylist2];
      url2 = playlist2.url;
      actualPlaylistUrl2 = url2;
      const url2El = $("#playlistUrl2");
      if (url2El) url2El.value = playlist2.masked;
    } else {
      url2 = ($("#playlistUrl2")?.value || "").trim();
      actualPlaylistUrl2 = url2;
    }

    // Safety: allow same playlist in both sources, but avoid double fetch + duplicates
    if (url2 && url1 && url2.trim() === url1.trim()) {
      url2 = "";
      actualPlaylistUrl2 = "";
      state.playlistUrl2 = "";
      const url2El = $("#playlistUrl2");
      if (url2El) url2El.value = "";
      const sel2 = $("#playlistSelect2");
      if (sel2) sel2.value = "";
      selectedPlaylist2 = null;
      showMessage("ℹ Same playlist selected for both sources. Source 2 ignored.", 3000);
    }

    state.playlistUrl2 = url2;

    // Clear old channels and load new ones
    state.channels = [];
    state.channels1 = [];
    state.channels2 = [];
    searchIndex = {}; // Clear search index for old channels
    isSearchActive = false;
    expandedGroups.clear();
    expandedGroupsOrderBySection = {};
    buildList([]);
    buildFavorites();

    if (loadBtn) {
      loadBtn.classList.add("is-loading");
      loadBtn.disabled = true;
      if (loadBtnLabel) loadBtnLabel.textContent = "Loading...";
    }

    try {
      // Auto-load playlist(s)
      await autoLoadChannels(url1, url2);
    } finally {
      if (loadBtn) {
        loadBtn.classList.remove("is-loading");
        loadBtn.disabled = false;
        if (loadBtnLabel) loadBtnLabel.textContent = originalLabel;
      }
    }
  };
  // About modal handling
  const aboutModal = $("#about");
  const closeAboutBtn = $("#closeAboutX");
  const appLogo = $("#appLogo");
  const devToolsSection = $("#devToolsSection");
  
  // Developer tools secret click handler
  let clickCount = 0;
  let clickTimer = null;
  const CLICK_THRESHOLD = 5;
  const CLICK_TIMEOUT = 1000; // 1 second window for rapid clicks
  
  if (appLogo) {
    appLogo.addEventListener('click', () => {
      // Clear any existing timer
      if (clickTimer) {
        clearTimeout(clickTimer);
      }
      
      // Increment click count
      clickCount++;
      
      // If we've reached the threshold, show the dev tools
      if (clickCount >= CLICK_THRESHOLD) {
        if (devToolsSection) {
          devToolsSection.style.display = 'block';
          // Scroll to show the dev tools section
          devToolsSection.scrollIntoView({ behavior: 'smooth' });
          // Reset the counter
          clickCount = 0;
        }
      }
      
      // Set a timer to reset the counter if no more clicks
      clickTimer = setTimeout(() => {
        clickCount = 0;
        clickTimer = null;
      }, CLICK_TIMEOUT);
    });
    
    // Add hover effect to give a hint
    appLogo.style.cursor = 'pointer';
    appLogo.style.transition = 'transform 0.2s';
    appLogo.addEventListener('mouseover', () => {
      appLogo.style.transform = 'scale(1.05)';
    });
    appLogo.addEventListener('mouseout', () => {
      appLogo.style.transform = 'scale(1)';
    });
  }
  
  // Toggle modal visibility
  function toggleAboutModal(show = null) {
    if (show === null) {
      show = aboutModal.classList.contains("hidden");
    }
    
    if (show) {
      // Reset the click counter when opening the modal
      clickCount = 0;
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
      }
      
      aboutModal.classList.remove("hidden");
      // Use requestAnimationFrame to ensure the element is visible before adding the 'visible' class
      requestAnimationFrame(() => {
        aboutModal.classList.add("visible");
      });
      
      // Display app version
      if (window.electronAPI && window.electronAPI.getAppVersion) {
        window.electronAPI.getAppVersion().then((data) => {
          const versionElements = document.querySelectorAll("#appVersion");
          versionElements.forEach(el => {
            el.textContent = data.version;
          });
        });
      }
    } else {
      aboutModal.classList.remove("visible");
      // Hide developer tools section when closing about page
      if (devToolsSection) {
        devToolsSection.style.display = "none";
      }
      updateClickCount = 0; // Reset click counter
      
      // Reset the click counter and timer
      clickCount = 0;
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
      }
      
      // Wait for the transition to complete before hiding the element
      aboutModal.addEventListener('transitionend', function handler() {
        if (!aboutModal.classList.contains("visible")) {
          aboutModal.classList.add("hidden");
        }
        aboutModal.removeEventListener('transitionend', handler);
      }, { once: true });
    }
  }
  
  // Toggle About modal
  $("#aboutBtn").onclick = (e) => {
    e.stopPropagation();
    toggleAboutModal();
  };
  
  // Close modal when clicking the close button
  if (closeAboutBtn) {
    closeAboutBtn.onclick = (e) => {
      e.stopPropagation();
      toggleAboutModal(false);
    };
  }
  
  // Close modal when clicking outside the modal content
  aboutModal.onclick = (e) => {
    if (e.target === aboutModal) {
      toggleAboutModal(false);
    }
  };

  // Close modal with Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !aboutModal.classList.contains("hidden")) {
      toggleAboutModal(false);
    }
  });

  // Open developer tools button
  if ($("#openDevToolsBtn")) {
    $("#openDevToolsBtn").onclick = async () => {
      console.log("Opening developer tools...");
      try {
        const result = await window.electronAPI.openDevTools();
        if (!result.ok) {
          console.error("Failed to open dev tools:", result.error);
        }
      } catch (err) {
        console.error("Error opening dev tools:", err);
      }
    };
  }

  // Developer tools unlock counter
  let updateClickCount = 0;
  let clickTimeout = null;
  const DEV_TOOLS_CLICK_THRESHOLD = 5;
  const CLICK_RESET_TIMEOUT = 2000; // 2 seconds

  // Check for updates button
  if ($("#checkUpdatesBtn")) {
    $("#checkUpdatesBtn").onclick = async () => {
      // Clear existing timeout
      if (clickTimeout) {
        clearTimeout(clickTimeout);
      }
      
      // Increment click counter for dev tools unlock
      updateClickCount++;
      
      if (updateClickCount >= DEV_TOOLS_CLICK_THRESHOLD) {
        $("#devToolsSection").style.display = "block";
        updateClickCount = 0; // Reset counter
        if (clickTimeout) {
          clearTimeout(clickTimeout);
          clickTimeout = null;
        }
      } else {
        // Set timeout to reset counter if not rapid enough
        clickTimeout = setTimeout(() => {
          updateClickCount = 0;
          clickTimeout = null;
        }, CLICK_RESET_TIMEOUT);
      }
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
        playlistUrl2: actualPlaylistUrl2 || ($("#playlistUrl2")?.value || "").trim(),
      };
      console.log("Sending to main process:", payload);
      const result = await window.api.setSettings(payload);
      console.log("Got result:", result);
      if (result && result.ok) {
        state.settings = payload.settings;
        state.playlistUrl = payload.playlistUrl;
        state.playlistUrl2 = payload.playlistUrl2;
        actualPlaylistUrl = state.playlistUrl;
        actualPlaylistUrl2 = state.playlistUrl2;

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

  async function autoLoadChannels(url, url2 = "", retries = 3) {
    showChannelsLoading(true);
    showMessage("Loading playlist...");

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(
          `Fetching channels (attempt ${attempt}/${retries}) from ${url}...`
        );
        const res = await loadPlaylistsSeparate(url, url2);
        console.log(`Fetch response received:`, res);

        if (res.ok && res.text) {
          console.log(`Parse attempt - received ${res.text.length} bytes`);
          const parsedChannels = parseM3U(res.text);
          console.log(`Parsed ${parsedChannels.length} channels from playlist`);

          if (parsedChannels.length === 0) {
            throw new Error("Playlist appears to be empty or invalid");
          }

          const p1 = (res.text1 ? parseM3U(res.text1) : parsedChannels).map((c) => ({
            ...c,
            id: `p1::${c.id}`,
          }));
          const p2 = res.text2
            ? parseM3U(res.text2).map((c) => ({ ...c, id: `p2::${c.id}` }))
            : [];
          state.channels1 = p1;
          state.channels2 = p2;
          state.channels = [...p1, ...p2];
          await window.api.saveCachedPlaylist(res.text);
          if (window.api.saveCachedPlaylist1) {
            await window.api.saveCachedPlaylist1(res.text1 || "");
          }
          if (window.api.saveCachedPlaylist2) {
            await window.api.saveCachedPlaylist2(res.text2 || "");
          }
          buildSearchIndex(); // Rebuild search index for new channels
          buildList(state.channels);
          buildFavorites();
          showChannelsLoading(false);
          const sources = url2 ? 2 : 1;
          showMessage(
            `✓ Loaded ${state.channels.length} channels (${sources} source${sources === 1 ? "" : "s"})`,
            2000
          );
          console.log(
            `✓ Successfully loaded ${state.channels.length} channels`
          );
          return;
        }

        const errorMsg = res.error || "Unknown error";
        console.error(
          `Fetch failed (attempt ${attempt}/${retries}): ${errorMsg}`
        );

        if (attempt < retries) {
          console.log(`Retrying in 2 seconds... (${attempt}/${retries})`);
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      } catch (err) {
        console.error(
          `Error fetching channels (attempt ${attempt}/${retries}):`,
          err
        );
        if (attempt < retries) {
          console.log(`Retrying in 2 seconds...`);
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }

    showChannelsLoading(false);
    showMessage("✗ Failed to load channels after 3 attempts", 4000);
  }

  async function loadPlaylistsSeparate(url1, url2) {
    const u1 = typeof url1 === "string" ? url1.trim() : "";
    const u2 = typeof url2 === "string" ? url2.trim() : "";
    if (!u1) return { ok: false, error: "No playlist URL set" };

    try {
      const r1 = await window.api.fetchPlaylist(u1);
      if (!r1 || !r1.ok) {
        return { ok: false, error: (r1 && r1.error) || "Failed to fetch playlist" };
      }

      let r2 = null;
      if (u2) {
        r2 = await window.api.fetchPlaylist(u2);
        if (!r2 || !r2.ok) {
          return { ok: false, error: (r2 && r2.error) || "Failed to fetch playlist" };
        }
      }

      const mergedText =
        "#EXTM3U\n" +
        [r1, r2]
          .filter(Boolean)
          .map((r) => (r.text || "").replace(/^#EXTM3U\s*/i, ""))
          .join("\n");

      return {
        ok: true,
        text: mergedText,
        text1: r1.text || "",
        text2: r2 ? r2.text || "" : "",
      };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  }

  function showConfirmation(message, onConfirm, onCancel = null) {
    const modal = $("#confirmationModal");
    const messageEl = $("#confirmationMessage");
    const confirmBtn = $("#confirmAction");
    const cancelBtn = $("#cancelConfirm");
    const closeBtn = $("#closeConfirmationModal");

    // Set the message
    messageEl.textContent = message;

    // Remove previous event listeners
    const newConfirmBtn = confirmBtn.cloneNode(true);
    const newCancelBtn = cancelBtn.cloneNode(true);
    const newCloseBtn = closeBtn.cloneNode(true);

    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

    // Add new event listeners
    newConfirmBtn.onclick = () => {
      modal.classList.remove("visible");
      if (typeof onConfirm === 'function') onConfirm();
    };

    newCancelBtn.onclick = () => {
      modal.classList.remove("visible");
      if (typeof onCancel === 'function') onCancel();
    };

    newCloseBtn.onclick = () => {
      modal.classList.remove("visible");
      if (typeof onCancel === 'function') onCancel();
    };

    // Close when clicking outside
    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.classList.remove("visible");
        if (typeof onCancel === 'function') onCancel();
      }
    };

    // Close with Escape key
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        modal.classList.remove("visible");
        if (typeof onCancel === 'function') onCancel();
        document.removeEventListener('keydown', handleKeyDown);
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Show the modal
    modal.classList.remove("hidden");
    modal.classList.add("visible");
    modal.focus();
  }

  // Update clear cache button to use confirmation
  $("#clearCache").onclick = () => {
    showConfirmation(
      "Are you sure you want to clear the cache? This will remove all cached data including your favorites list.",
      async () => {
        await window.api.clearCache();
        state.channels = [];
        state.favorites = new Set(); // Initialize as empty Set
        state.favoriteOrder = []; // Also clear favorite order
        buildList([]);
        updateFavoritesUI(); // Update UI to reflect cleared favorites
        showMessage("Cache and favorites cleared successfully");
      }
    );
  };

  // About modal buttons
  const checkForUpdatesBtn = document.getElementById('checkForUpdates');
  const showLicensesBtn = document.getElementById('showLicenses');
  const updateStatusEl = document.getElementById('updateStatus');

  if (checkForUpdatesBtn) {
    checkForUpdatesBtn.addEventListener('click', async () => {
      if (!window.electronAPI) {
        updateStatusEl.textContent = 'Update check not available';
        return;
      }

      updateStatusEl.textContent = 'Checking...';
      checkForUpdatesBtn.disabled = true;

      try {
        const result = await window.electronAPI.checkForUpdates();
        console.log('Update check result:', result);

        if (result.updateAvailable) {
          updateStatusEl.textContent = 'Update available! Restart to install.';
          // Optional: Add a restart button here
        } else {
          updateStatusEl.textContent = 'You have the latest version';
        }
      } catch (error) {
        console.error('Error checking for updates:', error);
        updateStatusEl.textContent = 'Error checking for updates';
      } finally {
        checkForUpdatesBtn.disabled = false;
      }
    });
  }

  // License modal handling
  const licenseModal = document.getElementById('licenseModal');
  const closeLicenseModal = document.getElementById('closeLicenseModal');
  const closeLicenseBtn = document.getElementById('closeLicenseBtn');

  function toggleLicenseModal(show = null) {
    if (show === null) {
      show = !licenseModal.classList.contains('visible');
    }
    
    if (show) {
      licenseModal.classList.add('visible');
      document.body.style.overflow = 'hidden';
    } else {
      licenseModal.classList.remove('visible');
      document.body.style.overflow = '';
    }
  }

  if (showLicensesBtn) {
    console.log('Adding click listener to showLicensesBtn');
    showLicensesBtn.addEventListener('click', (e) => {
      console.log('License button clicked');
      console.log('showLicensesBtn:', showLicensesBtn);
      console.log('licenseModal:', licenseModal);
      e.preventDefault();
      console.log('Toggling license modal');
      toggleLicenseModal(true);
      console.log('Modal hidden class after toggle:', licenseModal.classList.contains('hidden'));
    });
  } else {
    console.error('showLicensesBtn not found in the DOM');
  }

  if (closeLicenseModal) {
    closeLicenseModal.addEventListener('click', (e) => {
      e.preventDefault();
      toggleLicenseModal(false);
    });
  }

  if (closeLicenseBtn) {
    closeLicenseBtn.addEventListener('click', (e) => {
      e.preventDefault();
      toggleLicenseModal(false);
    });
  }

  // Close modal when clicking outside the content
  licenseModal.addEventListener('click', (e) => {
    if (e.target === licenseModal) {
      toggleLicenseModal(false);
    }
  });

  // Close modal with Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !licenseModal.classList.contains('hidden')) {
      toggleLicenseModal(false);
    }
  });

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
        const p1 = parseM3U(res.text).map((c) => ({ ...c, id: `p1::${c.id}` }));
        state.channels1 = p1;
        state.channels2 = [];
        state.channels = p1;
        await window.api.saveCachedPlaylist(res.text);
        if (window.api.saveCachedPlaylist1) {
          await window.api.saveCachedPlaylist1(res.text);
        }
        if (window.api.saveCachedPlaylist2) {
          await window.api.saveCachedPlaylist2("");
        }
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

  // Tablet-friendly Volume Control
  const volumeControl = $("#volumeControl");
  const volumeBtn = $("#volumeBtn");
  const volumePanel = $("#volumePanel");
  const volumeSlider = $("#volumeSlider");
  const volumeUpBtn = $("#volumeUpBtn");
  const volumeDownBtn = $("#volumeDownBtn");

  // Navbar Volume Control
  const volumeBtnNav = $("#volumeBtnNav");
  const volumePanelNav = $("#volumePanelNav");
  const volumeSliderNav = $("#volumeSliderNav");
  let volumeAutoCollapseTimeout;

  // Initialize volume slider with current volume
  const updateVolumeSlider = () => {
    if (volumeSlider) volumeSlider.value = Math.round(video.volume * 100);
    volumeSliderNav.value = Math.round(video.volume * 100);
  };

  // Auto-collapse navbar volume panel after 5 seconds
  const autoCollapseVolumePanel = () => {
    clearTimeout(volumeAutoCollapseTimeout);
    volumeAutoCollapseTimeout = setTimeout(() => {
      volumePanelNav.classList.add("hidden");
      navPanelOpen = false;
    }, 5000);
  };

  // Show volume panel on button click
  let navPanelOpen = false;
  volumeBtnNav.addEventListener("click", (e) => {
    e.stopPropagation();
    navPanelOpen = !navPanelOpen;
    if (navPanelOpen) {
      volumePanelNav.classList.remove("hidden");
      updateVolumeSlider();
      autoCollapseVolumePanel();
    } else {
      volumePanelNav.classList.add("hidden");
      clearTimeout(volumeAutoCollapseTimeout);
    }
  });

  // Close navbar volume panel when clicking outside
  document.addEventListener("click", (e) => {
    if (!$("#volumeControlNav").contains(e.target) && navPanelOpen) {
      volumePanelNav.classList.add("hidden");
      navPanelOpen = false;
      clearTimeout(volumeAutoCollapseTimeout);
    }
  });

  // Volume slider control (navbar)
  volumeSliderNav.addEventListener("input", (e) => {
    const newVolume = e.target.value / 100;
    video.volume = newVolume;
    navPanelOpen = true; // Keep panel open while adjusting
    // Update icon based on volume
    if (newVolume === 0) {
      volumeBtnNav.textContent = "🔇";
    } else if (newVolume < 0.3) {
      volumeBtnNav.textContent = "🔈";
    } else if (newVolume < 0.7) {
      volumeBtnNav.textContent = "🔉";
    } else {
      volumeBtnNav.textContent = "🔊";
    }
    // Reset auto-collapse timer on slider interaction
    autoCollapseVolumePanel();
  });

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


