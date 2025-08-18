// Configuration parser for URL query parameters
class GameConfig {
    constructor() {
        this.params = this.parseURLParams();
        this.validateParams();
    }

    parseURLParams() {
        const urlParams = new URLSearchParams(window.location.search);
        return {
            city: urlParams.get('city') || 'lisboa',
            gridSize: urlParams.get('gridSize') || '1000',
            mode: urlParams.get('mode') || 'listings_count',
            value: parseFloat(urlParams.get('value')) || 3
        };
    }

    validateParams() {
        // Validate city name (alphanumeric only)
        if (!/^[a-zA-Z0-9_-]+$/.test(this.params.city)) {
            throw new Error('Invalid city name. Only alphanumeric characters, hyphens, and underscores are allowed.');
        }

        // Validate grid size (numbers only)
        if (!/^\d+$/.test(this.params.gridSize)) {
            throw new Error('Invalid grid size. Must be a positive integer.');
        }

        // Validate mode
        if (!['listings_count', 'price_mean'].includes(this.params.mode)) {
            throw new Error('Invalid game mode. Must be either "listings_count" or "price_mean".');
        }

        // Validate value (must be a positive number)
        if (isNaN(this.params.value) || this.params.value <= 0) {
            throw new Error('Invalid threshold value. Must be a positive number.');
        }
    }

    getDataURL() {
        return `data/${this.params.city}_${this.params.gridSize}.geojson`;
    }

    getCity() {
        return this.params.city;
    }

    getGridSize() {
        return this.params.gridSize;
    }

    getMode() {
        return this.params.mode;
    }

    getValue() {
        return this.params.value;
    }

    getModeDisplayName() {
        switch (this.params.mode) {
            case 'listings_count':
                return 'Listings Count';
            case 'price_mean':
                return 'Average Price (€)';
            default:
                return this.params.mode;
        }
    }
}

// Global config instance
window.gameConfig = new GameConfig();
