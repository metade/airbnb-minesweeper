// Map rendering and GeoJSON handling with Leaflet
class GameMap {
  constructor() {
    this.map = null;
    this.geojsonLayer = null;
    this.geojsonData = null;
    this.cellElements = new Map();
  }

  async initializeMap() {
    try {
      // Load GeoJSON data
      await this.loadGeoJSONData();

      // Calculate map bounds from data
      const bounds = this.calculateBounds();

      // Create map with fixed view
      this.map = L.map("map", {
        zoomControl: false,
        dragging: false,
        touchZoom: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        tap: false,
      });

      // Add tile layer (background map)
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(this.map);

      // Fit map to data bounds with padding
      this.map.fitBounds(bounds, { padding: [20, 20] });

      // Create game cells from GeoJSON
      this.createGameCells();

      // Initialize the game with the loaded data
      window.minesweeperGame.initializeGame(this.geojsonData);

      // After game initialization, set up click handlers
      this.setupClickHandlers();

      console.log("Map initialized successfully");
      console.log("Total map layers:", this.map._layers);
      console.log(
        "Game cells count:",
        window.minesweeperGame.getCells().length,
      );
      return true;
    } catch (error) {
      console.error("Failed to initialize map:", error);
      this.showError(error.message);
      return false;
    }
  }

  async loadGeoJSONData() {
    const config = window.gameConfig;
    const dataURL = config.getDataURL();

    try {
      const response = await fetch(dataURL);

      if (!response.ok) {
        throw new Error(
          `Failed to load data file: ${dataURL}. Status: ${response.status}`,
        );
      }

      this.geojsonData = await response.json();

      if (
        !this.geojsonData.features ||
        this.geojsonData.features.length === 0
      ) {
        throw new Error("No grid cells found in data file");
      }

      console.log(
        `Loaded ${this.geojsonData.features.length} grid cells from ${dataURL}`,
      );
    } catch (error) {
      throw new Error(`Unable to load game data: ${error.message}`);
    }
  }

  calculateBounds() {
    let minLat = Infinity,
      maxLat = -Infinity;
    let minLng = Infinity,
      maxLng = -Infinity;

    this.geojsonData.features.forEach((feature) => {
      const coords = feature.geometry.coordinates[0];
      coords.forEach((coord) => {
        const [lng, lat] = coord;
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
        minLng = Math.min(minLng, lng);
        maxLng = Math.max(maxLng, lng);
      });
    });

    return [
      [minLat, minLng],
      [maxLat, maxLng],
    ];
  }

  createGameCells() {
    // Create custom pane for game cells to ensure they're on top
    this.map.createPane("gameCells");
    this.map.getPane("gameCells").style.zIndex = 1000;
    this.map.getPane("gameCells").style.pointerEvents = "auto";

    // Create panes with proper z-index layering
    this.map.createPane("numberMarkers");
    this.map.getPane("numberMarkers").style.zIndex = 1500;
    this.map.getPane("numberMarkers").style.pointerEvents = "none";

    this.map.createPane("tooltips");
    this.map.getPane("tooltips").style.zIndex = 2000;
    this.map.getPane("tooltips").style.pointerEvents = "none";

    // Add CSS for number markers
    if (!document.getElementById("cell-marker-styles")) {
      const style = document.createElement("style");
      style.id = "cell-marker-styles";
      style.textContent = `
        .cell-number-marker {
          background: none !important;
          border: none !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          pointer-events: none !important;
        }
      `;
      document.head.appendChild(style);
    }

    // Create rectangles directly from GeoJSON data
    this.geojsonData.features.forEach((feature) => {
      this.createCellRectangle(feature);
    });
  }

  createCellRectangle(feature) {
    const cellId = feature.properties.id;
    const props = feature.properties;

    // Create bounds from properties
    const bounds = [
      [props.bottom, props.left],
      [props.top, props.right],
    ];

    console.log("Creating rectangle for cell:", cellId, bounds);

    // Create rectangle
    const rectangle = L.rectangle(bounds, {
      pane: "gameCells",
      interactive: true,
      fillColor: "#ccc",
      weight: 2,
      opacity: 1,
      color: "#666",
      fillOpacity: 0.8,
      zIndexOffset: 1000,
    }).addTo(this.map);

    // Store references
    rectangle.featureId = cellId;
    rectangle.featureData = feature;
    this.cellElements.set(cellId, rectangle);

    // Add immediate click handler for testing
    rectangle.on("click", (e) => {
      console.log("DIRECT CLICK on rectangle for cell ID:", cellId);
      this.handleDirectCellClick(cellId, e);
    });

    rectangle.on("contextmenu", (e) => {
      console.log("DIRECT RIGHT CLICK on rectangle for cell ID:", cellId);
      this.handleDirectCellRightClick(cellId, e);
    });

    console.log("Created rectangle for cell:", cellId);
    return rectangle;
  }

  handleDirectCellClick(cellId, event) {
    if (event.originalEvent) event.originalEvent.preventDefault();

    const gameCell = window.minesweeperGame
      .getCells()
      .find((cell) => cell.feature.properties.id === cellId);

    if (gameCell) {
      console.log("Found game cell, calling handleCellClick");
      window.minesweeperGame.handleCellClick(gameCell);
    } else {
      console.error("No game cell found for ID:", cellId);
    }
  }

  handleDirectCellRightClick(cellId, event) {
    if (event.originalEvent) event.originalEvent.preventDefault();

    const gameCell = window.minesweeperGame
      .getCells()
      .find((cell) => cell.feature.properties.id === cellId);

    if (gameCell) {
      console.log("Found game cell, calling handleCellRightClick");
      window.minesweeperGame.handleCellRightClick(gameCell);
    } else {
      console.error("No game cell found for ID:", cellId);
    }
  }

  updateCellDisplay(cell) {
    if (!cell.mapOverlay) return;

    const overlay = cell.mapOverlay;
    let fillColor = "#ccc";
    let color = "#666";
    let fillOpacity = 1;

    // Remove existing number marker if any
    if (cell.numberMarker) {
      this.map.removeLayer(cell.numberMarker);
      cell.numberMarker = null;
    }

    if (cell.isFlagged) {
      fillColor = "#ff6b6b";
      color = "#cc5555";
    } else if (cell.isRevealed) {
      if (cell.isMine) {
        fillColor = "#ff4444";
        color = "#cc3333";
        // Add mine marker
        const bounds = overlay.getBounds();
        const center = bounds.getCenter();
        cell.numberMarker = L.marker(center, {
          icon: L.divIcon({
            html: "💣",
            className: "cell-number-marker",
            iconSize: [20, 20],
            iconAnchor: [10, 10],
          }),
          pane: "numberMarkers",
        }).addTo(this.map);
      } else {
        fillColor = "#fff";
        color = "#999";
        if (cell.adjacentMines > 0) {
          // Color based on number of adjacent mines
          const colors = {
            1: "#e6f3ff",
            2: "#ccf0ff",
            3: "#ffe6e6",
            4: "#e6e6ff",
            5: "#ffe6f0",
            6: "#e6ffff",
            7: "#f0f0f0",
            8: "#f5f5f5",
          };
          fillColor = colors[cell.adjacentMines] || "#fff";

          // Add number marker
          const bounds = overlay.getBounds();
          const center = bounds.getCenter();
          const numberColors = {
            1: "#0000ff",
            2: "#008000",
            3: "#ff0000",
            4: "#000080",
            5: "#800000",
            6: "#008080",
            7: "#000000",
            8: "#808080",
          };
          cell.numberMarker = L.marker(center, {
            icon: L.divIcon({
              html: `<span style="color: ${numberColors[cell.adjacentMines] || "#000"}; font-weight: bold; font-size: 14px;">${cell.adjacentMines}</span>`,
              className: "cell-number-marker",
              iconSize: [20, 20],
              iconAnchor: [10, 10],
            }),
            pane: "numberMarkers",
          }).addTo(this.map);
        }
      }
    }

    overlay.setStyle({
      fillColor: fillColor,
      color: color,
      fillOpacity: fillOpacity,
    });

    // Add tooltip for revealed cells
    let tooltipContent = "";
    if (cell.isRevealed) {
      if (cell.isMine) {
        tooltipContent = "💣 Mine!";
      } else if (cell.adjacentMines > 0) {
        tooltipContent = `${cell.adjacentMines} adjacent mines`;
      } else {
        tooltipContent = "Safe";
      }

      const config = window.gameConfig;
      const mode = config.getMode();
      const value = cell.value;
      tooltipContent += `<br/>${config.getModeDisplayName()}: ${value}`;
    } else if (cell.isFlagged) {
      tooltipContent = "🚩 Flagged";
    }

    if (tooltipContent) {
      overlay.bindTooltip(tooltipContent, {
        permanent: false,
        direction: "center",
        className: "cell-tooltip",
        pane: "tooltips",
      });
    } else {
      overlay.unbindTooltip();
    }
  }

  showError(message) {
    const errorElement = document.getElementById("error-message");
    errorElement.textContent = message;
    errorElement.classList.remove("hidden");
  }

  hideError() {
    const errorElement = document.getElementById("error-message");
    errorElement.classList.add("hidden");
  }

  hideLoading() {
    const loadingElement = document.getElementById("loading");
    loadingElement.classList.add("hidden");
  }

  setupClickHandlers() {
    console.log("Setting up click handlers...");

    // Connect map rectangles to game cells
    let handlerCount = 0;
    window.minesweeperGame.getCells().forEach((gameCell) => {
      const rectangle = this.cellElements.get(gameCell.feature.properties.id);
      if (rectangle) {
        gameCell.mapOverlay = rectangle;
        this.updateCellDisplay(gameCell);
        handlerCount++;
      } else {
        console.warn(
          "No rectangle found for game cell:",
          gameCell.feature.properties.id,
        );
      }
    });

    console.log("Connected", handlerCount, "game cells to map rectangles");
  }

  getCellElement(cellId) {
    return this.cellElements.get(cellId);
  }
}

// Global map instance
window.gameMap = new GameMap();
