import type {
import { upper } from "../../lib/upper"
  ManagerAgentTruth,
  ManagerGpsFreshness,
  ManagerTeamAgent,
} from "../../services/manager-location-truth"
import {
  cartoTileMarkup,
  cartoTileScript,
  type CartoTileOptions,
  cartoTileStyles,
} from "../maps/carto-tiles"

export type ManagerLiveMapMarkerStatus = "CURRENT" | "LAST_KNOWN" | "STALE"

export interface ManagerLiveMapRow {
  agent: ManagerTeamAgent
  truth: ManagerAgentTruth
}

export interface ManagerLiveMapMarker {
  id: string
  name: string
  initials: string
  role: string
  workdayStatus: string | null
  latitude: number
  longitude: number
  accuracy: number | null
  battery: number | null
  recordedAt: string | null
  locationAgeMs: number | null
  isOnline: boolean
  gpsFreshness: ManagerGpsFreshness
  status: ManagerLiveMapMarkerStatus
}

export interface ManagerLiveMapModel {
  markers: ManagerLiveMapMarker[]
  totalCount: number
  currentCount: number
  lastKnownCount: number
  staleCount: number
  noCoordinatesCount: number
}

export interface ManagerLiveMapDocumentMarker extends ManagerLiveMapMarker {
  statusLabel: string
  ageLabel: string
}

export interface ManagerLiveMapDocumentLabels {
  languageCode: string
  accessibilityLabel: string
  tapHint: string
  zoomIn: string
  zoomOut: string
  fit: string
  mapLoading: string
  mapUnavailable: string
  mapAttribution: string
}

/**
 * Keeps an explicit selection while it is still present and makes the only
 * available server marker self-explanatory without requiring a first tap.
 */
export function resolveManagerLiveMapSelection(
  markers: ManagerLiveMapMarker[],
  selectedId: string | null,
): string | null {
  if (selectedId && markers.some((marker) => marker.id === selectedId)) return selectedId
  return markers.length === 1 ? markers[0].id : null
}

function validLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -85.05112878 && value <= 85.05112878
}

function validLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180
}

function markerInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"
  const first = Array.from(words[0])[0] ?? "?"
  const second = words.length > 1 ? Array.from(words[words.length - 1])[0] ?? "" : ""
  return upper(`${first}${second}`)
}

function markerStatus(truth: ManagerAgentTruth): ManagerLiveMapMarkerStatus {
  if (truth.isOnline && truth.gpsFreshness === "FRESH") return "CURRENT"
  if (truth.gpsFreshness === "STALE") return "STALE"
  return "LAST_KNOWN"
}

/**
 * Converts the already identity-bound manager truth rows into map markers.
 * A marker can only come from that employee's accepted location evidence;
 * there is intentionally no device-location or cross-employee fallback.
 */
export function buildManagerLiveMapModel(rows: ManagerLiveMapRow[]): ManagerLiveMapModel {
  const markers = rows.flatMap(({ agent, truth }): ManagerLiveMapMarker[] => {
    const location = truth.location
    if (!location || !validLatitude(location.latitude) || !validLongitude(location.longitude)) return []
    return [{
      id: agent.id,
      name: agent.name,
      initials: markerInitials(agent.name),
      role: agent.role,
      workdayStatus: agent.workday?.status ?? null,
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
      battery: location.battery,
      recordedAt: location.recordedAt,
      locationAgeMs: truth.locationAgeMs,
      isOnline: truth.isOnline,
      gpsFreshness: truth.gpsFreshness,
      status: markerStatus(truth),
    }]
  })

  const currentCount = markers.filter((marker) => marker.status === "CURRENT").length
  const staleCount = markers.filter((marker) => marker.status === "STALE").length
  return {
    markers,
    totalCount: rows.length,
    currentCount,
    lastKnownCount: markers.length - currentCount,
    staleCount,
    noCoordinatesCount: Math.max(0, rows.length - markers.length),
  }
}

function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")
}

function htmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/**
 * Raster basemap plus a separate server-evidence marker layer. No remote
 * JavaScript or device location is used; markers remain visible over the
 * fallback grid if every map image fails.
 */
export function buildManagerLiveMapDocument(
  markers: ManagerLiveMapDocumentMarker[],
  labels: ManagerLiveMapDocumentLabels,
  tiles: CartoTileOptions = {},
): string {
  const safeMarkers = markers.map((marker) => ({
    id: marker.id,
    name: marker.name,
    initials: marker.initials,
    latitude: marker.latitude,
    longitude: marker.longitude,
    status: marker.status,
    statusLabel: marker.statusLabel,
    ageLabel: marker.ageLabel,
  }))

  return `<!doctype html>
<html lang="${htmlText(labels.languageCode)}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https://*.basemaps.cartocdn.com data:; connect-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <style>
    * { box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; margin: 0; overflow: hidden; }
    button { font: inherit; }
    #map {
      position: relative;
      background-color: #dfeae5;
      background-image:
        linear-gradient(rgba(8,112,90,.09) 1px, transparent 1px),
        linear-gradient(90deg, rgba(8,112,90,.09) 1px, transparent 1px);
      background-size: 28px 28px;
      color: #13231f;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    #markers { position: absolute; z-index: 2; inset: 0; }
    #markers { pointer-events: none; }
    .marker {
      position: absolute;
      width: 48px;
      height: 48px;
      padding: 0;
      border: 0;
      background: transparent;
      transform: translate(-50%, -50%);
      pointer-events: auto;
      touch-action: manipulation;
    }
    .marker-pin {
      display: flex;
      width: 34px;
      height: 34px;
      margin: 7px;
      align-items: center;
      justify-content: center;
      border: 3px solid #fbfdfc;
      border-radius: 50% 50% 50% 14%;
      box-shadow: 0 2px 7px rgba(19,35,31,.28);
      color: #fbfdfc;
      font-size: 10px;
      font-weight: 900;
      transform: rotate(-45deg);
    }
    .marker-pin span { transform: rotate(45deg); }
    .marker[data-status="CURRENT"] .marker-pin { background: #1c7a50; }
    .marker[data-status="LAST_KNOWN"] .marker-pin { background: #2e73d2; }
    .marker[data-status="STALE"] .marker-pin { background: #8b5a00; border-style: dashed; }
    .marker[data-selected="true"] .marker-pin {
      outline: 3px solid rgba(19,35,31,.32);
      outline-offset: 3px;
      transform: rotate(-45deg) scale(1.08);
    }
    #controls {
      position: absolute;
      z-index: 5;
      top: 10px;
      right: 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .map-control {
      width: 44px;
      height: 44px;
      border: 1px solid #b8c9c1;
      border-radius: 12px;
      background: rgba(251,253,252,.96);
      color: #055342;
      box-shadow: 0 1px 5px rgba(19,35,31,.14);
      font-size: 21px;
      font-weight: 900;
    }
    #popup {
      position: absolute;
      z-index: 4;
      top: 10px;
      left: 10px;
      right: 66px;
      max-width: 340px;
      padding: 10px 12px;
      border: 1px solid rgba(19,35,31,.14);
      border-radius: 13px;
      background: rgba(251,253,252,.96);
      box-shadow: 0 2px 10px rgba(19,35,31,.16);
    }
    #popup[hidden] { display: none; }
    #popup-name { margin: 0 0 3px; color: #13231f; font-size: 14px; font-weight: 900; }
    #popup-meta { margin: 0; color: #40544d; font-size: 11px; line-height: 15px; }
    .map-note {
      position: absolute;
      z-index: 3;
      bottom: 8px;
      padding: 5px 8px;
      border-radius: 8px;
      background: rgba(251,253,252,.9);
      color: #40544d;
      font-size: 10px;
      line-height: 13px;
      box-shadow: 0 1px 5px rgba(19,35,31,.12);
    }
    .map-note { left: 8px; right: 8px; max-width: 520px; }
    ${cartoTileStyles()}
  </style>
</head>
<body>
  <main id="map" role="region" aria-label="${htmlText(labels.accessibilityLabel)}">
    ${cartoTileMarkup({
      loading: labels.mapLoading,
      unavailable: labels.mapUnavailable,
      attribution: labels.mapAttribution,
    })}
    <div id="markers"></div>
    <section id="popup" aria-live="polite" hidden>
      <p id="popup-name"></p>
      <p id="popup-meta"></p>
    </section>
    <div id="controls">
      <button id="zoom-in" class="map-control" type="button" aria-label="${htmlText(labels.zoomIn)}">+</button>
      <button id="zoom-out" class="map-control" type="button" aria-label="${htmlText(labels.zoomOut)}">−</button>
      <button id="fit" class="map-control" type="button" aria-label="${htmlText(labels.fit)}">◎</button>
    </div>
    <div class="map-note">${htmlText(labels.tapHint)}</div>
  </main>
  <script>
    ${cartoTileScript(tiles)}
    (function () {
      var markers = ${scriptJson(safeMarkers)};
      var worldUnit = 256;
      var zoomOverride = null;
      var selectedId = null;

      function post(message) {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify(message));
        }
      }

      function project(marker, zoom) {
        var scale = worldUnit * Math.pow(2, zoom);
        var latitude = Math.max(-85.05112878, Math.min(85.05112878, marker.latitude));
        var sin = Math.sin(latitude * Math.PI / 180);
        return {
          x: (marker.longitude + 180) / 360 * scale,
          y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale
        };
      }

      function fitZoom(width, height) {
        if (markers.length <= 1) return 15;
        for (var zoom = 17; zoom >= 2; zoom -= 1) {
          var projected = markers.map(function (marker) { return project(marker, zoom); });
          var xs = projected.map(function (point) { return point.x; });
          var ys = projected.map(function (point) { return point.y; });
          if (Math.max.apply(null, xs) - Math.min.apply(null, xs) <= width - 96 &&
              Math.max.apply(null, ys) - Math.min.apply(null, ys) <= height - 120) return zoom;
        }
        return 2;
      }

      function spreadOverlaps(points) {
        var buckets = {};
        points.forEach(function (point, index) {
          var key = Math.round(point.x / 18) + ":" + Math.round(point.y / 18);
          if (!buckets[key]) buckets[key] = [];
          buckets[key].push(index);
        });
        Object.keys(buckets).forEach(function (key) {
          var indexes = buckets[key];
          if (indexes.length < 2) return;
          indexes.forEach(function (pointIndex, position) {
            var angle = -Math.PI / 2 + position * Math.PI * 2 / indexes.length;
            var radius = Math.min(30, 18 + indexes.length * 2);
            points[pointIndex].x += Math.cos(angle) * radius;
            points[pointIndex].y += Math.sin(angle) * radius;
          });
        });
        return points;
      }

      function selectMarker(marker) {
        selectedId = marker.id;
        var popup = document.getElementById("popup");
        document.getElementById("popup-name").textContent = marker.name;
        document.getElementById("popup-meta").textContent = marker.statusLabel + " · " + marker.ageLabel;
        popup.hidden = false;
        Array.prototype.forEach.call(document.querySelectorAll(".marker"), function (button) {
          var selected = button.getAttribute("data-id") === selectedId;
          button.setAttribute("data-selected", selected ? "true" : "false");
          button.setAttribute("aria-pressed", selected ? "true" : "false");
        });
        post({ type: "marker", id: marker.id });
      }

      window.__selectManagerMarker = function (id) {
        var marker = markers.find(function (item) { return item.id === id; });
        if (marker) selectMarker(marker);
      };

      function render() {
        if (!markers.length) return;
        var width = Math.max(document.documentElement.clientWidth, window.innerWidth || 320);
        var height = Math.max(document.documentElement.clientHeight, window.innerHeight || 280);
        var zoom = zoomOverride == null ? fitZoom(width, height) : zoomOverride;
        var projected = markers.map(function (marker) { return project(marker, zoom); });
        var xs = projected.map(function (point) { return point.x; });
        var ys = projected.map(function (point) { return point.y; });
        var centerX = (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2;
        var centerY = (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2;
        var originX = centerX - width / 2;
        var originY = centerY - height / 2;
        window.__renderCartoTiles(originX, originY, zoom, width, height);
        var screenPoints = spreadOverlaps(projected.map(function (point) {
          return { x: point.x - originX, y: point.y - originY };
        }));

        var markerLayer = document.getElementById("markers");
        markerLayer.innerHTML = "";
        markers.forEach(function (marker, index) {
          var point = screenPoints[index];
          var button = document.createElement("button");
          button.type = "button";
          button.className = "marker";
          button.setAttribute("data-id", marker.id);
          button.setAttribute("data-status", marker.status);
          button.setAttribute("data-selected", marker.id === selectedId ? "true" : "false");
          button.setAttribute("aria-pressed", marker.id === selectedId ? "true" : "false");
          button.setAttribute("aria-label", marker.name + ", " + marker.statusLabel + ", " + marker.ageLabel);
          button.style.left = point.x + "px";
          button.style.top = point.y + "px";
          var pin = document.createElement("span");
          pin.className = "marker-pin";
          var initials = document.createElement("span");
          initials.textContent = marker.initials;
          pin.appendChild(initials);
          button.appendChild(pin);
          button.onclick = function () { selectMarker(marker); };
          markerLayer.appendChild(button);
        });
        if (markers.length === 1 && selectedId === null) selectMarker(markers[0]);
      }

      document.getElementById("zoom-in").onclick = function () {
        var base = zoomOverride == null ? fitZoom(window.innerWidth, window.innerHeight) : zoomOverride;
        zoomOverride = Math.min(18, base + 1);
        render();
      };
      document.getElementById("zoom-out").onclick = function () {
        var base = zoomOverride == null ? fitZoom(window.innerWidth, window.innerHeight) : zoomOverride;
        zoomOverride = Math.max(2, base - 1);
        render();
      };
      document.getElementById("fit").onclick = function () {
        zoomOverride = null;
        render();
      };
      window.addEventListener("resize", render);
      render();
    }());
  </script>
</body>
</html>`
}
