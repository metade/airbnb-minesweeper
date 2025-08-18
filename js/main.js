// Main application controller
class App {
  constructor() {
    this.initialized = false;
  }

  async init() {
    try {
      console.log("Starting Airbnb Minesweeper...");

      // Update UI with config values
      this.updateConfigUI();

      // Initialize map and game
      const success = await window.gameMap.initializeMap();

      if (success) {
        this.initialized = true;
        window.gameMap.hideLoading();
        console.log("Game ready to play!");
      }
    } catch (error) {
      console.error("Failed to initialize game:", error);
      this.showError(error.message);
    }
  }

  updateConfigUI() {
    const config = window.gameConfig;

    // Update title to include city
    document.title = `Airbnb Minesweeper - ${config.getCity()}`;
  }

  showError(message) {
    window.gameMap.hideLoading();
    window.gameMap.showError(message);
  }
}

// Override the game's updateCellDisplay to use map rendering
window.minesweeperGame.updateCellDisplay = function (cell) {
  window.gameMap.updateCellDisplay(cell);
};

// Start the application when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  const app = new App();

  // Handle configuration errors
  try {
    app.init();
  } catch (error) {
    console.error("Configuration error:", error);
    app.showError(`Configuration Error: ${error.message}`);
  }
});

// Prevent context menu on the entire page
document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});
