import {
  cartoTileMarkup,
  cartoTileScript,
  cartoTileStyles,
  type CartoTileOptions,
} from "../maps/carto-tiles"
import type { EmployeeDay } from "../../services/manager-employee-day"

/**
 * The map on the manager's card of one employee (owner-approved picture,
 * 2026-10-17): where he went (blue), the day's route points by number — green
 * when visited, white when still ahead, red when skipped or missed — and a
 * dashed line from where he is now through the points left.
 *
 * Built like the agent's own GPS map: raster tiles from CARTO under an SVG
 * overlay, no remote JavaScript, navigation blocked; without tiles the line
 * and the numbers still stand on the local grid.
 */
export interface EmployeeDayMapLabels {
  language: string
  accessibilityLabel: string
  current: string
  mapLoading: string
  mapUnavailable: string
  mapAttribution: string
}

const STOP_COLORS: Record<string, { fill: string; text: string; stroke: string }> = {
  VISITED: { fill: "#08705a", text: "#ffffff", stroke: "#ffffff" },
  NEXT: { fill: "#2e73d2", text: "#ffffff", stroke: "#ffffff" },
  PLANNED: { fill: "#ffffff", text: "#5e7069", stroke: "#9aaaa3" },
  SKIPPED: { fill: "#f8e1e1", text: "#c73b3b", stroke: "#c73b3b" },
  MISSED: { fill: "#f8e1e1", text: "#c73b3b", stroke: "#c73b3b" },
}

function htmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/** JSON that cannot close the script element it is written into. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029")
}

/** Whether the day has anything to draw at all. */
export function employeeDayHasMap(day: EmployeeDay): boolean {
  return day.track.some((segment) => segment.length > 0) || day.stops.some((stop) => stop.position) || day.current != null
}

export function buildEmployeeDayDocument(day: EmployeeDay, labels: EmployeeDayMapLabels, tiles: CartoTileOptions = {}): string {
  const stops = day.stops
    .filter((stop) => stop.position)
    .map((stop) => ({ ...stop.position!, order: stop.order, colors: STOP_COLORS[stop.status] ?? STOP_COLORS.PLANNED, ahead: stop.status === "NEXT" || stop.status === "PLANNED" }))
  const current = day.current ? { latitude: day.current.latitude, longitude: day.current.longitude } : null

  return `<!doctype html>
<html lang="${htmlText(labels.language)}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https://*.basemaps.cartocdn.com data:; connect-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <style>
    * { box-sizing: border-box; }
    html, body, #day { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #dfeae5; }
    #day {
      position: relative;
      background-color: #dfeae5;
      background-image:
        linear-gradient(rgba(8,112,90,.09) 1px, transparent 1px),
        linear-gradient(90deg, rgba(8,112,90,.09) 1px, transparent 1px);
      background-size: 28px 28px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    #overlay { position: absolute; z-index: 2; inset: 0; width: 100%; height: 100%; overflow: visible; }
    ${cartoTileStyles()}
  </style>
</head>
<body>
  <div id="day">
    ${cartoTileMarkup({ loading: labels.mapLoading, unavailable: labels.mapUnavailable, attribution: labels.mapAttribution })}
    <svg id="overlay" role="img" aria-label="${htmlText(labels.accessibilityLabel)}"></svg>
  </div>
  <script>
    ${cartoTileScript(tiles)}
    (function () {
      var track = ${scriptJson(day.track)};
      var stops = ${scriptJson(stops)};
      var current = ${scriptJson(current)};
      var labels = ${scriptJson({ current: labels.current })};
      var svgNs = "http://www.w3.org/2000/svg";
      var tileSize = 256;
      var everything = [].concat.apply([], track).concat(stops).concat(current ? [current] : []);

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
        if (everything.length <= 1) return 15;
        for (var zoom = 17; zoom >= 2; zoom -= 1) {
          var projected = everything.map(function (point) { return project(point, zoom); });
          var xs = projected.map(function (point) { return point.x; });
          var ys = projected.map(function (point) { return point.y; });
          if (Math.max.apply(null, xs) - Math.min.apply(null, xs) <= width - 64 &&
              Math.max.apply(null, ys) - Math.min.apply(null, ys) <= height - 64) return zoom;
        }
        return 2;
      }

      function el(name, attributes) {
        var element = document.createElementNS(svgNs, name);
        Object.keys(attributes).forEach(function (key) { element.setAttribute(key, String(attributes[key])); });
        return element;
      }

      function line(overlay, points, stroke, width, dash) {
        if (points.length < 2) return;
        var value = points.map(function (point) { return point.x + "," + point.y; }).join(" ");
        overlay.appendChild(el("polyline", { points: value, fill: "none", stroke: "#fbfdfc", "stroke-width": width + 4, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: .9 }));
        var attributes = { points: value, fill: "none", stroke: stroke, "stroke-width": width, "stroke-linecap": "round", "stroke-linejoin": "round" };
        if (dash) attributes["stroke-dasharray"] = dash;
        overlay.appendChild(el("polyline", attributes));
      }

      function render() {
        if (!everything.length) return;
        var width = Math.max(document.documentElement.clientWidth, window.innerWidth || 320);
        var height = Math.max(document.documentElement.clientHeight, window.innerHeight || 220);
        var zoom = fitZoom(width, height);
        var projected = everything.map(function (point) { return project(point, zoom); });
        var xs = projected.map(function (point) { return point.x; });
        var ys = projected.map(function (point) { return point.y; });
        var originX = (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2 - width / 2;
        var originY = (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2 - height / 2;
        function screen(point) { var p = project(point, zoom); return { x: p.x - originX, y: p.y - originY }; }
        window.__renderCartoTiles(originX, originY, zoom, width, height);

        var overlay = document.getElementById("overlay");
        overlay.setAttribute("viewBox", "0 0 " + width + " " + height);
        overlay.innerHTML = "";
        track.forEach(function (segment) { line(overlay, segment.map(screen), "#2e73d2", 4); });

        // From where he is now through the points still ahead, in their order.
        var ahead = stops.filter(function (stop) { return stop.ahead; }).map(screen);
        if (ahead.length) line(overlay, (current ? [screen(current)] : []).concat(ahead), "#08705a", 2.5, "6 5");

        stops.forEach(function (stop) {
          var at = screen(stop);
          overlay.appendChild(el("circle", { cx: at.x, cy: at.y, r: 12, fill: stop.colors.fill, stroke: stop.colors.stroke, "stroke-width": 2 }));
          var text = el("text", { x: at.x, y: at.y + 4, fill: stop.colors.text, "font-size": 11, "font-weight": 800, "text-anchor": "middle" });
          text.textContent = String(stop.order);
          overlay.appendChild(text);
        });

        if (current) {
          var now = screen(current);
          overlay.appendChild(el("circle", { cx: now.x, cy: now.y, r: 15, fill: "#2e73d2", opacity: .22 }));
          overlay.appendChild(el("circle", { cx: now.x, cy: now.y, r: 7, fill: "#2e73d2", stroke: "#fbfdfc", "stroke-width": 3 }));
          var label = el("text", { x: now.x, y: now.y - 20, fill: "#13231f", stroke: "#fbfdfc", "stroke-width": 4, "paint-order": "stroke", "font-size": 12, "font-weight": 800, "text-anchor": "middle" });
          label.textContent = labels.current;
          overlay.appendChild(label);
        }
      }

      window.addEventListener("resize", render);
      render();
    }());
  </script>
</body>
</html>`
}
