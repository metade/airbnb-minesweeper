// Core minesweeper game logic
class MinesweeperGame {
  constructor() {
    this.cells = [];
    this.gameState = "ready"; // 'ready', 'playing', 'won', 'lost'
    this.mineCount = 0;
    this.flagCount = 0;
    this.revealedCount = 0;
    this.startTime = null;
    this.timer = null;
    this.timerInterval = null;

    this.boundCellClick = this.handleCellClick.bind(this);
    this.boundCellRightClick = this.handleCellRightClick.bind(this);
  }

  initializeGame(geojsonData) {
    console.log("Starting game initialization with data:", geojsonData);
    this.resetGame();
    this.processGeoJSONData(geojsonData);
    this.calculateAdjacentMines();
    this.updateUI();
    console.log(
      `Game initialized: ${this.cells.length} cells, ${this.mineCount} mines`,
    );
    console.log("First few cells:", this.cells.slice(0, 3));
  }

  resetGame() {
    this.cells = [];
    this.gameState = "ready";
    this.mineCount = 0;
    this.flagCount = 0;
    this.revealedCount = 0;
    this.startTime = null;
    this.timer = 0;
    this.stopTimer();
  }

  processGeoJSONData(geojsonData) {
    const config = window.gameConfig;
    const mode = config.getMode();
    const threshold = config.getValue();

    console.log(
      `Processing ${geojsonData.features.length} features, mode: ${mode}, threshold: ${threshold}`,
    );

    geojsonData.features.forEach((feature, index) => {
      const props = feature.properties;
      const value = props[mode];
      const isMine = value >= threshold;

      if (isMine) {
        this.mineCount++;
      }

      const cell = {
        id: props.id || index,
        feature: feature,
        value: value,
        isMine: isMine,
        isRevealed: false,
        isFlagged: false,
        adjacentMines: 0,
        element: null,
      };

      this.cells.push(cell);

      if (index < 3) {
        console.log(`Cell ${index}:`, cell);
      }
    });

    console.log(`Created ${this.cells.length} cells, ${this.mineCount} mines`);
  }

  calculateAdjacentMines() {
    this.cells.forEach((cell) => {
      if (!cell.isMine) {
        cell.adjacentMines = this.countAdjacentMines(cell);
      }
    });
  }

  countAdjacentMines(targetCell) {
    let count = 0;
    const targetBounds = this.getCellBounds(targetCell);

    this.cells.forEach((cell) => {
      if (cell !== targetCell && cell.isMine) {
        const cellBounds = this.getCellBounds(cell);
        if (this.areCellsAdjacent(targetBounds, cellBounds)) {
          count++;
        }
      }
    });

    return count;
  }

  getCellBounds(cell) {
    const props = cell.feature.properties;
    return {
      left: props.left,
      right: props.right,
      top: props.top,
      bottom: props.bottom,
    };
  }

  areCellsAdjacent(bounds1, bounds2) {
    // Check if two rectangular cells are adjacent (share a border or corner)
    const tolerance = 0.0001; // Small tolerance for floating point comparison

    // Check if they overlap or are adjacent horizontally
    const horizontallyAdjacent =
      Math.abs(bounds1.right - bounds2.left) < tolerance ||
      Math.abs(bounds1.left - bounds2.right) < tolerance ||
      (bounds1.left < bounds2.right && bounds1.right > bounds2.left);

    // Check if they overlap or are adjacent vertically
    const verticallyAdjacent =
      Math.abs(bounds1.top - bounds2.bottom) < tolerance ||
      Math.abs(bounds1.bottom - bounds2.top) < tolerance ||
      (bounds1.bottom < bounds2.top && bounds1.top > bounds2.bottom);

    // They are adjacent if they are close both horizontally and vertically
    return (
      horizontallyAdjacent &&
      verticallyAdjacent &&
      !(
        bounds1.left === bounds2.left &&
        bounds1.right === bounds2.right &&
        bounds1.top === bounds2.top &&
        bounds1.bottom === bounds2.bottom
      )
    );
  }

  attachCellElement(cell, element) {
    cell.element = element;
    element.addEventListener("click", (e) => {
      e.preventDefault();
      this.handleCellClick(cell);
    });
    element.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.handleCellRightClick(cell);
    });
  }

  handleCellClick(cell) {
    console.log("GAME handleCellClick called with cell:", cell);

    if (this.gameState === "won" || this.gameState === "lost") {
      console.log("Game already over, ignoring click");
      return;
    }

    if (cell.isFlagged || cell.isRevealed) {
      console.log("Cell already flagged or revealed, ignoring click");
      return;
    }

    if (this.gameState === "ready") {
      console.log("Starting game...");
      this.startGame();
    }

    console.log("Revealing cell:", cell.id);
    this.revealCell(cell);

    if (cell.isMine) {
      console.log("Hit a mine! Game over.");
      this.gameOver(false);
    } else {
      if (cell.adjacentMines === 0) {
        console.log("Empty cell, revealing adjacent cells");
        this.revealAdjacentCells(cell);
      }
      this.checkWinCondition();
    }

    this.updateUI();
  }

  handleCellRightClick(cell) {
    if (this.gameState === "won" || this.gameState === "lost") {
      return;
    }

    if (cell.isRevealed) {
      return;
    }

    if (this.gameState === "ready") {
      this.startGame();
    }

    this.toggleFlag(cell);
    this.updateUI();
  }

  startGame() {
    this.gameState = "playing";
    this.startTime = Date.now();
    this.startTimer();
  }

  revealCell(cell) {
    if (cell.isRevealed || cell.isFlagged) {
      return;
    }

    cell.isRevealed = true;
    this.revealedCount++;
    this.updateCellDisplay(cell);
  }

  revealAdjacentCells(cell) {
    const cellBounds = this.getCellBounds(cell);

    this.cells.forEach((adjacentCell) => {
      if (
        adjacentCell !== cell &&
        !adjacentCell.isRevealed &&
        !adjacentCell.isFlagged
      ) {
        const adjacentBounds = this.getCellBounds(adjacentCell);
        if (this.areCellsAdjacent(cellBounds, adjacentBounds)) {
          this.revealCell(adjacentCell);
          if (adjacentCell.adjacentMines === 0 && !adjacentCell.isMine) {
            this.revealAdjacentCells(adjacentCell);
          }
        }
      }
    });
  }

  toggleFlag(cell) {
    if (cell.isRevealed) {
      return;
    }

    cell.isFlagged = !cell.isFlagged;
    this.flagCount += cell.isFlagged ? 1 : -1;
    this.updateCellDisplay(cell);
  }

  updateCellDisplay(cell) {
    if (!cell.element) return;

    const element = cell.element;

    // Reset classes
    element.className = "game-cell";
    element.innerHTML = "";

    if (cell.isFlagged) {
      element.classList.add("cell-flagged");
    } else if (cell.isRevealed) {
      element.classList.add("cell-revealed");

      if (cell.isMine) {
        element.classList.add("cell-mine");
      } else if (cell.adjacentMines > 0) {
        element.textContent = cell.adjacentMines;
        element.classList.add(`cell-number-${cell.adjacentMines}`);
      }
    } else {
      element.classList.add("cell-hidden");
    }
  }

  checkWinCondition() {
    const totalSafeCells = this.cells.length - this.mineCount;
    if (this.revealedCount === totalSafeCells) {
      this.gameOver(true);
    }
  }

  gameOver(won) {
    this.gameState = won ? "won" : "lost";
    this.stopTimer();

    if (!won) {
      // Reveal all mines
      this.cells.forEach((cell) => {
        if (cell.isMine && !cell.isFlagged) {
          cell.isRevealed = true;
          this.updateCellDisplay(cell);
        }
      });
    }

    this.updateUI();
  }

  startTimer() {
    this.timerInterval = setInterval(() => {
      this.timer = Math.floor((Date.now() - this.startTime) / 1000);
      this.updateTimerDisplay();
    }, 1000);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  updateTimerDisplay() {
    const minutes = Math.floor(this.timer / 60);
    const seconds = this.timer % 60;
    const display = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    // Timer display removed for minimal UI
    console.log(`Game Time: ${display}`);
  }

  updateUI() {
    // Update game status in console for debugging
    console.log(
      `Game State: ${this.gameState}, Mines: ${this.mineCount}, Flags: ${this.flagCount}, Revealed: ${this.revealedCount}`,
    );

    // Update timer if playing
    if (this.gameState === "playing") {
      this.updateTimerDisplay();
    }
  }

  getCells() {
    return this.cells;
  }

  getGameState() {
    return this.gameState;
  }

  getMineCount() {
    return this.mineCount;
  }
}

// Global game instance
window.minesweeperGame = new MinesweeperGame();
