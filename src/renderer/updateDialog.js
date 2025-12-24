// Update Dialog Manager
class UpdateDialog {
  constructor() {
    this.isUpdateAvailable = false;
    this.isDownloading = false;
    this.isUpdateDownloaded = false;
    this.updateVersion = null;
    this.setupListeners();
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
      console.log(`📊 Download progress: ${data.percent}%`);
      this.updateDownloadProgress(data.percent);
    });

    // Listen for update downloaded
    window.electronAPI.onUpdateDownloaded(() => {
      console.log("✅ Update downloaded and ready to install");
      this.showUpdateReadyNotification();
    });

    // Listen for update error
    window.electronAPI.onUpdateError((data) => {
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

    downloadBtn.addEventListener("click", () =>
      this.downloadUpdate(notification, downloadBtn, laterBtn)
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

    this.isUpdateDownloaded = true;
    this.showInstallDownloadedButton();

    const notification = document.createElement("div");
    notification.className = "update-notification update-notification-ready";
    notification.innerHTML = `
      <div class="update-notification-content">
        <div class="update-notification-header">
          <span class="update-icon">✅</span>
          <span class="update-title">Update Ready to Install</span>
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

    installBtn.addEventListener("click", () =>
      this.installUpdate(notification)
    );
    laterBtn.addEventListener("click", () =>
      this.dismissNotification(notification)
    );
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

  async downloadUpdate(notification, downloadBtn, laterBtn) {
    this.isDownloading = true;

    // Update button texts during download
    downloadBtn.textContent = "Downloading";
    downloadBtn.disabled = true;
    laterBtn.textContent = "Cancel Download";

    // Change later button to cancel download
    const cancelHandler = () => this.cancelDownload(notification);
    laterBtn.removeEventListener("click", laterBtn.laterListener);
    laterBtn.addEventListener("click", cancelHandler);
    laterBtn.laterListener = cancelHandler;

    const result = await window.electronAPI.startUpdateDownload();
    if (!result.ok) {
      console.error("Download failed:", result.error);
      this.resetDownloadButtons(notification, downloadBtn, laterBtn);
    }
  }

  cancelDownload(notification) {
    this.isDownloading = false;
    window.electronAPI.cancelUpdateDownload();

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
  }

  resetDownloadButtons(notification, downloadBtn, laterBtn) {
    downloadBtn.textContent = "Download & Update";
    downloadBtn.disabled = false;
    laterBtn.textContent = "Later";

    // Clear progress bar if it exists
    const progressContainer = notification.querySelector(".progress-container");
    if (progressContainer) {
      progressContainer.remove();
    }
  }

  installUpdate(notification) {
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
    window.electronAPI.installUpdate();
  }

  dismissNotification(element) {
    element.remove();
  }
}

// Initialize when DOM is ready
const updateDialog = new UpdateDialog();
