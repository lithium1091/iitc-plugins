// ==UserScript==
// @name         IITC Plugin: Agent Monitor
// @id           agent-monitor@lithium1091
// @category     Info
// @namespace    https://github.com/lithium1091/iitc-plugins
// @version      1.5.0
// @description  特定エージェントの活動履歴を監視・表示するIITCプラグイン（iOS Mobile版）
// @author       lithium1091
// @include      https://intel.ingress.com/*
// @match        https://intel.ingress.com/*
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/lithium1091/iitc-plugins/main/iitc-agent-monitor_user.js
// @updateURL    https://raw.githubusercontent.com/lithium1091/iitc-plugins/main/iitc-agent-monitor_user.js
// ==/UserScript==

function wrapper(plugin_info) {
    if (typeof window.plugin !== 'function') window.plugin = function() {};

    window.plugin.agentMonitor = function() {};
    var self = window.plugin.agentMonitor;
    self.id = 'agentMonitor';
    self.title = 'Agent Monitor';

    var STORAGE_KEY = 'iitc_agent_monitor';
    var MAX_LOG = 200;
    var ACTION_LABEL = { capture:'capture', link:'link', destroy:'destroy', deploy:'deploy', resonator:'resonator', mod:'mod', activity:'activity' };

    var watchedAgents = [];
    var activityLog = [];

    // ==================== ストレージ ====================
    self.saveData = function() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                watchedAgents: watchedAgents,
                activityLog: activityLog.slice(0, MAX_LOG)
            }));
        } catch(e) {}
    };

    self.loadData = function() {
        try {
            var d = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            watchedAgents = d.watchedAgents || [];
            activityLog   = d.activityLog   || [];
        } catch(e) { watchedAgents = []; activityLog = []; }
    };

    // ==================== ログ追加 ====================
    self.checkAndLog = function(agentName, actionType, portalGuid, portalTitle, timestamp) {
        if (!agentName) return;
        var norm = agentName.toLowerCase();
        if (!watchedAgents.some(function(a) { return a.toLowerCase() === norm; })) return;

        var ts = (timestamp && timestamp > 1000000000000) ? timestamp : (timestamp && timestamp > 1000000000) ? timestamp * 1000 : Date.now();
        var dup = activityLog.find(function(e) {
            return e.agent.toLowerCase() === norm &&
                   e.portalGuid === portalGuid &&
                   e.action === actionType &&
                   Math.abs(ts - e.timestamp) < 60000;
        });
        if (dup) return;

        var entry = { agent: agentName, action: actionType, portalGuid: portalGuid, portalTitle: portalTitle, timestamp: ts, lat: null, lng: null };
        if (window.portals && window.portals[portalGuid]) {
            try { var ll = window.portals[portalGuid].getLatLng(); entry.lat = ll.lat; entry.lng = ll.lng; } catch(e) {}
        }

        activityLog.unshift(entry);
        if (activityLog.length > MAX_LOG) activityLog.pop();
        self.saveData();
        self.renderLog();
        self.showToast(agentName, actionType, portalTitle);
    };

    // ==================== publicChatDataAvailable フック ====================
    // player-tracker-addonと同じ方式でCOMMデータを取得
    self.handleChatData = function(data) {
        if (!data || !data.raw || !data.raw.result) return;
        data.raw.result.forEach(function(item) {
            try {
                var plext = item[2] && item[2].plext;
                if (!plext || plext.plextType !== 'SYSTEM_BROADCAST') return;
                var markup = plext.markup || [];
                var agent = null, action = 'activity', portalTitle = 'Unknown Portal', portalGuid = null;
                markup.forEach(function(m) {
                    if (m[0] === 'PLAYER') agent = m[1].plain;
                    if (m[0] === 'PORTAL') { portalTitle = m[1].name || 'Unknown Portal'; portalGuid = m[1].guid || null; }
                    if (m[0] === 'TEXT') {
                        var t = m[1].plain || '';
                        if      (t.includes('captured')  || t.includes('キャプチャー')) action = 'capture';
                        else if (t.includes('linked')    || t.includes('リンク'))       action = 'link';
                        else if (t.includes('destroyed') || t.includes('破壊'))         action = 'destroy';
                        else if (t.includes('deployed')  || t.includes('配備'))         action = 'deploy';
                    }
                });
                // item[1] はCOMMメッセージのタイムスタンプ（ミリ秒）
                var msgTime = item[1] || null;
                if (agent) self.checkAndLog(agent, action, portalGuid || portalTitle, portalTitle, msgTime);
            } catch(e) {}
        });
    };

    // ==================== ポータル詳細フック ====================
    self.onPortalDetailsUpdated = function(data) {
        if (!data || !data.details) return;
        var d = data.details, guid = data.guid, title = d.title || 'Unknown Portal';
        (d.resonators || []).forEach(function(r) { if (r && r.owner) self.checkAndLog(r.owner, 'resonator', guid, title); });
        (d.mods        || []).forEach(function(m) { if (m && m.owner) self.checkAndLog(m.owner, 'mod', guid, title); });
        if (d.captured && d.captured.capturingPlayerId)
            self.checkAndLog(d.captured.capturingPlayerId, 'capture', guid, title);
    };

    // ==================== トースト ====================
    self.showToast = function(agent, action, portalTitle) {
        var label = ACTION_LABEL[action] || action;
        var el = document.createElement('div');
        el.className = 'am-toast';
        el.textContent = '[' + label + '] ' + agent + '\n' + portalTitle;
        document.body.appendChild(el);
        setTimeout(function() { el.style.opacity = '0'; setTimeout(function() { if(el.parentNode) el.parentNode.removeChild(el); }, 400); }, 3500);
    };

    // ==================== UI ====================
    self.buildUI = function() {
        var overlay = document.createElement('div');
        overlay.id = 'am-overlay';
        overlay.addEventListener('click', self.closePanel);

        var panel = document.createElement('div');
        panel.id = 'am-panel';
        panel.innerHTML =
            '<div class="am-header">' +
                '<span class="am-title">Agent Monitor</span>' +
                '<button class="am-close-btn">close</button>' +
            '</div>' +
            '<div class="am-body">' +
                '<section class="am-section">' +
                    '<div class="am-section-label">監視対象エージェント</div>' +
                    '<div class="am-add-row">' +
                        '<input id="am-input" type="text" placeholder="エージェント名…" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false"/>' +
                        '<button id="am-add-btn">追加</button>' +
                    '</div>' +
                    '<ul id="am-agent-list"></ul>' +
                '</section>' +
                '<section class="am-section am-log-section">' +
                    '<div class="am-section-header">' +
                        '<span class="am-section-label">活動ログ</span>' +
                        '<button id="am-clear-btn">クリア</button>' +
                    '</div>' +
                    '<div id="am-log-scroll">' +
                        '<p id="am-log-empty">ログはありません</p>' +
                        '<ul id="am-log-list"></ul>' +
                    '</div>' +
                '</section>' +
            '</div>';

        panel.querySelector('.am-close-btn').addEventListener('click', self.closePanel);
        panel.querySelector('#am-add-btn').addEventListener('click', function() {
            var inp = panel.querySelector('#am-input');
            var name = inp.value.trim();
            if (name) { self.addAgent(name); inp.value = ''; }
        });
        panel.querySelector('#am-input').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') panel.querySelector('#am-add-btn').click();
        });
        panel.querySelector('#am-clear-btn').addEventListener('click', function() {
            activityLog = []; self.saveData(); self.renderLog();
        });

        document.body.appendChild(overlay);
        document.body.appendChild(panel);
        self.renderAgentList();
        self.renderLog();
    };

    self.openPanel = function() {
        document.getElementById('am-overlay').classList.add('am-show');
        document.getElementById('am-panel').classList.add('am-show');
    };
    self.closePanel = function() {
        document.getElementById('am-overlay').classList.remove('am-show');
        document.getElementById('am-panel').classList.remove('am-show');
    };

    // ==================== ツールバー ====================
    self.addToolbarButton = function() {
        var toolbox = document.getElementById('toolbox');
        if (toolbox) {
            var a = document.createElement('a');
            a.textContent = 'Agent Monitor';
            a.href = '#';
            a.addEventListener('click', function(e) { e.preventDefault(); self.openPanel(); });
            toolbox.appendChild(a);
        } else {
            var fab = document.createElement('div');
            fab.id = 'am-fab';
            fab.textContent = 'AM';
            fab.addEventListener('click', self.openPanel);
            document.body.appendChild(fab);
        }
    };

    // ==================== エージェントリスト ====================
    self.addAgent = function(name) {
        if (watchedAgents.some(function(a) { return a.toLowerCase() === name.toLowerCase(); })) return;
        watchedAgents.push(name); self.saveData(); self.renderAgentList();
    };
    self.removeAgent = function(name) {
        watchedAgents = watchedAgents.filter(function(a) { return a.toLowerCase() !== name.toLowerCase(); });
        self.saveData(); self.renderAgentList();
    };
    self.renderAgentList = function() {
        var list = document.getElementById('am-agent-list');
        if (!list) return;
        list.innerHTML = '';
        if (!watchedAgents.length) {
            list.innerHTML = '<li class="am-empty">監視中のエージェントなし</li>'; return;
        }
        watchedAgents.forEach(function(agent) {
            var li = document.createElement('li');
            li.className = 'am-agent-item';
            li.innerHTML = '<span class="am-agent-name">' + self.esc(agent) + '</span>' +
                           '<button class="am-remove-btn" data-name="' + self.esc(agent) + '">削除</button>';
            li.querySelector('.am-remove-btn').addEventListener('click', function() { self.removeAgent(this.dataset.name); });
            list.appendChild(li);
        });
    };

    // ==================== ログ描画 ====================
    self.renderLog = function() {
        var list  = document.getElementById('am-log-list');
        var empty = document.getElementById('am-log-empty');
        if (!list || !empty) return;
        if (!activityLog.length) { empty.style.display = ''; list.innerHTML = ''; return; }
        empty.style.display = 'none';
        list.innerHTML = '';
        activityLog.slice(0, 50).forEach(function(entry) {
            var label   = ACTION_LABEL[entry.action] || entry.action;
            var d       = new Date(entry.timestamp);
            var dateStr = d.toLocaleDateString('ja-JP');
            var timeStr = d.toLocaleTimeString('ja-JP');
            var li = document.createElement('li');
            li.className = 'am-log-item';
            li.innerHTML =
                '<div class="am-log-row1">' +
                    '<span class="am-log-agent">' + self.esc(entry.agent) + '</span>' +
                    '<span class="am-log-time">'  + dateStr + ' ' + timeStr + '</span>' +
                '</div>' +
                '<div class="am-log-row2">' + label + ' — ' + self.esc(entry.portalTitle) + '</div>' +
                (entry.lat ? '<div class="am-log-jump"><button class="am-jump-btn" data-lat="' + entry.lat + '" data-lng="' + entry.lng + '">地図で見る</button></div>' : '');
            if (entry.lat) {
                li.querySelector('.am-jump-btn').addEventListener('click', function() {
                    if (window.map) { window.map.setView([+this.dataset.lat, +this.dataset.lng], 17); self.closePanel(); }
                });
            }
            list.appendChild(li);
        });
    };

    self.esc = function(s) {
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    };

    // ==================== スタイル ====================
    self.injectStyles = function() {
        var style = document.createElement('style');
        style.textContent = [
            '.am-toast{position:fixed;top:max(env(safe-area-inset-top,0px),12px);left:50%;transform:translateX(-50%);z-index:999999;background:#0a1e33ee;color:#00e5ff;border:1px solid #00e5ff55;border-left:3px solid #00e5ff;padding:12px 18px;border-radius:8px;font-size:13px;font-family:-apple-system,sans-serif;white-space:pre-line;max-width:80vw;text-align:center;transition:opacity .4s;pointer-events:none;}',
            '#am-overlay{display:none;position:fixed;inset:0;z-index:89000;background:#00000066;}',
            '#am-overlay.am-show{display:block;}',
            '#am-panel{display:none;position:fixed;bottom:0;left:0;right:0;z-index:90000;max-height:80vh;background:#08111e;border-top:1px solid #00e5ff44;border-radius:14px 14px 0 0;font-family:-apple-system,sans-serif;font-size:14px;color:#c8e6f0;flex-direction:column;overflow:hidden;padding-bottom:env(safe-area-inset-bottom,0px);box-shadow:0 -4px 24px #00000088;}',
            '#am-panel.am-show{display:flex;}',
            '.am-header{display:flex;align-items:center;justify-content:space-between;padding:14px 18px 12px;background:#0c1a2e;border-bottom:1px solid #00e5ff22;flex-shrink:0;}',
            '.am-title{font-size:15px;font-weight:700;color:#00e5ff;}',
            '.am-close-btn{background:#1a2e44;border:none;border-radius:50%;color:#aac8d8;font-size:16px;width:32px;height:32px;cursor:pointer;}',
            '.am-body{overflow-y:auto;-webkit-overflow-scrolling:touch;flex:1;}',
            '.am-section{padding:14px 18px;border-bottom:1px solid #00e5ff15;}',
            '.am-section-label{font-size:11px;color:#00e5ffaa;text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px;}',
            '.am-section-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}',
            '.am-add-row{display:flex;gap:8px;margin-bottom:10px;}',
            '#am-input{flex:1;min-width:0;background:#06101c;border:1px solid #00e5ff33;border-radius:8px;color:#c8e6f0;font-size:16px;padding:9px 12px;-webkit-appearance:none;outline:none;}',
            '#am-add-btn,#am-clear-btn{background:#0f2a42;border:1px solid #00e5ff44;border-radius:8px;color:#00e5ff;font-size:14px;padding:9px 16px;cursor:pointer;white-space:nowrap;min-height:44px;}',
            '#am-agent-list,#am-log-list{list-style:none;margin:0;padding:0;}',
            '.am-agent-item{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #00e5ff0d;min-height:44px;}',
            '.am-agent-name{color:#7ecfff;font-size:14px;}',
            '.am-remove-btn{background:#2a0f18;border:1px solid #ff4d6a44;border-radius:6px;color:#ff4d6a;font-size:12px;padding:6px 12px;cursor:pointer;min-height:36px;}',
            '.am-empty{color:#4a6a7a;font-size:13px;padding:4px 0;}',
            '.am-log-section{flex:1;display:flex;flex-direction:column;}',
            '#am-log-scroll{flex:1;}',
            '#am-log-empty{color:#4a6a7a;font-size:13px;margin:0;}',
            '.am-log-item{padding:10px 0;border-bottom:1px solid #00e5ff0d;}',
            '.am-log-row1{display:flex;justify-content:space-between;margin-bottom:3px;}',
            '.am-log-agent{color:#7ecfff;font-weight:600;font-size:14px;}',
            '.am-log-time{color:#4a7a8a;font-size:12px;}',
            '.am-log-row2{color:#8ab8c8;font-size:12px;word-break:break-all;}',
            '.am-log-jump{margin-top:4px;}',
            '.am-jump-btn{background:transparent;border:none;color:#00e5ff66;font-size:12px;padding:0;cursor:pointer;min-height:36px;}',
            '#am-fab{position:fixed;bottom:calc(env(safe-area-inset-bottom,0px) + 80px);right:16px;z-index:8000;width:48px;height:48px;border-radius:50%;background:#0f2a42;border:2px solid #00e5ff55;display:flex;align-items:center;justify-content:center;font-size:22px;cursor:pointer;box-shadow:0 2px 12px #00000066;}'
        ].join('');
        document.head.appendChild(style);
    };

    // ==================== setup ====================
    self.setup = function() {
        self.loadData();
        self.injectStyles();
        self.buildUI();
        self.addToolbarButton();

        // publicChatDataAvailable が正式なCOMM取得フック
        window.addHook('publicChatDataAvailable', self.handleChatData);
        window.addHook('portalDetailsUpdated', self.onPortalDetailsUpdated);

        console.log('IITC plugin loaded: ' + self.title);
    };

    var setup = self.setup;
    setup.info = plugin_info;
    if (!window.bootPlugins) window.bootPlugins = [];
    window.bootPlugins.push(setup);
    if (window.iitcLoaded && typeof setup === 'function') setup();

} // wrapper end

var script = document.createElement('script');
var info = {};
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) {
    info.script = { version: GM_info.script.version, name: GM_info.script.name, description: GM_info.script.description };
}
script.appendChild(document.createTextNode('(' + wrapper + ')(' + JSON.stringify(info) + ');'));
(document.body || document.head || document.documentElement).appendChild(script);
