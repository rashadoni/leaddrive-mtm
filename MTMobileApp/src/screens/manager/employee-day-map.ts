import {
  cartoTileMarkup,
  cartoTileScript,
  cartoTileStyles,
  type CartoTileOptions,
} from "../maps/carto-tiles"
import type { EmployeeDay } from "../../services/manager-employee-day"
import { MOVEMENT_COLORS, MOVEMENT_ICON_SVG } from "../maps/movement-icons"

/**
 * The map on the manager's card of one employee (owner-approved picture,
 * 2026-10-17): where he went (blue), the day's route points by number — green
 * when visited, white when still ahead, red when skipped or missed — and a
 * dashed line from where he is now through the points left.
 *
 * Built like the agent's own GPS map: raster tiles from CARTO under an SVG
 * overlay, no remote JavaScript, navigation blocked; without tiles the line
 * and the numbers still stand on the local grid.
 *
 * Owner 2026-11-01 (the mockup «MTM: движение на карте», step 3): the line
 * says car (solid blue) or on foot (dotted green) with arrows the way he
 * went, the marker says how he is moving and points where, and the day can
 * be played by the clock — a stop lasts as long as it lasted. Nothing is
 * drawn across a break or a lost signal: the marker waits at the point he
 * left before it.
 */
export interface EmployeeDayMapLabels {
  language: string
  accessibilityLabel: string
  current: string
  mapLoading: string
  mapUnavailable: string
  mapAttribution: string
  /** The replay's words; without them the map has no replay bar (an older caller). */
  replay?: {
    play: string
    pause: string
    skipStill: string
    time: string
    /** DRIVE / WALK / STAY / BREAK / GAP in words. */
    modes: Record<string, string>
    /** N … NW in words. */
    compass: Record<string, string>
  }
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
  const fixes = day.fixes ?? []
  const replay = labels.replay && fixes.length >= 2 ? labels.replay : null

  return `<!doctype html>
<html lang="${htmlText(labels.language)}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https://*.basemaps.cartocdn.com data:; connect-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <style>
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #dfeae5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    #day {
      position: relative;
      width: 100%;
      height: ${replay ? "calc(100% - 48px)" : "100%"};
      overflow: hidden;
      background-color: #dfeae5;
      background-image:
        linear-gradient(rgba(8,112,90,.09) 1px, transparent 1px),
        linear-gradient(90deg, rgba(8,112,90,.09) 1px, transparent 1px);
      background-size: 28px 28px;
    }
    #overlay { position: absolute; z-index: 2; inset: 0; width: 100%; height: 100%; overflow: visible; }
    #bar { display: flex; height: 48px; align-items: center; gap: 8px; padding: 0 8px; background: #fbfdfc; border-top: 1px solid #d5e0db; color: #13231f; font-size: 12px; }
    #bar button { flex: none; height: 36px; padding: 0 12px; border: 0; border-radius: 10px; background: #08705a; color: #fbfdfc; font: inherit; font-weight: 800; }
    #bar input[type=range] { flex: 1; min-width: 60px; accent-color: #08705a; }
    #bar label { flex: none; display: flex; align-items: center; gap: 4px; color: #40544d; font-size: 11px; }
    #readout { position: absolute; z-index: 3; left: 8px; top: 8px; padding: 4px 8px; border-radius: 8px; background: rgba(251,253,252,.94); color: #13231f; font-size: 12px; font-weight: 700; box-shadow: 0 1px 4px rgba(19,35,31,.14); }
    #readout:empty { display: none; }
    ${cartoTileStyles()}
  </style>
</head>
<body>
  <div id="day">
    ${cartoTileMarkup({ loading: labels.mapLoading, unavailable: labels.mapUnavailable, attribution: labels.mapAttribution })}
    <svg id="overlay" role="img" aria-label="${htmlText(labels.accessibilityLabel)}"></svg>
    <div id="readout" aria-live="polite"></div>
  </div>
  ${replay ? `<div id="bar">
    <button id="play" type="button">▶ ${htmlText(replay.play)}</button>
    <input id="slider" type="range" min="0" step="1" aria-label="${htmlText(replay.time)}" />
    <label><input id="skip" type="checkbox" checked />${htmlText(replay.skipStill)}</label>
  </div>` : ""}
  <script>
    ${cartoTileScript(tiles)}
    (function () {
      var track = ${scriptJson(day.track)};
      var stops = ${scriptJson(stops)};
      var current = ${scriptJson(current)};
      var labels = ${scriptJson({ current: labels.current })};
      var fixes = ${scriptJson(fixes)};
      var replay = ${scriptJson(replay ? { play: replay.play, pause: replay.pause, modes: replay.modes, compass: replay.compass } : null)};
      var timeZone = ${scriptJson(day.timezone)};
      var language = ${scriptJson(labels.language)};
      var modeIcons = ${scriptJson(MOVEMENT_ICON_SVG)};
      var modeColors = ${scriptJson(MOVEMENT_COLORS)};
      var svgNs = "http://www.w3.org/2000/svg";
      var tileSize = 256;
      var everything = [].concat.apply([], track).concat(stops).concat(current ? [current] : []).concat(fixes);
      // At this speed a nine-hour day plays in under a minute: ten minutes of the day a second.
      var DAY_MS_PER_MS = 600;
      var dayStart = fixes.length ? fixes[0].at : null;
      var dayEnd = fixes.length ? fixes[fixes.length - 1].at : null;
      var moment = dayEnd;
      var playing = false;
      var view = null;

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

      // Arrows along a piece of the line, one every ~60 px, the way it runs.
      function chevrons(overlay, points, mode) {
        var walked = 0;
        var next = 30;
        for (var index = 1; index < points.length; index += 1) {
          var a = points[index - 1];
          var b = points[index];
          var length = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y));
          if (length <= 0) continue;
          var angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
          while (next <= walked + length) {
            var share = (next - walked) / length;
            var x = a.x + (b.x - a.x) * share;
            var y = a.y + (b.y - a.y) * share;
            var transform = "translate(" + x + " " + y + ") rotate(" + angle + ")";
            overlay.appendChild(mode === "DRIVE"
              ? el("path", { d: "M -3.5 -4 L 2 0 L -3.5 4", transform: transform, fill: "none", stroke: "#ffffff", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" })
              : el("path", { d: "M -4 -5 L 4 0 L -4 5 Z", transform: transform, fill: modeColors.WALK, stroke: "#ffffff", "stroke-width": 1 }));
            next += 60;
          }
          walked += length;
        }
      }

      function drawPiece(overlay, mode, points) {
        if (points.length < 2) return;
        if (mode === "DRIVE") line(overlay, points, modeColors.DRIVE, 5);
        else if (mode === "WALK") line(overlay, points, modeColors.WALK, 4, "1 7");
        else line(overlay, points, "#94a3b8", 3);
        if (mode === "DRIVE" || mode === "WALK") chevrons(overlay, points, mode);
      }

      function bearing(a, b) {
        var toRad = Math.PI / 180;
        var y = Math.sin((b.longitude - a.longitude) * toRad) * Math.cos(b.latitude * toRad);
        var x = Math.cos(a.latitude * toRad) * Math.sin(b.latitude * toRad) - Math.sin(a.latitude * toRad) * Math.cos(b.latitude * toRad) * Math.cos((b.longitude - a.longitude) * toRad);
        return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
      }

      function metres(a, b) {
        var toRad = Math.PI / 180;
        var dLat = (b.latitude - a.latitude) * toRad;
        var dLon = (b.longitude - a.longitude) * toRad * Math.cos((a.latitude + b.latitude) / 2 * toRad);
        return Math.sqrt(dLat * dLat + dLon * dLon) * 6371000;
      }

      // Where he was at a moment of the day, and how he was moving.
      function frameAt(at) {
        if (!fixes.length) return null;
        var index = 0;
        for (var i = 0; i < fixes.length && fixes[i].at <= at; i += 1) index = i;
        var fix = fixes[index];
        if (index === fixes.length - 1 || at <= fix.at) return { index: index, latitude: fix.latitude, longitude: fix.longitude, mode: fix.mode, course: fix.mode === "STAY" ? null : fix.course };
        if (fix.cut) return { index: index, latitude: fix.latitude, longitude: fix.longitude, mode: fix.cut, course: null };
        var next = fixes[index + 1];
        var share = Math.min(1, (at - fix.at) / (next.at - fix.at));
        var mode = fix.mode === "STAY" ? next.mode : fix.mode;
        var course = mode === "STAY" ? null : metres(fix, next) >= 15 ? bearing(fix, next) : fix.course;
        return { index: index, latitude: fix.latitude + (next.latitude - fix.latitude) * share, longitude: fix.longitude + (next.longitude - fix.longitude) * share, mode: mode, course: course };
      }

      // «Пропускать стоянки»: from a still moment to the next one he moves.
      function skipStill(at) {
        var frame = frameAt(at);
        if (!frame || frame.mode === "DRIVE" || frame.mode === "WALK") return at;
        for (var index = frame.index + 1; index < fixes.length; index += 1) {
          if (fixes[index].mode !== "STAY") return fixes[index - 1].cut ? fixes[index].at : Math.max(at, fixes[index - 1].at);
        }
        return dayEnd;
      }

      function marker(overlay, point, mode, course, caption) {
        var color = modeColors[mode] || modeColors.STAY;
        if (course != null && (mode === "DRIVE" || mode === "WALK")) {
          overlay.appendChild(el("path", { d: "M 0 -27 L 7 -16 L -7 -16 Z", transform: "translate(" + point.x + " " + point.y + ") rotate(" + Math.round(course) + ")", fill: color, stroke: "#fbfdfc", "stroke-width": 2, "stroke-linejoin": "round" }));
        }
        overlay.appendChild(el("circle", { cx: point.x, cy: point.y, r: 18, fill: color, opacity: .18 }));
        overlay.appendChild(el("circle", { cx: point.x, cy: point.y, r: 13, fill: color, stroke: "#fbfdfc", "stroke-width": 3 }));
        var icon = el("svg", { x: point.x - 9, y: point.y - 9, width: 18, height: 18, viewBox: "0 0 24 24" });
        icon.style.color = "#ffffff";
        // A fixed picture from this build, never text from the server.
        icon.innerHTML = modeIcons[mode] || modeIcons.STAY;
        overlay.appendChild(icon);
        if (caption) {
          var label = el("text", { x: point.x, y: point.y - 31, fill: "#13231f", stroke: "#fbfdfc", "stroke-width": 4, "paint-order": "stroke", "font-size": 12, "font-weight": 800, "text-anchor": "middle" });
          label.textContent = caption;
          overlay.appendChild(label);
        }
      }

      function clock(at) {
        try {
          return new Date(at).toLocaleTimeString(language, timeZone ? { hour: "2-digit", minute: "2-digit", timeZone: timeZone } : { hour: "2-digit", minute: "2-digit" });
        } catch (error) {
          return new Date(at).toISOString().slice(11, 16);
        }
      }

      function compass(degrees) {
        var points = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
        return points[Math.round((((degrees % 360) + 360) % 360) / 45) % 8];
      }

      function layout() {
        if (!everything.length) return;
        var box = document.getElementById("day");
        var width = Math.max(box.clientWidth, 320);
        var height = Math.max(box.clientHeight, 180);
        var zoom = fitZoom(width, height);
        var projected = everything.map(function (point) { return project(point, zoom); });
        var xs = projected.map(function (point) { return point.x; });
        var ys = projected.map(function (point) { return point.y; });
        view = {
          zoom: zoom,
          width: width,
          height: height,
          originX: (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2 - width / 2,
          originY: (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2 - height / 2
        };
        window.__renderCartoTiles(view.originX, view.originY, zoom, width, height);
        draw();
      }

      function draw() {
        if (!view) return;
        function screen(point) { var p = project(point, view.zoom); return { x: p.x - view.originX, y: p.y - view.originY }; }
        var overlay = document.getElementById("overlay");
        overlay.setAttribute("viewBox", "0 0 " + view.width + " " + view.height);
        overlay.innerHTML = "";
        var frame = moment == null ? null : frameAt(moment);
        var atEnd = moment == null || moment >= dayEnd;

        // The line up to the moment, in pieces of one way of moving each.
        track.forEach(function (segment) {
          var piece = [];
          var pieceMode = null;
          var reached = null;
          for (var index = 0; index < segment.length; index += 1) {
            var place = segment[index];
            if (frame && typeof place.fix === "number" && place.fix > frame.index) break;
            reached = place;
            var mode = place.mode || "DRIVE";
            var at = screen(place);
            if (pieceMode !== null && mode !== pieceMode) {
              drawPiece(overlay, pieceMode, piece);
              piece = [piece[piece.length - 1]];
            }
            pieceMode = mode;
            piece.push(at);
          }
          if (frame && reached && reached.fix === frame.index && (frame.mode === "DRIVE" || frame.mode === "WALK")) piece.push(screen(frame));
          if (pieceMode !== null) drawPiece(overlay, pieceMode, piece);
        });

        // From where he is now through the points still ahead, in their order.
        var ahead = stops.filter(function (stop) { return stop.ahead; }).map(screen);
        if (ahead.length && atEnd) line(overlay, (current ? [screen(current)] : []).concat(ahead), "#08705a", 2.5, "6 5");

        stops.forEach(function (stop) {
          var at = screen(stop);
          overlay.appendChild(el("circle", { cx: at.x, cy: at.y, r: 12, fill: stop.colors.fill, stroke: stop.colors.stroke, "stroke-width": 2 }));
          var text = el("text", { x: at.x, y: at.y + 4, fill: stop.colors.text, "font-size": 11, "font-weight": 800, "text-anchor": "middle" });
          text.textContent = String(stop.order);
          overlay.appendChild(text);
        });

        if (frame) {
          marker(overlay, screen(frame), frame.mode, frame.course, current && atEnd ? labels.current : "");
        } else if (current) {
          var now = screen(current);
          overlay.appendChild(el("circle", { cx: now.x, cy: now.y, r: 15, fill: "#2e73d2", opacity: .22 }));
          overlay.appendChild(el("circle", { cx: now.x, cy: now.y, r: 7, fill: "#2e73d2", stroke: "#fbfdfc", "stroke-width": 3 }));
          var label = el("text", { x: now.x, y: now.y - 20, fill: "#13231f", stroke: "#fbfdfc", "stroke-width": 4, "paint-order": "stroke", "font-size": 12, "font-weight": 800, "text-anchor": "middle" });
          label.textContent = labels.current;
          overlay.appendChild(label);
        }

        var readout = document.getElementById("readout");
        if (replay && frame) {
          var words = clock(moment) + " · " + (replay.modes[frame.mode] || "");
          if (frame.course != null && (frame.mode === "DRIVE" || frame.mode === "WALK")) words += " · " + (replay.compass[compass(frame.course)] || "");
          readout.textContent = words;
        }
        var slider = document.getElementById("slider");
        if (slider) slider.value = String(Math.round((moment - dayStart) / 60000));
      }

      if (replay) {
        var playButton = document.getElementById("play");
        var slider = document.getElementById("slider");
        var skip = document.getElementById("skip");
        slider.max = String(Math.max(1, Math.ceil((dayEnd - dayStart) / 60000)));
        var last = null;
        function stop() {
          playing = false;
          playButton.textContent = "▶ " + replay.play;
        }
        function step(now) {
          if (!playing) return;
          var elapsed = last == null ? 0 : Math.min(100, now - last);
          last = now;
          var next = moment + elapsed * DAY_MS_PER_MS;
          if (skip.checked) next = skipStill(next);
          moment = Math.min(dayEnd, next);
          draw();
          if (moment >= dayEnd) stop();
          else window.requestAnimationFrame(step);
        }
        playButton.onclick = function () {
          if (playing) return stop();
          if (moment >= dayEnd) moment = dayStart;
          playing = true;
          last = null;
          playButton.textContent = "❚❚ " + replay.pause;
          window.requestAnimationFrame(step);
        };
        slider.oninput = function () {
          stop();
          moment = Math.min(dayEnd, dayStart + Number(slider.value) * 60000);
          draw();
        };
      }

      window.addEventListener("resize", layout);
      layout();
    }());
  </script>
</body>
</html>`
}
