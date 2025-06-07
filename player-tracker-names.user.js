// ==UserScript==
// @id             iitc-player-tracker-names-alt
// @name           IITC Player Tracker Names
// @category       Tweaks
// @version        1.0
// @description    Display player names with tracker traces
// @include        https://www.ingress.com/intel*
// @include        http://www.ingress.com/intel*
// @match          https://www.ingress.com/intel*
// @match          http://www.ingress.com/intel*
// @require        https://leaflet.github.io/Leaflet.label/leaflet.label.js
// @grant          none
// ==/UserScript==

function wrapper(plugin_info) {
  if (typeof window.plugin !== 'function') window.plugin = function () {};

  // PLUGIN START ////////////////////////////////////////////////////////
  window.plugin.playerTrackerNames = function () {};

  window.plugin.playerTrackerNames.addLabels = function (group) {
    group.eachLayer(function (layer) {
      if (layer && layer.options && layer.options.desc && layer.bindLabel) {
        try {
          const desc = layer.options.desc;
          const name = desc.childNodes[0]?.textContent?.trim() || 'unknown';
          const ago = desc.childNodes[2]?.textContent?.trim() || desc.childNodes[3]?.textContent?.trim() || '';
          const label = `${name}, ${ago} ago`;

          layer.bindLabel(label, { noHide: true, direction: 'right' });
          if (layer.showLabel) layer.showLabel();
          console.log('Label added: ' + label);
        } catch (e) {
          console.warn('Failed to parse label:', e);
        }
      }
    });
  };

  window.plugin.playerTrackerNames.setupHook = function () {
    if (!window.plugin.playerTracker) return;
    if (plugin.playerTracker.drawnTracesRes) {
      window.plugin.playerTrackerNames.addLabels(plugin.playerTracker.drawnTracesRes);
    }
    if (plugin.playerTracker.drawnTracesEnl) {
      window.plugin.playerTrackerNames.addLabels(plugin.playerTracker.drawnTracesEnl);
    }
  };

  window.plugin.playerTrackerNames.setup = function () {
    if (!window.plugin.playerTracker) {
      console.log('Player Tracker plugin is required');
      return;
    }

    addHook('publicChatDataAvailable', window.plugin.playerTrackerNames.setupHook);

    const cssString = `
      .leaflet-label {
        background: rgba(235, 235, 235, 0.8);
        border: 2px solid rgba(0, 0, 0, 0.3);
        border-radius: 4px;
        color: #111;
        font: 12px/20px "Helvetica Neue", Arial, Helvetica, sans-serif;
        font-weight: 700;
        padding: 1px 6px;
        pointer-events: none;
        white-space: nowrap;
        z-index: 6;
      }
    `;
    $("<style>").prop("type", "text/css").html(cssString).appendTo("head");
  };

  const setup = window.plugin.playerTrackerNames.setup;
  setup.info = plugin_info;

  if (!window.bootPlugins) window.bootPlugins = [];
  window.bootPlugins.push(setup);
  if (window.iitcLoaded && typeof setup === 'function') setup();

  // PLUGIN END //////////////////////////////////////////////////////////
}

const script = document.createElement('script');
const info = (typeof GM_info !== 'undefined' && GM_info && GM_info.script)
  ? { script: { version: GM_info.script.version, name: GM_info.script.name, description: GM_info.script.description } }
  : {};
script.appendChild(document.createTextNode('(' + wrapper + ')(' + JSON.stringify(info) + ');'));
(document.body || document.head || document.documentElement).appendChild(script);
