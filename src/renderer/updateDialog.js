// Update Dialog Manager
class UpdateDialog {
  constructor() {
    this.isUpdateAvailable = false;
    this.isDownloading = false;
    this.isUpdateDownloaded = false;
    this.downloadCancelled = false;
    this.updateVersion = null;
    this.setupListeners();
    
    // Check for pending updates on startup
    this.checkForPendingUpdates();
  }

  setupListeners() {
    // Listen for update available
    window.electronAPI.onUpdateAvailable((data) => {
      console.log("✓ Update available:", data);
      this.isUpdateAvailable = true;
      this.updateVersion = data.version;
      this.showUpdateNotification(data.version);
    });

    // Listen for download progress
    window.electronAPI.onUpdateDownloadProgress((data) => {
      // Don't show progress if download was cancelled
      if (this.downloadCancelled) {
        return;
      }
      console.log(`📊 Download progress: ${data.percent}%`);
      this.updateDownloadProgress(data.percent);
    });

    // Listen for update downloaded
    window.electronAPI.onUpdateDownloaded(() => {
      // Don't show ready notification if download was cancelled
      if (this.downloadCancelled) {
        return;
      }
      console.log("✅ Update downloaded and ready to install");
      this.showUpdateReadyNotification();
    });

    // Listen for update cancelled
    window.api.on("update-cancelled", () => {
      console.log("🚫 Download cancelled event received");
      this.downloadCancelled = true;
      this.isDownloading = false;
    });

    // Listen for update error
    window.electronAPI.onUpdateError((data) => {
      // Don't show error if download was cancelled
      if (this.downloadCancelled) {
        return;
      }
      console.error("❌ Update error:", data);
      this.showErrorNotification(data.message);
    });

    // Listen for no updates available
    window.electronAPI.onUpdateNotAvailable(() => {
      console.log("App is up to date");
    });
  }

  showUpdateNotification(version) {
    const notification = document.createElement("div");
    notification.className =
      "update-notification update-notification-available";
    notification.innerHTML = `
      <div class="update-notification-content">
        <div class="update-notification-header">
          <span class="update-icon">⬇️</span>
          <span class="update-title">Update Available</span>
          <button class="update-minimize-btn" title="Minimize" style="display: none;">↓</button>
          <button class="update-close-btn">×</button>
        </div>
        <p class="update-message">Version <strong>${version}</strong> is available. Would you like to download and install it?</p>
        <div class="update-actions">
          <button class="btn-update-download">Download & Update</button>
          <button class="btn-update-later">Later</button>
        </div>
      </div>
    `;
    document.body.appendChild(notification);

    // Attach event listeners
    const downloadBtn = notification.querySelector(".btn-update-download");
    const laterBtn = notification.querySelector(".btn-update-later");
    const closeBtn = notification.querySelector(".update-close-btn");
    const minimizeBtn = notification.querySelector(".update-minimize-btn");

    downloadBtn.addEventListener("click", () =>
      this.downloadUpdate(notification, downloadBtn, laterBtn, minimizeBtn)
    );
    laterBtn.addEventListener("click", () =>
      this.dismissNotification(notification)
    );
    closeBtn.addEventListener("click", () =>
      this.dismissNotification(notification)
    );
  }

  showUpdateReadyNotification() {
    // Remove the download notification if it exists
    const existingNotification = document.querySelector(".update-notification");
    if (existingNotification) {
      existingNotification.remove();
    }

    // Auto-close the minimized indicator if it exists
    const minimizedIndicator = document.querySelector(".update-minimized-indicator");
    if (minimizedIndicator) {
      minimizedIndicator.remove();
    }

    this.isUpdateDownloaded = true;
    this.showInstallDownloadedButton();

    // Save state that update is ready for install
    localStorage.setItem("sama-live_update_ready", "true");

    const notification = document.createElement("div");
    notification.className = "update-notification update-notification-ready";
    notification.innerHTML = `
      <div class="update-notification-content">
        <div class="update-notification-header">
          <span class="update-icon">✅</span>
          <span class="update-title">Update Ready to Install</span>
          <button class="update-minimize-btn" title="Minimize" style="display: none;">↓</button>
          <button class="update-close-btn">×</button>
        </div>
        <p class="update-message">The update has been downloaded. You can install it now or later.</p>
        <div class="update-actions">
          <button class="btn-update-install">Install Now</button>
          <button class="btn-update-install-later">Install Later</button>
        </div>
      </div>
    `;
    document.body.appendChild(notification);

    // Attach event listeners
    const installBtn = notification.querySelector(".btn-update-install");
    const laterBtn = notification.querySelector(".btn-update-install-later");
    const closeBtn = notification.querySelector(".update-close-btn");
    const minimizeBtn = notification.querySelector(".update-minimize-btn");

    installBtn.addEventListener("click", () =>
      this.installUpdate(notification)
    );
    laterBtn.addEventListener("click", () => {
      this.dismissNotification(notification);
      this.showInstallUpdatesButton();
    });

    // Add close button handler
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        this.dismissNotification(notification);
        this.showInstallUpdatesButton();
      });
    }

    if (minimizeBtn) {
      minimizeBtn.style.display = "flex";
      minimizeBtn.addEventListener("click", () =>
        this.minimizeDownloadWindow(notification)
      );
    }
  }

  showInstallUpdatesButton() {
    // Find the About page and add install updates button
    const aboutFooter = document.querySelector(".about-footer");
    if (aboutFooter && !document.getElementById("installUpdatesBtn")) {
      const installBtn = document.createElement("button");
      installBtn.id = "installUpdatesBtn";
      installBtn.className = "about-link";
      installBtn.innerHTML = `
        <span class="about-icon">⬆️</span> Install Updates
      `;
      installBtn.style.color = "#4CAF50";
      installBtn.style.fontWeight = "bold";
      
      // Insert after the check for updates button
      const checkForUpdatesBtn = document.getElementById("checkForUpdates");
      if (checkForUpdatesBtn) {
        checkForUpdatesBtn.parentNode.insertBefore(installBtn, checkForUpdatesBtn.nextSibling);
      } else {
        aboutFooter.appendChild(installBtn);
      }
      
      // Add click handler to show install window
      installBtn.addEventListener("click", () => {
        this.showUpdateReadyNotification();
      });
    }
  }

  checkForPendingUpdates() {
    // Check if there's a pending update on app startup
    const updateReady = localStorage.getItem("sama-live_update_ready");
    if (updateReady === "true") {
      console.log("🔄 Pending update detected, showing install window");
      // Show the install window after a short delay to allow UI to load
      setTimeout(() => {
        this.showUpdateReadyNotification();
      }, 1000);
    }
  }

  showInstallDownloadedButton() {
    const installBtn = document.getElementById("installDownloadedUpdateBtn");
    if (installBtn) {
      installBtn.style.display = "block";
      installBtn.addEventListener("click", () => {
        this.installUpdate(null);
      });
    }
  }

  showErrorNotification(message) {
    const notification = document.createElement("div");
    notification.className = "update-notification update-notification-error";
    notification.innerHTML = `
      <div class="update-notification-content">
        <div class="update-notification-header">
          <span class="update-icon">⚠️</span>
          <span class="update-title">Update Error</span>
          <button class="update-close-btn">×</button>
        </div>
        <p class="update-message">${message}</p>
        <div class="update-actions">
          <button class="btn-update-later">Dismiss</button>
        </div>
      </div>
    `;
    document.body.appendChild(notification);

    // Attach event listeners
    const dismissBtn = notification.querySelector(".btn-update-later");
    const closeBtn = notification.querySelector(".update-close-btn");

    dismissBtn.addEventListener("click", () =>
      this.dismissNotification(notification)
    );
    closeBtn.addEventListener("click", () =>
      this.dismissNotification(notification)
    );
  }

  updateDownloadProgress(percent) {
    const notification = document.querySelector(".update-notification");
    if (notification && !notification.querySelector(".progress-bar")) {
      const progressDiv = document.createElement("div");
      progressDiv.className = "progress-container";
      progressDiv.innerHTML = `
        <div class="progress-bar">
          <div class="progress-fill" style="width: 0%"></div>
        </div>
        <span class="progress-text">0%</span>
      `;
      notification
        .querySelector(".update-actions")
        .parentElement.insertBefore(
          progressDiv,
          notification.querySelector(".update-actions")
        );
    }

    const progressFill = document.querySelector(".progress-fill");
    const progressText = document.querySelector(".progress-text");
    if (progressFill) {
      progressFill.style.width = percent + "%";
      progressText.textContent = percent + "%";
    }
  }

  async downloadUpdate(notification, downloadBtn, laterBtn, minimizeBtn) {
    this.isDownloading = true;
    this.downloadCancelled = false;

    // Update button texts during download
    downloadBtn.textContent = "Downloading";
    downloadBtn.disabled = true;
    laterBtn.textContent = "Minimize";

    // Show minimize button
    if (minimizeBtn) {
      minimizeBtn.style.display = "flex";
      minimizeBtn.addEventListener("click", () =>
        this.minimizeDownloadWindow(notification)
      );
    }

    // Change later button to minimize download
    const minimizeHandler = () => this.minimizeDownloadWindow(notification);
    laterBtn.removeEventListener("click", laterBtn.laterListener);
    laterBtn.addEventListener("click", minimizeHandler);
    laterBtn.laterListener = minimizeHandler;

    const result = await window.electronAPI.startUpdateDownload();
    if (!result.ok) {
      console.error("Download failed:", result.error);
      this.resetDownloadButtons(notification, downloadBtn, laterBtn);
    }
  }

  cancelDownload(notification) {
    this.isDownloading = false;
    this.downloadCancelled = true;
    
    // Call the cancel download handler
    window.electronAPI.cancelUpdateDownload().then(() => {
      console.log("Download cancelled successfully");
    }).catch(err => {
      console.error("Failed to cancel download:", err);
    });

    // Reset the buttons and dismiss the notification
    const downloadBtn = notification.querySelector(".btn-update-download");
    const laterBtn = notification.querySelector(".btn-update-later");

    if (downloadBtn && laterBtn) {
      downloadBtn.textContent = "Download & Update";
      downloadBtn.disabled = false;
      laterBtn.textContent = "Later";
    }

    // Clear progress bar if it exists
    const progressContainer = notification.querySelector(".progress-container");
    if (progressContainer) {
      progressContainer.remove();
    }

    // Remove any minimized indicator
    const minimizedIndicator = document.querySelector(".update-minimized-indicator");
    if (minimizedIndicator) {
      minimizedIndicator.remove();
    }

    // Dismiss the notification
    this.dismissNotification(notification);
    
    // Reset cancel flag after a short delay to allow for proper cleanup
    setTimeout(() => {
      this.downloadCancelled = false;
    }, 1000);
  }

  resetDownloadButtons(notification, downloadBtn, laterBtn) {
    downloadBtn.textContent = "Download & Update";
    downloadBtn.disabled = false;
    laterBtn.textContent = "Minimize";

    // Clear progress bar if it exists
    const progressContainer = notification.querySelector(".progress-container");
    if (progressContainer) {
      progressContainer.remove();
    }
  }

  async installUpdate(notification) {
    // Clear the update ready state
    localStorage.removeItem("sama-live_update_ready");
    
    // Remove the install updates button if it exists
    const installUpdatesBtn = document.getElementById("installUpdatesBtn");
    if (installUpdatesBtn) {
      installUpdatesBtn.remove();
    }

    // Find the install button and show installation state
    const installBtn = notification
      ? notification.querySelector(".btn-update-install")
      : document.getElementById("installDownloadedUpdateBtn");
    const icon = notification
      ? notification.querySelector(".update-icon")
      : null;
    const title = notification
      ? notification.querySelector(".update-title")
      : null;
    const message = notification
      ? notification.querySelector(".update-message")
      : null;
    const laterBtn = notification
      ? notification.querySelector(".btn-update-install-later")
      : null;

    // Add installing class for animation (only if notification exists)
    if (notification) {
      notification.classList.add("installing");
      laterBtn.disabled = true;
    }

    installBtn.disabled = true;

    // Update UI to show installation in progress (only if notification exists)
    if (icon) icon.textContent = "⚙️";
    if (icon) icon.classList.add("spin-animation");
    if (title) title.textContent = "Installing Update";
    if (message)
      message.textContent =
        "Please wait while the update is being installed...";

    // Disable buttons and show loading state
    if (installBtn) {
      installBtn.style.opacity = "0.6";
      installBtn.style.cursor = "wait";
      installBtn.textContent = "Installing...";
    }
    if (laterBtn) laterBtn.style.display = "none";

    // Call the install update
    const result = await window.electronAPI.installUpdate();
    
    if (!result.ok) {
      console.error("❌ Install failed:", result.error);
      
      // Show error state
      if (icon) icon.textContent = "❌";
      if (icon) icon.classList.remove("spin-animation");
      if (title) title.textContent = "Install Failed";
      if (message) message.textContent = result.error;
      
      if (installBtn) {
        installBtn.textContent = "Retry Install";
        installBtn.disabled = false;
        installBtn.style.opacity = "1";
        installBtn.style.cursor = "pointer";
      }
      
      // Show error notification
      this.showErrorNotification(result.error);
      
      return;
    }
  }

  dismissNotification(element) {
    element.remove();
  }

  minimizeDownloadWindow(notification) {
    // Hide the notification while keeping download running
    notification.classList.add("minimized");

    // Show a small indicator in the corner that can restore the window
    this.showMinimizedIndicator(notification);
  }

  showMinimizedIndicator(notification) {
    // Check if indicator already exists
    if (document.querySelector(".update-minimized-indicator")) {
      return;
    }

    const indicator = document.createElement("div");
    indicator.className = "update-minimized-indicator";
    indicator.innerHTML = `
      <button class="restore-btn" title="Show Update Window">⬆️ Update Downloading...</button>
    `;
    document.body.appendChild(indicator);

    const restoreBtn = indicator.querySelector(".restore-btn");
    restoreBtn.addEventListener("click", () => {
      notification.classList.remove("minimized");
      indicator.remove();
    });
  }
}

// Initialize when DOM is ready
const updateDialog = new UpdateDialog();
