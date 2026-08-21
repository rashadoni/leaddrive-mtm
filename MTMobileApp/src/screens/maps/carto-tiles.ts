export interface CartoTileLabels {
  loading: string
  unavailable: string
  attribution: string
}

export const CARTO_TILE_WEBVIEW_ORIGINS = [
  "about:blank",
  "https://*.basemaps.cartocdn.com",
]

function htmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function cartoTileStyles(): string {
  return `
    #map-tiles { position: absolute; inset: 0; z-index: 0; overflow: hidden; }
    .map-tile { position: absolute; width: 256px; height: 256px; max-width: none; user-select: none; -webkit-user-drag: none; }
    #map-tile-status {
      position: absolute;
      z-index: 6;
      left: 8px;
      top: 8px;
      max-width: calc(100% - 76px);
      padding: 6px 9px;
      border: 1px solid rgba(19,35,31,.12);
      border-radius: 9px;
      background: rgba(251,253,252,.95);
      color: #40544d;
      box-shadow: 0 1px 5px rgba(19,35,31,.12);
      font-size: 10px;
      line-height: 13px;
    }
    #map-tile-status[hidden] { display: none; }
    #map-attribution {
      position: absolute;
      z-index: 6;
      right: 5px;
      bottom: 4px;
      padding: 2px 5px;
      border-radius: 4px;
      background: rgba(251,253,252,.88);
      color: #40544d;
      font-size: 8px;
      line-height: 11px;
      white-space: nowrap;
    }
  `
}

export function cartoTileMarkup(labels: CartoTileLabels): string {
  return `
    <div id="map-tiles" aria-hidden="true"></div>
    <div
      id="map-tile-status"
      role="status"
      data-loading="${htmlText(labels.loading)}"
      data-unavailable="${htmlText(labels.unavailable)}"
    >${htmlText(labels.loading)}</div>
    <div id="map-attribution">${htmlText(labels.attribution)}</div>
  `
}

/**
 * Renders only raster images from CARTO. No remote JavaScript executes in the
 * WebView, navigation stays blocked, and the coordinate overlay remains useful
 * over the local grid if every tile request fails.
 */
export function cartoTileScript(): string {
  return `
      window.__renderCartoTiles = function (originX, originY, zoom, width, height) {
        var layer = document.getElementById("map-tiles");
        var status = document.getElementById("map-tile-status");
        if (!layer || !status) return;
        var generation = (window.__cartoTileGeneration || 0) + 1;
        window.__cartoTileGeneration = generation;
        layer.innerHTML = "";
        status.textContent = status.getAttribute("data-loading") || "";
        status.hidden = false;

        var tileSize = 256;
        var tileCount = Math.pow(2, zoom);
        var firstX = Math.floor(originX / tileSize);
        var lastX = Math.floor((originX + width) / tileSize);
        var firstY = Math.max(0, Math.floor(originY / tileSize));
        var lastY = Math.min(tileCount - 1, Math.floor((originY + height) / tileSize));
        var total = 0;
        var completed = 0;
        var hasLoadedTile = false;
        var subdomains = ["a", "b", "c", "d"];

        function settle(success) {
          if (window.__cartoTileGeneration !== generation) return;
          completed += 1;
          if (success && !hasLoadedTile) {
            hasLoadedTile = true;
            status.hidden = true;
          }
          if (completed >= total && !hasLoadedTile) {
            status.textContent = status.getAttribute("data-unavailable") || "";
            status.hidden = false;
          }
        }

        for (var tileY = firstY; tileY <= lastY; tileY += 1) {
          for (var tileX = firstX; tileX <= lastX; tileX += 1) {
            total += 1;
            var wrappedX = ((tileX % tileCount) + tileCount) % tileCount;
            var subdomainIndex = Math.abs(tileX + tileY) % subdomains.length;
            var image = document.createElement("img");
            image.className = "map-tile";
            image.alt = "";
            image.draggable = false;
            image.referrerPolicy = "no-referrer";
            image.style.left = (tileX * tileSize - originX) + "px";
            image.style.top = (tileY * tileSize - originY) + "px";
            image.onload = function () { settle(true); };
            image.onerror = function () { settle(false); };
            image.src = "https://" + subdomains[subdomainIndex] +
              ".basemaps.cartocdn.com/light_all/" + zoom + "/" + wrappedX + "/" + tileY + "@2x.png";
            layer.appendChild(image);
          }
        }

        if (total === 0) settle(false);
        window.setTimeout(function () {
          if (window.__cartoTileGeneration === generation && !hasLoadedTile) {
            status.textContent = status.getAttribute("data-unavailable") || "";
            status.hidden = false;
          }
        }, 8000);
      };
  `
}
