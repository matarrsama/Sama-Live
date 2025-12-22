// Update Dialog Manager
class UpdateDialog {
  constructor() {
    this.isUpdateAvailable = false;
    this.isDownloading = false;
    this.updateVersion = null;
    this.setupListeners();
  }

  setupListeners() {
    // Listen for update available
    window.electronAPI.onUpdateAvailable((data) => {
      this.isUpdateAvailable = true;
      this.updateVersion = data.version;
      this.showUpdateNotification(data.version);
    });

    // Listen for download progress
    window.electronAPI.onUpdateDownloadProgress((data) => {
      this.updateDownloadProgress(data.percent);
    });

    // Listen for update downloaded
    window.electronAPI.onUpdateDownloaded(() => {
      this.showUpdateReadyNotification();
    });

    // Listen for update error
    window.electronAPI.onUpdateError((data) => {
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
          <button class="update-close-btn" onclick="updateDialog.dismissNotification(this.parentElement.parentElement)">×</button>
        </div>
        <p class="update-message">Version <strong>${version}</strong> is available. Would you like to download and install it?</p>
        <div class="update-actions">
          <button class="btn-update-download" onclick="updateDialog.downloadUpdate()">Download & Update</button>
          <button class="btn-update-later" onclick="updateDialog.dismissNotification(this.parentElement.parentElement)">Later</button>
        </div>
      </div>
    `;
    document.body.appendChild(notification);
  }

  showUpdateReadyNotification() {
    const notification = document.createElement("div");
    notification.className = "update-notification update-notification-ready";
    notification.innerHTML = `
      <div class="update-notification-content">
        <div class="update-notification-header">
          <span class="update-icon">✅</span>
          <span class="update-title">Update Ready to Install</span>
        </div>
        <p class="update-message">The update has been downloaded. Restart the app to apply the changes.</p>
        <div class="update-actions">
          <button class="btn-update-install" onclick="updateDialog.installUpdate()">Restart & Install</button>
          <button class="btn-update-later" onclick="updateDialog.dismissNotification(this.parentElement.parentElement)">Later</button>
        </div>
      </div>
    `;
    document.body.appendChild(notification);
  }

  showErrorNotification(message) {
    const notification = document.createElement("div");
    notification.className = "update-notification update-notification-error";
    notification.innerHTML = `
      <div class="update-notification-content">
        <div class="update-notification-header">
          <span class="update-icon">⚠️</span>
          <span class="update-title">Update Error</span>
          <button class="update-close-btn" onclick="updateDialog.dismissNotification(this.parentElement.parentElement)">×</button>
        </div>
        <p class="update-message">${message}</p>
        <div class="update-actions">
          <button class="btn-update-later" onclick="updateDialog.dismissNotification(this.parentElement.parentElement)">Dismiss</button>
        </div>
      </div>
    `;
    document.body.appendChild(notification);
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

  async downloadUpdate() {
    this.isDownloading = true;
    const result = await window.electronAPI.startUpdateDownload();
    if (!result.ok) {
      console.error("Download failed:", result.error);
    }
  }

  installUpdate() {
    window.electronAPI.installUpdate();
  }

  dismissNotification(element) {
    element.remove();
  }
}

// Initialize when DOM is ready
const updateDialog = new UpdateDialog();
