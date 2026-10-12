import { cartoTileMarkup, cartoTileScript, cartoTileStyles, type CartoTileLabels, type CartoTileOptions } from "../maps/carto-tiles"
import { LOCATION_FIX_MAX_PIN_FROM_AGENT_METERS, type LocationFixPoint } from "./organization-location-fix-model"

export interface LocationFixMapLabels extends CartoTileLabels {
  /** Over the pin the agent moves: «Клиент здесь». */
  here: string
  /** Over the pin as it stands in the base: «Сейчас в базе». */
  current: string
  zoomIn: string
  zoomOut: string
}

function htmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/**
 * The map of «Клиент здесь», as a taxi app shows a pick-up point: the pin
 * stands in the middle of the screen and the agent moves the MAP under it.
 * Nothing small has to be caught and dragged with a finger, and wherever the
 * map stops, the middle of the screen is the place that will be sent.
 *
 * Drawn on it: where the phone is (a blue dot, with the circle of how sure it
 * is), how far from himself the agent may put the pin (a dashed circle — the
 * server's own limit), and the customer's pin as it stands in the base, when
 * it is near enough to be on screen.
 *
 * The page tells the app where its middle is — `{type:"center"}` — once when
 * it is ready and after every move; the app tells the page where the phone is
 * (`__setAgent`) and brings the pin back to it (`__setCenter`).
 */
export function buildLocationFixMapDocument(
  input: { center: LocationFixPoint; agent: (LocationFixPoint & { accuracy?: number }) | null; current: LocationFixPoint | null },
  labels: LocationFixMapLabels,
  options: CartoTileOptions = {},
): string {
  const state = JSON.stringify({ center: input.center, agent: input.agent, current: input.current, limit: LOCATION_FIX_MAX_PIN_FROM_AGENT_METERS })
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <style>
    html, body { margin: 0; height: 100%; overflow: hidden; background: #eef1ee; font-family: -apple-system, Roboto, "Segoe UI", sans-serif; }
    #map { position: absolute; inset: 0; overflow: hidden; touch-action: none; }
    #pan { position: absolute; inset: 0; will-change: transform; }
    ${cartoTileStyles()}
    .mark { position: absolute; z-index: 3; pointer-events: none; }
    #agent-accuracy { border-radius: 50%; background: rgba(46,115,210,.14); border: 1px solid rgba(46,115,210,.45); transform: translate(-50%, -50%); }
    #agent-limit { border-radius: 50%; border: 2px dashed rgba(8,112,90,.55); transform: translate(-50%, -50%); }
    #agent-dot { width: 16px; height: 16px; border-radius: 50%; background: #2E73D2; border: 3px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,.35); transform: translate(-50%, -50%); z-index: 4; }
    .pin { display: flex; flex-direction: column; align-items: center; transform: translate(-50%, -100%); white-space: nowrap; }
    .pin .tag { font-size: 12px; font-weight: 800; padding: 4px 9px; border-radius: 999px; margin-bottom: 5px; box-shadow: 0 1px 4px rgba(0,0,0,.25); }
    /* The drop is a square turned on its corner: the corner reaches 7 px below the square's own box, and the margin makes that corner — not the box — the pin's foot. */
    .pin .drop { width: 26px; height: 26px; margin-bottom: 7px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 3px solid #fff; box-shadow: 0 2px 5px rgba(0,0,0,.35); }
    #current-pin .tag { background: #E5E7EB; color: #374151; }
    #current-pin .drop { background: #9CA3AF; }
    #here-pin { left: 50%; top: 50%; z-index: 5; transition: transform .12s ease-out; }
    #here-pin .tag { background: #08705A; color: #F8FCFA; }
    #here-pin .drop { background: #08705A; }
    #here-shadow { position: absolute; z-index: 4; left: 50%; top: 50%; width: 14px; height: 6px; border-radius: 50%; background: rgba(0,0,0,.28); transform: translate(-50%, -50%); pointer-events: none; }
    /* Lifted while the map moves: the pin is put down where the map stops. */
    #map.moving #here-pin { transform: translate(-50%, -100%) translateY(-12px); }
    #zoom { position: absolute; z-index: 6; right: 10px; top: 10px; display: flex; flex-direction: column; gap: 8px; }
    .map-control { width: 44px; height: 44px; border-radius: 12px; border: 1px solid #D6E3DC; background: #FBFDFC; color: #13231F; font-size: 24px; font-weight: 700; line-height: 1; box-shadow: 0 1px 4px rgba(19,35,31,.18); }
  </style>
</head>
<body>
  <div id="map">
    <div id="pan">
      ${cartoTileMarkup(labels)}
      <div id="agent-limit" class="mark" hidden></div>
      <div id="agent-accuracy" class="mark" hidden></div>
      <div id="agent-dot" class="mark" hidden></div>
      <div id="current-pin" class="mark pin" hidden><span class="tag">${htmlText(labels.current)}</span><span class="drop"></span></div>
    </div>
    <div id="here-shadow"></div>
    <div id="here-pin" class="mark pin"><span class="tag">${htmlText(labels.here)}</span><span class="drop"></span></div>
    <div id="zoom">
      <button id="zoom-in" class="map-control" type="button" aria-label="${htmlText(labels.zoomIn)}">+</button>
      <button id="zoom-out" class="map-control" type="button" aria-label="${htmlText(labels.zoomOut)}">−</button>
    </div>
  </div>
  <script>
    (function () {
      ${cartoTileScript(options)}
      var state = ${state};
      var TILE = 256;
      var zoom = 17;
      var map = document.getElementById("map");
      var pan = document.getElementById("pan");
      var origin = { x: 0, y: 0 };

      function post(message) {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify(message));
        }
      }
      function world(point) {
        var scale = TILE * Math.pow(2, zoom);
        var sin = Math.sin(point.latitude * Math.PI / 180);
        sin = Math.min(Math.max(sin, -0.9999), 0.9999);
        return { x: (point.longitude + 180) / 360 * scale, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale };
      }
      function place(x, y) {
        var scale = TILE * Math.pow(2, zoom);
        var n = Math.PI - 2 * Math.PI * y / scale;
        return { latitude: 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), longitude: x / scale * 360 - 180 };
      }
      function metersPerPixel(latitude) {
        return 156543.03392 * Math.cos(latitude * Math.PI / 180) / Math.pow(2, zoom);
      }
      function put(id, point, size) {
        var element = document.getElementById(id);
        if (!point) { element.hidden = true; return; }
        var at = world(point);
        element.style.left = (at.x - origin.x) + "px";
        element.style.top = (at.y - origin.y) + "px";
        if (size != null) { element.style.width = size + "px"; element.style.height = size + "px"; }
        element.hidden = false;
      }
      function render() {
        var width = window.innerWidth;
        var height = window.innerHeight;
        var middle = world(state.center);
        origin = { x: middle.x - width / 2, y: middle.y - height / 2 };
        pan.style.transform = "";
        window.__renderCartoTiles(origin.x, origin.y, zoom, width, height);
        if (state.agent) {
          var scale = metersPerPixel(state.agent.latitude);
          put("agent-dot", state.agent);
          put("agent-limit", state.agent, 2 * state.limit / scale);
          var accuracy = typeof state.agent.accuracy === "number" ? state.agent.accuracy : 0;
          put("agent-accuracy", accuracy > 0 ? state.agent : null, 2 * accuracy / scale);
        } else {
          put("agent-dot", null); put("agent-limit", null); put("agent-accuracy", null);
        }
        put("current-pin", state.current);
        post({ type: "center", latitude: state.center.latitude, longitude: state.center.longitude });
      }

      // The map moves under the finger; the pin stays in the middle.
      var drag = null;
      map.addEventListener("pointerdown", function (event) {
        if (event.target && event.target.closest && event.target.closest("#zoom")) return;
        drag = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dy: 0 };
        try { map.setPointerCapture(event.pointerId); } catch (error) {}
      });
      map.addEventListener("pointermove", function (event) {
        if (!drag || event.pointerId !== drag.id) return;
        drag.dx = event.clientX - drag.x;
        drag.dy = event.clientY - drag.y;
        if (Math.abs(drag.dx) + Math.abs(drag.dy) > 3) map.classList.add("moving");
        pan.style.transform = "translate(" + drag.dx + "px," + drag.dy + "px)";
      });
      function drop(event) {
        if (!drag || event.pointerId !== drag.id) return;
        var moved = drag;
        drag = null;
        map.classList.remove("moving");
        if (Math.abs(moved.dx) + Math.abs(moved.dy) <= 3) { pan.style.transform = ""; return; }
        var middle = world(state.center);
        state.center = place(middle.x - moved.dx, middle.y - moved.dy);
        render();
      }
      map.addEventListener("pointerup", drop);
      map.addEventListener("pointercancel", drop);

      document.getElementById("zoom-in").onclick = function () { zoom = Math.min(18, zoom + 1); render(); };
      document.getElementById("zoom-out").onclick = function () { zoom = Math.max(13, zoom - 1); render(); };
      window.addEventListener("resize", render);

      window.__setCenter = function (latitude, longitude) {
        state.center = { latitude: latitude, longitude: longitude };
        render();
      };
      window.__setAgent = function (latitude, longitude, accuracy) {
        state.agent = { latitude: latitude, longitude: longitude, accuracy: accuracy };
        render();
      };
      render();
      post({ type: "ready" });
    })();
  </script>
</body>
</html>`
}
