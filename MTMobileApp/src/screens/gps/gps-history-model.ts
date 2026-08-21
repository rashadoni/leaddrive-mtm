import type { GpsPoint } from "../../services/gps-history"

export interface GpsTimelinePoint extends GpsPoint {
  sourceIndex: number
  timestampMs: number | null
  playbackIndex: number | null
}

export interface GpsPlaybackPoint extends GpsTimelinePoint {
  latitude: number
  longitude: number
  playbackIndex: number
}

export interface GpsPlaybackModel {
  timelinePoints: GpsTimelinePoint[]
  routePoints: GpsPlaybackPoint[]
  routeSegments: GpsPlaybackPoint[][]
  excludedPointCount: number
  missingCoordinateCount: number
  invalidTimestampCount: number
  gpsGapCount: number
  gapThresholdSeconds: number
  startedAt: string | null
  endedAt: string | null
  durationSeconds: number | null
}

export interface GpsPlaybackSelection {
  index: number
  point: GpsPlaybackPoint | null
  progress: number
  isFirst: boolean
  isLast: boolean
}

export interface GpsRouteDocumentLabels {
  language: string
  routeLabel: string
  start: string
  end: string
  current: string
  localSchemeHint: string
}

const DEFAULT_GPS_GAP_SECONDS = 10 * 60
const MINIMUM_GPS_GAP_SECONDS = 5 * 60

function timestamp(value: string): number | null {
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

function validLatitude(value: number | undefined): value is number {
  return value != null && Number.isFinite(value) && value >= -85.05112878 && value <= 85.05112878
}

function validLongitude(value: number | undefined): value is number {
  return value != null && Number.isFinite(value) && value >= -180 && value <= 180
}

/**
 * Produces the one chronological model shared by the timeline, selected-point
 * detail and route playback. Points without usable coordinates or a valid
 * timestamp stay visible in the timeline, but are deliberately excluded from
 * the drawn route.
 */
export function createGpsPlaybackModel(
  points: GpsPoint[],
  gpsIntervalSeconds?: number,
): GpsPlaybackModel {
  const ordered = points
    .map((point, sourceIndex) => ({
      ...point,
      sourceIndex,
      timestampMs: timestamp(point.recordedAt),
    }))
    .sort((left, right) => {
      if (left.timestampMs == null && right.timestampMs == null) return left.sourceIndex - right.sourceIndex
      if (left.timestampMs == null) return 1
      if (right.timestampMs == null) return -1
      return left.timestampMs - right.timestampMs || left.sourceIndex - right.sourceIndex
    })

  const expectedInterval = gpsIntervalSeconds != null && Number.isFinite(gpsIntervalSeconds) && gpsIntervalSeconds > 0
    ? gpsIntervalSeconds
    : null
  const gapThresholdSeconds = expectedInterval == null
    ? DEFAULT_GPS_GAP_SECONDS
    : Math.max(MINIMUM_GPS_GAP_SECONDS, expectedInterval * 3)
  const routePoints: GpsPlaybackPoint[] = []
  let missingCoordinateCount = 0
  let invalidTimestampCount = 0
  const timelinePoints: GpsTimelinePoint[] = ordered.map((point) => {
    const coordinatesValid = validLatitude(point.latitude) && validLongitude(point.longitude)
    if (!coordinatesValid) missingCoordinateCount += 1
    if (point.timestampMs == null) invalidTimestampCount += 1
    if (!coordinatesValid || point.timestampMs == null) {
      return { ...point, playbackIndex: null }
    }

    const playbackPoint: GpsPlaybackPoint = {
      ...point,
      latitude: point.latitude,
      longitude: point.longitude,
      playbackIndex: routePoints.length,
    }
    routePoints.push(playbackPoint)
    return playbackPoint
  })

  const routeSegments: GpsPlaybackPoint[][] = []
  let gpsGapCount = 0
  for (const point of routePoints) {
    const activeSegment = routeSegments[routeSegments.length - 1]
    const previous = activeSegment?.[activeSegment.length - 1]
    if (
      previous?.timestampMs != null &&
      point.timestampMs != null &&
      (point.timestampMs - previous.timestampMs) / 1000 > gapThresholdSeconds
    ) {
      gpsGapCount += 1
      routeSegments.push([point])
    } else if (activeSegment) {
      activeSegment.push(point)
    } else {
      routeSegments.push([point])
    }
  }

  const first = routePoints[0] ?? null
  const last = routePoints[routePoints.length - 1] ?? null
  const durationSeconds = first?.timestampMs != null && last?.timestampMs != null
    ? Math.max(0, Math.round((last.timestampMs - first.timestampMs) / 1000))
    : null

  return {
    timelinePoints,
    routePoints,
    routeSegments,
    excludedPointCount: timelinePoints.length - routePoints.length,
    missingCoordinateCount,
    invalidTimestampCount,
    gpsGapCount,
    gapThresholdSeconds,
    startedAt: first?.recordedAt ?? null,
    endedAt: last?.recordedAt ?? null,
    durationSeconds,
  }
}

export function selectGpsPlaybackPoint(
  model: GpsPlaybackModel,
  requestedIndex: number,
): GpsPlaybackSelection {
  const lastIndex = model.routePoints.length - 1
  if (lastIndex < 0) {
    return { index: 0, point: null, progress: 0, isFirst: true, isLast: true }
  }

  const requested = Number.isFinite(requestedIndex) ? Math.trunc(requestedIndex) : 0
  const index = Math.max(0, Math.min(requested, lastIndex))
  return {
    index,
    point: model.routePoints[index],
    progress: lastIndex === 0 ? 1 : index / lastIndex,
    isFirst: index === 0,
    isLast: index === lastIndex,
  }
}

function scriptJson(value: unknown): string {
  return (JSON.stringify(value) ?? "null")
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
 * Builds a dependency-free, local-only route view for react-native-webview.
 * It intentionally makes no network requests: factual route segments and
 * markers remain visible over a neutral grid with no third-party disclosure.
 */
export function buildGpsRouteDocument(
  routeSegments: GpsPlaybackPoint[][],
  labels: GpsRouteDocumentLabels,
): string {
  const coordinateSegments = routeSegments.map((segment) => segment.map((point) => ({
    latitude: point.latitude,
    longitude: point.longitude,
  })))

  return `<!doctype html>
<html lang="${htmlText(labels.language)}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; connect-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <style>
    * { box-sizing: border-box; }
    html, body, #route { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #dfeae5; }
    #route {
      position: relative;
      background-color: #dfeae5;
      background-image:
        linear-gradient(rgba(8,112,90,.09) 1px, transparent 1px),
        linear-gradient(90deg, rgba(8,112,90,.09) 1px, transparent 1px);
      background-size: 28px 28px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    #overlay { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
    .map-note {
      position: absolute;
      z-index: 3;
      left: 8px;
      right: 8px;
      bottom: 8px;
      width: fit-content;
      max-width: calc(100% - 16px);
      padding: 5px 8px;
      border-radius: 8px;
      background: rgba(251,253,252,.92);
      color: #40544d;
      font-size: 10px;
      line-height: 13px;
      box-shadow: 0 1px 5px rgba(19,35,31,.12);
    }
  </style>
</head>
<body>
  <div id="route">
    <svg id="overlay" role="img" aria-label="${htmlText(labels.routeLabel)}"></svg>
    <div class="map-note">${htmlText(labels.localSchemeHint)}</div>
  </div>
  <script>
    (function () {
      var segments = ${scriptJson(coordinateSegments)};
      var labels = ${scriptJson(labels)};
      var points = [].concat.apply([], segments);
      var selectedIndex = 0;
      var screenPoints = [];
      var screenSegments = [];
      var tileSize = 256;
      var svgNs = "http://www.w3.org/2000/svg";

      function project(point, zoom) {
        var scale = tileSize * Math.pow(2, zoom);
        var latitude = Math.max(-85.05112878, Math.min(85.05112878, point.latitude));
        var sin = Math.sin(latitude * Math.PI / 180);
        return {
          x: (point.longitude + 180) / 360 * scale,
          y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale
        };
      }

      function fitZoom(width, height) {
        if (points.length <= 1) return 16;
        for (var zoom = 18; zoom >= 2; zoom -= 1) {
          var projected = points.map(function (point) { return project(point, zoom); });
          var xs = projected.map(function (point) { return point.x; });
          var ys = projected.map(function (point) { return point.y; });
          if (Math.max.apply(null, xs) - Math.min.apply(null, xs) <= width - 72 &&
              Math.max.apply(null, ys) - Math.min.apply(null, ys) <= height - 72) return zoom;
        }
        return 2;
      }

      function svgElement(name, attributes) {
        var element = document.createElementNS(svgNs, name);
        Object.keys(attributes).forEach(function (key) { element.setAttribute(key, String(attributes[key])); });
        return element;
      }

      function marker(overlay, point, color, radius, label) {
        var group = svgElement("g", {});
        group.appendChild(svgElement("circle", { cx: point.x, cy: point.y, r: radius + 4, fill: "#fbfdfc", opacity: .95 }));
        group.appendChild(svgElement("circle", { cx: point.x, cy: point.y, r: radius, fill: color, stroke: "#fbfdfc", "stroke-width": 2 }));
        var text = svgElement("text", {
          x: point.x + radius + 7,
          y: point.y + 4,
          fill: "#13231f",
          stroke: "#fbfdfc",
          "stroke-width": 4,
          "paint-order": "stroke",
          "font-size": 12,
          "font-weight": 800
        });
        text.textContent = label;
        group.appendChild(text);
        overlay.appendChild(group);
        return group;
      }

      function drawRouteSegment(overlay, segment) {
        if (!segment.length) return;
        var polyline = segment.map(function (point) { return point.x + "," + point.y; }).join(" ");
        if (segment.length > 1) {
          overlay.appendChild(svgElement("polyline", {
            points: polyline,
            fill: "none",
            stroke: "#fbfdfc",
            "stroke-width": 10,
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
            opacity: .92
          }));
          overlay.appendChild(svgElement("polyline", {
            points: polyline,
            fill: "none",
            stroke: "#08705a",
            "stroke-width": 5,
            "stroke-linecap": "round",
            "stroke-linejoin": "round"
          }));
        }
        segment.forEach(function (point) {
          overlay.appendChild(svgElement("circle", { cx: point.x, cy: point.y, r: 3, fill: "#08705a", opacity: .82 }));
        });
      }

      function updateCurrentMarker() {
        var old = document.getElementById("current-marker");
        if (old && old.parentNode) old.parentNode.removeChild(old);
        if (!screenPoints.length) return;
        selectedIndex = Math.max(0, Math.min(selectedIndex, screenPoints.length - 1));
        var overlay = document.getElementById("overlay");
        var point = screenPoints[selectedIndex];
        var group = marker(overlay, point, "#a43b25", 8, labels.current);
        group.setAttribute("id", "current-marker");
        var pulse = svgElement("circle", {
          cx: point.x,
          cy: point.y,
          r: 15,
          fill: "none",
          stroke: "#a43b25",
          "stroke-width": 3,
          opacity: .36
        });
        group.insertBefore(pulse, group.firstChild);
      }

      function render() {
        if (!points.length) return;
        var width = Math.max(document.documentElement.clientWidth, window.innerWidth || 320);
        var height = Math.max(document.documentElement.clientHeight, window.innerHeight || 240);
        var zoom = fitZoom(width, height);
        var projectedSegments = segments.map(function (segment) {
          return segment.map(function (point) { return project(point, zoom); });
        });
        var projected = [].concat.apply([], projectedSegments);
        var xs = projected.map(function (point) { return point.x; });
        var ys = projected.map(function (point) { return point.y; });
        var centerX = (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2;
        var centerY = (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2;
        var originX = centerX - width / 2;
        var originY = centerY - height / 2;
        screenSegments = projectedSegments.map(function (segment) {
          return segment.map(function (point) { return { x: point.x - originX, y: point.y - originY }; });
        });
        screenPoints = [].concat.apply([], screenSegments);

        var overlay = document.getElementById("overlay");
        overlay.setAttribute("viewBox", "0 0 " + width + " " + height);
        overlay.innerHTML = "";
        screenSegments.forEach(function (segment) { drawRouteSegment(overlay, segment); });
        marker(overlay, screenPoints[0], "#1c7a50", 7, labels.start);
        if (screenPoints.length > 1) marker(overlay, screenPoints[screenPoints.length - 1], "#7155b7", 7, labels.end);
        updateCurrentMarker();
      }

      window.setPlaybackIndex = function (index) {
        selectedIndex = Number.isFinite(Number(index)) ? Number(index) : 0;
        updateCurrentMarker();
      };
      window.addEventListener("resize", render);
      render();
    }());
  </script>
</body>
</html>`
}
