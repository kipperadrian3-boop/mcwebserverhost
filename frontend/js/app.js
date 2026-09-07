// ============================================
// MC SERVER PANEL — Complete Application
// Steuert den Minecraft Server über Pterodactyl API
// ============================================

// ===== CONFIGURATION =====
const CONFIG_KEY = 'mc-panel-config';
const CORS_PROXY = 'https://api.codetabs.com/v1/proxy?quest=';

let config = {
  panelUrl: 'https://client.falixnodes.net',
  apiKey: 'flx_live_McsOfrNtwbkoFQlR62Nfq1ylBpRZL4ZWr3FttK5W',
  serverId: '3438668',
  useProxy: true
};

let ws = null;
let wsReconnectTimer = null;
let statsInterval = null;
let currentPath = '/';
let serverStatus = 'offline';

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  setupEventListeners();
});

// ===== CONFIG / SETUP =====
function loadConfig() {
  if (config.panelUrl && config.apiKey && config.serverId) {
    connectToPanel();
  } else {
    showSetup();
  }
}

function saveConfig() {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

function showSetup() {
  document.getElementById('setup-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  stopPolling();
}

function showApp() {
  document.getElementById('setup-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
}

async function connectToPanel() {
  const btn = document.getElementById('btn-connect');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Verbinde...';

  try {
    // Test connection
    const data = await apiCall(`/api/client/servers/${config.serverId}`);

    if (data && data.attributes) {
      showApp();
      toast('Verbunden!', 'success');

      // Server info setzen
      const attrs = data.attributes;
      document.getElementById('info-name').textContent = attrs.name || '—';
      document.getElementById('info-node').textContent = attrs.node || '—';

      // Allocation (Server-Adresse)
      if (attrs.relationships && attrs.relationships.allocations) {
        const allocs = attrs.relationships.allocations.data;
        if (allocs.length > 0) {
          const alloc = allocs[0].attributes;
          const addr = `${alloc.ip_alias || alloc.ip}:${alloc.port}`;
          document.getElementById('info-address').textContent = addr;
        }
      }

      // Limits für RAM/Disk anzeige
      if (attrs.limits) {
        config.maxRam = attrs.limits.memory;
        config.maxDisk = attrs.limits.disk;
      }

      // Status & Stats polling starten
      startPolling();
      connectWebSocket();

      // Dateien laden falls auf Files Tab
      if (document.querySelector('.nav-item.active').dataset.tab === 'files') {
        loadFiles('/');
      }
    }
  } catch (err) {
    toast('Verbindung fehlgeschlagen: ' + err.message, 'error');
    showSetup();
  }

  btn.disabled = false;
  btn.innerHTML = '<span class="btn-icon">🔗</span> Verbinden';
}

// ===== API CALLS =====
async function apiCall(endpoint, method = 'GET', body = null, isRaw = false) {
  let url = config.panelUrl.replace(/\/+$/, '') + endpoint;

  if (config.useProxy) {
    url = CORS_PROXY + encodeURIComponent(url);
  }

  const headers = {
    'Authorization': `Bearer ${config.apiKey}`,
    'Accept': 'application/json'
  };

  if (body && !isRaw) {
    headers['Content-Type'] = 'application/json';
  }

  const options = { method, headers };

  if (body) {
    options.body = isRaw ? body : JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API Fehler ${response.status}: ${text.substring(0, 200)}`);
  }

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return await response.json();
  }

  return await response.text();
}

async function apiCallFile(endpoint, file) {
  let url = config.panelUrl.replace(/\/+$/, '') + endpoint;

  if (config.useProxy) {
    url = CORS_PROXY + encodeURIComponent(url);
  }

  const formData = new FormData();
  formData.append('files', file);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: formData
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upload Fehler ${response.status}: ${text.substring(0, 200)}`);
  }

  return response;
}

// ===== POLLING (Status & Stats) =====
function startPolling() {
  fetchResources();
  statsInterval = setInterval(fetchResources, 5000);
}

function stopPolling() {
  if (statsInterval) {
    clearInterval(statsInterval);
    statsInterval = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }
}

async function fetchResources() {
  try {
    const data = await apiCall(`/api/client/servers/${config.serverId}/resources`);
    if (data && data.attributes) {
      updateStats(data.attributes);
    }
  } catch (err) {
    // Silently handle polling errors
  }
}

function updateStats(res) {
  const state = res.current_state || 'offline';
  serverStatus = state;

  // Status
  const statusText = {
    'running': 'Online',
    'starting': 'Startet...',
    'stopping': 'Stoppt...',
    'offline': 'Offline'
  };

  document.getElementById('stat-status').textContent = statusText[state] || state;

  // Status Badge
  const badge = document.getElementById('status-badge');
  badge.className = 'status-badge ' + (state === 'running' ? 'online' : state === 'starting' || state === 'stopping' ? 'starting' : 'offline');
  badge.querySelector('.status-text').textContent = statusText[state] || state;

  // Status card icon
  const cardStatus = document.getElementById('card-status');
  const statusIcons = { 'running': '🟢', 'starting': '🟡', 'stopping': '🟠', 'offline': '🔴' };
  cardStatus.querySelector('.stat-icon').textContent = statusIcons[state] || '⚫';

  // RAM
  if (res.resources) {
    const ramMB = Math.round((res.resources.memory_bytes || 0) / 1024 / 1024);
    const maxRam = config.maxRam || 0;
    document.getElementById('stat-ram').textContent = maxRam > 0 ? `${ramMB} / ${maxRam} MB` : `${ramMB} MB`;
    const ramPercent = maxRam > 0 ? Math.min(100, Math.round(ramMB / maxRam * 100)) : 0;
    document.getElementById('ram-bar').style.width = ramPercent + '%';

    // CPU
    const cpu = Math.round(res.resources.cpu_absolute || 0);
    document.getElementById('stat-cpu').textContent = cpu + '%';
    document.getElementById('cpu-bar').style.width = Math.min(100, cpu) + '%';

    // Disk
    const diskMB = Math.round((res.resources.disk_bytes || 0) / 1024 / 1024);
    const maxDisk = config.maxDisk || 0;
    document.getElementById('stat-disk').textContent = maxDisk > 0 ? `${diskMB} / ${maxDisk} MB` : `${diskMB} MB`;
    const diskPercent = maxDisk > 0 ? Math.min(100, Math.round(diskMB / maxDisk * 100)) : 0;
    document.getElementById('disk-bar').style.width = diskPercent + '%';

    // Uptime
    if (res.resources.uptime && res.resources.uptime > 0) {
      document.getElementById('stat-uptime').textContent = formatUptime(res.resources.uptime);
    } else {
      document.getElementById('stat-uptime').textContent = '—';
    }

    // Players (not always available from resources, but try network)
    if (res.resources.network_rx_bytes !== undefined) {
      // We can't directly get player count from resources, so we'll parse console output
    }
  }

  // Update button states
  updateControlButtons(state);
}

function updateControlButtons(state) {
  const btnStart = document.getElementById('btn-start');
  const btnStop = document.getElementById('btn-stop');
  const btnRestart = document.getElementById('btn-restart');
  const btnKill = document.getElementById('btn-kill');

  btnStart.disabled = state === 'running' || state === 'starting';
  btnStop.disabled = state === 'offline' || state === 'stopping';
  btnRestart.disabled = state === 'offline';
  btnKill.disabled = state === 'offline';
}

function formatUptime(ms) {
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${mins % 60}m`;
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  if (mins > 0) return `${mins}m ${secs % 60}s`;
  return `${secs}s`;
}

// ===== WEBSOCKET (Live Console) =====
async function connectWebSocket() {
  try {
    const data = await apiCall(`/api/client/servers/${config.serverId}/websocket`);

    if (!data || !data.data) return;

    const { token, socket } = data.data;

    if (ws) {
      ws.close();
    }

    ws = new WebSocket(socket);

    ws.onopen = () => {
      // Authenticate
      ws.send(JSON.stringify({
        event: 'auth',
        args: [token]
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleWsMessage(msg);
      } catch (e) { /* ignore */ }
    };

    ws.onclose = () => {
      // Reconnect after 5 seconds
      wsReconnectTimer = setTimeout(() => {
        if (document.getElementById('app').classList.contains('hidden')) return;
        connectWebSocket();
      }, 5000);
    };

    ws.onerror = () => {
      // Will trigger onclose
    };

  } catch (err) {
    // Retry in 10 seconds
    wsReconnectTimer = setTimeout(connectWebSocket, 10000);
  }
}

function handleWsMessage(msg) {
  switch (msg.event) {
    case 'console output':
      if (msg.args && msg.args[0]) {
        appendConsole(msg.args[0]);
      }
      break;

    case 'status':
      if (msg.args && msg.args[0]) {
        serverStatus = msg.args[0];
        fetchResources(); // Refresh stats
      }
      break;

    case 'stats':
      if (msg.args && msg.args[0]) {
        try {
          const stats = JSON.parse(msg.args[0]);
          updateStatsFromWs(stats);
        } catch (e) { /* ignore */ }
      }
      break;

    case 'token expiring':
    case 'token expired':
      connectWebSocket(); // Reconnect with new token
      break;
  }
}

function updateStatsFromWs(stats) {
  if (stats.memory_bytes !== undefined) {
    const ramMB = Math.round(stats.memory_bytes / 1024 / 1024);
    const maxRam = config.maxRam || 0;
    document.getElementById('stat-ram').textContent = maxRam > 0 ? `${ramMB} / ${maxRam} MB` : `${ramMB} MB`;
    const ramPercent = maxRam > 0 ? Math.min(100, Math.round(ramMB / maxRam * 100)) : 0;
    document.getElementById('ram-bar').style.width = ramPercent + '%';
  }

  if (stats.cpu_absolute !== undefined) {
    const cpu = Math.round(stats.cpu_absolute);
    document.getElementById('stat-cpu').textContent = cpu + '%';
    document.getElementById('cpu-bar').style.width = Math.min(100, cpu) + '%';
  }

  if (stats.disk_bytes !== undefined) {
    const diskMB = Math.round(stats.disk_bytes / 1024 / 1024);
    const maxDisk = config.maxDisk || 0;
    document.getElementById('stat-disk').textContent = maxDisk > 0 ? `${diskMB} / ${maxDisk} MB` : `${diskMB} MB`;
    const diskPercent = maxDisk > 0 ? Math.min(100, Math.round(diskMB / maxDisk * 100)) : 0;
    document.getElementById('disk-bar').style.width = diskPercent + '%';
  }

  if (stats.uptime !== undefined && stats.uptime > 0) {
    document.getElementById('stat-uptime').textContent = formatUptime(stats.uptime);
  }

  if (stats.state) {
    serverStatus = stats.state;
  }
}

function appendConsole(text) {
  const output = document.getElementById('console-output');
  const line = document.createElement('div');

  // Farbige Formatierung
  let className = '';
  if (text.includes('WARN')) className = 'log-warn';
  else if (text.includes('ERROR') || text.includes('SEVERE')) className = 'log-error';
  else if (text.includes('INFO')) className = 'log-info';
  else if (text.includes('joined') || text.includes('left')) className = 'log-player';

  line.className = className;

  // ANSI Codes entfernen
  const clean = text.replace(/\x1b\[[0-9;]*m/g, '').replace(/\r/g, '');
  line.textContent = clean;

  output.appendChild(line);

  // Parse player count from console
  const playerMatch = clean.match(/There are (\d+) of a max of (\d+) players online/);
  if (playerMatch) {
    document.getElementById('stat-players').textContent = `${playerMatch[1]} / ${playerMatch[2]}`;
  }

  const joinMatch = clean.match(/(\w+) joined the game/);
  const leaveMatch = clean.match(/(\w+) left the game/);
  if (joinMatch || leaveMatch) {
    // Refresh player count by sending list command
    setTimeout(() => sendCommand('list'), 500);
  }

  // Auto-Scroll
  if (output.scrollHeight - output.scrollTop - output.clientHeight < 200) {
    output.scrollTop = output.scrollHeight;
  }

  // Max lines
  while (output.children.length > 1000) {
    output.removeChild(output.firstChild);
  }
}

async function sendCommand(command) {
  if (!command) return;

  try {
    await apiCall(`/api/client/servers/${config.serverId}/command`, 'POST', {
      command: command
    });
  } catch (err) {
    toast('Befehl fehlgeschlagen: ' + err.message, 'error');
  }
}

// ===== SERVER POWER =====
async function sendPower(signal) {
  try {
    await apiCall(`/api/client/servers/${config.serverId}/power`, 'POST', {
      signal: signal
    });
    toast(`Server: ${signal}`, 'success');
    setTimeout(fetchResources, 2000);
  } catch (err) {
    toast('Fehler: ' + err.message, 'error');
  }
}

// ===== FILE MANAGER =====
async function loadFiles(dirPath) {
  currentPath = dirPath;
  updateBreadcrumb(dirPath);

  const fileList = document.getElementById('file-list');
  fileList.innerHTML = '<div class="file-list-loading"><span class="spinner"></span> Lade Dateien...</div>';

  try {
    const data = await apiCall(`/api/client/servers/${config.serverId}/files/list?directory=${encodeURIComponent(dirPath)}`);

    if (!data || !data.data || data.data.length === 0) {
      fileList.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📂</div><div class="empty-state-text">Ordner ist leer</div></div>';
      return;
    }

    // Sortieren: Ordner zuerst, dann Dateien
    const items = data.data.sort((a, b) => {
      if (a.attributes.is_file !== b.attributes.is_file) {
        return a.attributes.is_file ? 1 : -1;
      }
      return a.attributes.name.localeCompare(b.attributes.name);
    });

    fileList.innerHTML = '';

    // Back button wenn nicht root
    if (dirPath !== '/') {
      const backItem = createFileItem({
        name: '..',
        is_file: false,
        is_symlink: false,
        size: 0,
        modified_at: ''
      }, true);
      fileList.appendChild(backItem);
    }

    items.forEach(item => {
      const el = createFileItem(item.attributes);
      fileList.appendChild(el);
    });

  } catch (err) {
    fileList.innerHTML = `<div class="empty-state"><div class="empty-state-icon">❌</div><div class="empty-state-text">Fehler: ${err.message}</div></div>`;
  }
}

function createFileItem(attrs, isBack = false) {
  const div = document.createElement('div');
  div.className = 'file-item';

  const isDir = !attrs.is_file;
  const icon = isBack ? '⬆️' : isDir ? '📁' : getFileIcon(attrs.name);
  const nameClass = isDir ? 'file-name is-dir' : 'file-name';

  div.innerHTML = `
    <span class="file-icon">${icon}</span>
    <span class="${nameClass}">${attrs.name}</span>
    ${!isBack ? `<span class="file-size">${isDir ? '—' : formatSize(attrs.size)}</span>` : ''}
    ${!isBack && attrs.modified_at ? `<span class="file-date">${formatDate(attrs.modified_at)}</span>` : ''}
    ${!isBack ? `
      <div class="file-actions">
        ${attrs.is_file ? `<button class="file-action-btn" data-action="edit" title="Bearbeiten">✏️</button>` : ''}
        ${attrs.is_file ? `<button class="file-action-btn" data-action="download" title="Herunterladen">⬇️</button>` : ''}
        <button class="file-action-btn" data-action="rename" title="Umbenennen">📝</button>
        <button class="file-action-btn delete" data-action="delete" title="Löschen">🗑️</button>
      </div>
    ` : ''}
  `;

  // Click handler
  div.addEventListener('click', (e) => {
    // Ignore if clicking action buttons
    if (e.target.closest('.file-actions')) return;

    if (isBack) {
      const parts = currentPath.replace(/\/+$/, '').split('/');
      parts.pop();
      const parentPath = parts.join('/') || '/';
      loadFiles(parentPath);
    } else if (isDir) {
      const newPath = currentPath === '/' ? `/${attrs.name}` : `${currentPath}/${attrs.name}`;
      loadFiles(newPath);
    } else {
      editFile(currentPath === '/' ? `/${attrs.name}` : `${currentPath}/${attrs.name}`);
    }
  });

  // Action button handlers
  if (!isBack) {
    const actionsContainer = div.querySelector('.file-actions');
    if (actionsContainer) {
      actionsContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.file-action-btn');
        if (!btn) return;
        e.stopPropagation();

        const filePath = currentPath === '/' ? `/${attrs.name}` : `${currentPath}/${attrs.name}`;
        const action = btn.dataset.action;

        switch (action) {
          case 'edit':
            editFile(filePath);
            break;
          case 'download':
            downloadFile(filePath);
            break;
          case 'rename':
            renameFile(filePath, attrs.name);
            break;
          case 'delete':
            deleteFile(filePath, attrs.name, isDir);
            break;
        }
      });
    }
  }

  return div;
}

function getFileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  const icons = {
    'jar': '☕',
    'yml': '⚙️',
    'yaml': '⚙️',
    'json': '📋',
    'properties': '🔧',
    'txt': '📄',
    'log': '📜',
    'conf': '🔧',
    'cfg': '🔧',
    'dat': '💿',
    'dat_old': '💿',
    'mca': '🗺️',
    'png': '🖼️',
    'jpg': '🖼️',
    'zip': '📦',
    'gz': '📦',
    'tar': '📦',
    'sk': '📜',
    'js': '💛',
    'toml': '⚙️'
  };
  return icons[ext] || '📄';
}

async function editFile(filePath) {
  try {
    const content = await apiCall(`/api/client/servers/${config.serverId}/files/contents?file=${encodeURIComponent(filePath)}`);

    document.getElementById('editor-filename').textContent = filePath.split('/').pop();
    document.getElementById('file-editor-content').value = typeof content === 'string' ? content : JSON.stringify(content, null, 2);

    const modal = document.getElementById('file-editor-modal');
    modal.classList.remove('hidden');
    modal.dataset.filePath = filePath;

  } catch (err) {
    toast('Datei konnte nicht geladen werden: ' + err.message, 'error');
  }
}

async function saveFile(filePath, content) {
  try {
    let url = config.panelUrl.replace(/\/+$/, '') + `/api/client/servers/${config.serverId}/files/write?file=${encodeURIComponent(filePath)}`;

    if (config.useProxy) {
      url = CORS_PROXY + encodeURIComponent(url);
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'text/plain'
      },
      body: content
    });

    if (!response.ok) throw new Error(`Status ${response.status}`);

    toast('Datei gespeichert! ✅', 'success');
    return true;
  } catch (err) {
    toast('Speichern fehlgeschlagen: ' + err.message, 'error');
    return false;
  }
}

async function downloadFile(filePath) {
  try {
    const data = await apiCall(`/api/client/servers/${config.serverId}/files/download?file=${encodeURIComponent(filePath)}`);

    if (data && data.attributes && data.attributes.url) {
      window.open(data.attributes.url, '_blank');
      toast('Download gestartet!', 'success');
    }
  } catch (err) {
    toast('Download fehlgeschlagen: ' + err.message, 'error');
  }
}

async function uploadFile(file, targetDir) {
  try {
    const uploadUrl = `/api/client/servers/${config.serverId}/files/upload`;

    // Get upload URL
    const data = await apiCall(uploadUrl);
    if (data && data.attributes && data.attributes.url) {
      let url = data.attributes.url + `&directory=${encodeURIComponent(targetDir)}`;

      const formData = new FormData();
      formData.append('files', file);

      const response = await fetch(url, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error(`Upload Status ${response.status}`);

      toast(`${file.name} hochgeladen! ✅`, 'success');
      loadFiles(targetDir);
    }
  } catch (err) {
    toast('Upload fehlgeschlagen: ' + err.message, 'error');
  }
}

function renameFile(filePath, currentName) {
  document.getElementById('rename-input').value = currentName;
  const modal = document.getElementById('rename-modal');
  modal.classList.remove('hidden');
  modal.dataset.filePath = filePath;
  modal.dataset.directory = currentPath;
  document.getElementById('rename-input').focus();
}

async function confirmRename() {
  const modal = document.getElementById('rename-modal');
  const newName = document.getElementById('rename-input').value.trim();
  const oldPath = modal.dataset.filePath;
  const directory = modal.dataset.directory;

  if (!newName) return;

  try {
    const oldName = oldPath.split('/').pop();
    const root = directory === '/' ? '/' : directory + '/';

    await apiCall(`/api/client/servers/${config.serverId}/files/rename`, 'PUT', {
      root: root,
      files: [
        { from: oldName, to: newName }
      ]
    });

    toast('Umbenannt! ✅', 'success');
    modal.classList.add('hidden');
    loadFiles(currentPath);
  } catch (err) {
    toast('Umbenennen fehlgeschlagen: ' + err.message, 'error');
  }
}

function deleteFile(filePath, name, isDir) {
  document.getElementById('delete-message').textContent =
    `Willst du "${name}" wirklich löschen?${isDir ? ' (Ordner mit allen Inhalten!)' : ''}`;
  const modal = document.getElementById('delete-modal');
  modal.classList.remove('hidden');
  modal.dataset.filePath = filePath;
  modal.dataset.directory = currentPath;
}

async function confirmDelete() {
  const modal = document.getElementById('delete-modal');
  const filePath = modal.dataset.filePath;

  try {
    const fileName = filePath.split('/').pop();
    const root = currentPath === '/' ? '/' : currentPath;

    await apiCall(`/api/client/servers/${config.serverId}/files/delete`, 'POST', {
      root: root,
      files: [fileName]
    });

    toast('Gelöscht! ✅', 'success');
    modal.classList.add('hidden');
    loadFiles(currentPath);
  } catch (err) {
    toast('Löschen fehlgeschlagen: ' + err.message, 'error');
  }
}

async function createFolder(name) {
  try {
    await apiCall(`/api/client/servers/${config.serverId}/files/create-folder`, 'POST', {
      root: currentPath,
      name: name
    });
    toast('Ordner erstellt! ✅', 'success');
    loadFiles(currentPath);
  } catch (err) {
    toast('Ordner erstellen fehlgeschlagen: ' + err.message, 'error');
  }
}

// ===== PLUGINS =====
async function loadPlugins() {
  const pluginList = document.getElementById('plugin-list');
  pluginList.innerHTML = '<div class="file-list-loading"><span class="spinner"></span> Lade Plugins...</div>';

  try {
    const data = await apiCall(`/api/client/servers/${config.serverId}/files/list?directory=${encodeURIComponent('/plugins')}`);

    if (!data || !data.data || data.data.length === 0) {
      pluginList.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔌</div><div class="empty-state-text">Keine Plugins installiert</div></div>';
      return;
    }

    pluginList.innerHTML = '';
    const plugins = data.data.filter(f => f.attributes.name.endsWith('.jar'));

    if (plugins.length === 0) {
      pluginList.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔌</div><div class="empty-state-text">Keine .jar Plugins gefunden</div></div>';
      return;
    }

    plugins.forEach(plugin => {
      const attrs = plugin.attributes;
      const div = document.createElement('div');
      div.className = 'plugin-item';
      div.innerHTML = `
        <span class="plugin-icon">☕</span>
        <div class="plugin-info">
          <div class="plugin-name">${attrs.name}</div>
          <div class="plugin-size">${formatSize(attrs.size)}</div>
        </div>
        <button class="plugin-delete" data-name="${attrs.name}">🗑️ Löschen</button>
      `;

      div.querySelector('.plugin-delete').addEventListener('click', async () => {
        if (confirm(`Plugin "${attrs.name}" wirklich löschen?`)) {
          try {
            await apiCall(`/api/client/servers/${config.serverId}/files/delete`, 'POST', {
              root: '/plugins',
              files: [attrs.name]
            });
            toast(`${attrs.name} gelöscht!`, 'success');
            loadPlugins();
          } catch (err) {
            toast('Löschen fehlgeschlagen: ' + err.message, 'error');
          }
        }
      });

      pluginList.appendChild(div);
    });

  } catch (err) {
    pluginList.innerHTML = `<div class="empty-state"><div class="empty-state-icon">❌</div><div class="empty-state-text">Fehler: ${err.message}</div></div>`;
  }
}

// ===== SETTINGS =====
async function loadSettings(fileName) {
  const textarea = document.getElementById('settings-content');
  textarea.value = 'Lade...';
  textarea.disabled = true;

  try {
    const content = await apiCall(`/api/client/servers/${config.serverId}/files/contents?file=${encodeURIComponent('/' + fileName)}`);
    textarea.value = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    textarea.disabled = false;
  } catch (err) {
    textarea.value = `Fehler: ${err.message}\n\nDie Datei "${fileName}" existiert vielleicht noch nicht. Starte den Server einmal, damit alle Config-Dateien erstellt werden.`;
    textarea.disabled = false;
  }
}

async function saveSettings() {
  const fileName = document.getElementById('settings-file-select').value;
  const content = document.getElementById('settings-content').value;

  const success = await saveFile('/' + fileName, content);
  if (success) {
    toast('Einstellungen gespeichert! Server neustarten für Änderungen.', 'success');
  }
}

// ===== BREADCRUMB =====
function updateBreadcrumb(dirPath) {
  const bc = document.getElementById('file-breadcrumb');
  bc.innerHTML = '';

  const parts = dirPath.split('/').filter(p => p);

  // Root
  const rootItem = document.createElement('span');
  rootItem.className = 'breadcrumb-item';
  rootItem.textContent = '🏠 /';
  rootItem.dataset.path = '/';
  rootItem.addEventListener('click', () => loadFiles('/'));
  bc.appendChild(rootItem);

  let accumulated = '';
  parts.forEach((part, i) => {
    const sep = document.createElement('span');
    sep.className = 'breadcrumb-separator';
    sep.textContent = '›';
    bc.appendChild(sep);

    accumulated += '/' + part;
    const item = document.createElement('span');
    item.className = 'breadcrumb-item';
    item.textContent = part;
    item.dataset.path = accumulated;
    const pathForClick = accumulated;
    item.addEventListener('click', () => loadFiles(pathForClick));
    bc.appendChild(item);
  });
}

// ===== UTILITIES =====
function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('de-DE') + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return dateStr;
  }
}

function toast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const div = document.createElement('div');
  div.className = `toast ${type}`;

  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  div.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><span>${message}</span>`;

  container.appendChild(div);

  setTimeout(() => {
    div.style.animation = 'toastOut 0.3s ease-in forwards';
    setTimeout(() => div.remove(), 300);
  }, 4000);
}

// ===== EVENT LISTENERS =====
function setupEventListeners() {
  // Setup Form
  document.getElementById('setup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    config.panelUrl = document.getElementById('cfg-panel-url').value.trim().replace(/\/+$/, '');
    config.apiKey = document.getElementById('cfg-api-key').value.trim();
    config.serverId = document.getElementById('cfg-server-id').value.trim();
    config.useProxy = document.getElementById('cfg-use-proxy').checked;
    saveConfig();
    connectToPanel();
  });

  // Disconnect
  document.getElementById('btn-disconnect').addEventListener('click', () => {
    stopPolling();
    localStorage.removeItem(CONFIG_KEY);
    config = { panelUrl: '', apiKey: '', serverId: '', useProxy: true };
    showSetup();
    toast('Verbindung getrennt', 'info');
  });

  // Navigation
  document.querySelectorAll('.nav-item[data-tab]').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab(item.dataset.tab);
    });
  });

  // Sidebar toggle (mobile)
  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  // Server Power
  document.getElementById('btn-start').addEventListener('click', () => sendPower('start'));
  document.getElementById('btn-stop').addEventListener('click', () => sendPower('stop'));
  document.getElementById('btn-restart').addEventListener('click', () => sendPower('restart'));
  document.getElementById('btn-kill').addEventListener('click', () => {
    if (confirm('Server wirklich killen? Ungespeicherte Daten gehen verloren!')) {
      sendPower('kill');
    }
  });

  // Copy address
  document.getElementById('btn-copy-address').addEventListener('click', () => {
    const addr = document.getElementById('info-address').textContent;
    if (addr && addr !== '—') {
      navigator.clipboard.writeText(addr).then(() => toast('Adresse kopiert! 📋', 'success'));
    }
  });

  // Console input
  document.getElementById('console-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const input = e.target;
      const cmd = input.value.trim();
      if (cmd) {
        sendCommand(cmd);
        input.value = '';
      }
    }
  });

  document.getElementById('btn-send-command').addEventListener('click', () => {
    const input = document.getElementById('console-input');
    const cmd = input.value.trim();
    if (cmd) {
      sendCommand(cmd);
      input.value = '';
    }
  });

  document.getElementById('btn-console-clear').addEventListener('click', () => {
    document.getElementById('console-output').innerHTML = '';
  });

  document.getElementById('btn-console-scroll').addEventListener('click', () => {
    const output = document.getElementById('console-output');
    output.scrollTop = output.scrollHeight;
  });

  // File Upload
  document.getElementById('file-upload-input').addEventListener('change', async (e) => {
    const files = e.target.files;
    for (const file of files) {
      await uploadFile(file, currentPath);
    }
    e.target.value = '';
  });

  // New Folder
  document.getElementById('btn-new-folder').addEventListener('click', () => {
    document.getElementById('new-folder-name').value = '';
    document.getElementById('new-folder-modal').classList.remove('hidden');
    document.getElementById('new-folder-name').focus();
  });

  document.getElementById('new-folder-create').addEventListener('click', () => {
    const name = document.getElementById('new-folder-name').value.trim();
    if (name) {
      createFolder(name);
      document.getElementById('new-folder-modal').classList.add('hidden');
    }
  });

  document.getElementById('new-folder-cancel').addEventListener('click', () => {
    document.getElementById('new-folder-modal').classList.add('hidden');
  });
  document.getElementById('new-folder-close').addEventListener('click', () => {
    document.getElementById('new-folder-modal').classList.add('hidden');
  });

  // File Editor
  document.getElementById('editor-save').addEventListener('click', async () => {
    const modal = document.getElementById('file-editor-modal');
    const filePath = modal.dataset.filePath;
    const content = document.getElementById('file-editor-content').value;
    const success = await saveFile(filePath, content);
    if (success) {
      modal.classList.add('hidden');
      loadFiles(currentPath);
    }
  });

  document.getElementById('editor-cancel').addEventListener('click', () => {
    document.getElementById('file-editor-modal').classList.add('hidden');
  });
  document.getElementById('editor-close').addEventListener('click', () => {
    document.getElementById('file-editor-modal').classList.add('hidden');
  });

  // Rename
  document.getElementById('rename-confirm').addEventListener('click', confirmRename);
  document.getElementById('rename-cancel').addEventListener('click', () => {
    document.getElementById('rename-modal').classList.add('hidden');
  });
  document.getElementById('rename-close').addEventListener('click', () => {
    document.getElementById('rename-modal').classList.add('hidden');
  });
  document.getElementById('rename-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmRename();
  });

  // Delete
  document.getElementById('delete-confirm').addEventListener('click', confirmDelete);
  document.getElementById('delete-cancel').addEventListener('click', () => {
    document.getElementById('delete-modal').classList.add('hidden');
  });
  document.getElementById('delete-close').addEventListener('click', () => {
    document.getElementById('delete-modal').classList.add('hidden');
  });

  // Plugin Upload
  document.getElementById('plugin-upload-input').addEventListener('change', async (e) => {
    const files = e.target.files;
    for (const file of files) {
      if (!file.name.endsWith('.jar')) {
        toast('Nur .jar Dateien erlaubt!', 'warning');
        continue;
      }
      await uploadFile(file, '/plugins');
    }
    e.target.value = '';
    loadPlugins();
  });

  // Settings
  document.getElementById('settings-file-select').addEventListener('change', (e) => {
    loadSettings(e.target.value);
  });

  document.getElementById('btn-save-settings').addEventListener('click', saveSettings);

  // Close modals on backdrop click
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', () => {
      backdrop.closest('.modal').classList.add('hidden');
    });
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
      document.getElementById('sidebar').classList.remove('open');
    }
  });

  // Drag & Drop auf Dateien-Tab
  const filesTab = document.getElementById('tab-files');
  filesTab.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    filesTab.style.outline = '2px dashed var(--accent)';
    filesTab.style.outlineOffset = '-4px';
  });

  filesTab.addEventListener('dragleave', (e) => {
    e.preventDefault();
    filesTab.style.outline = 'none';
  });

  filesTab.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    filesTab.style.outline = 'none';

    const files = e.dataTransfer.files;
    for (const file of files) {
      await uploadFile(file, currentPath);
    }
  });
}

function switchTab(tabName) {
  // Update nav
  document.querySelectorAll('.nav-item[data-tab]').forEach(item => {
    item.classList.toggle('active', item.dataset.tab === tabName);
  });

  // Update content
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.toggle('active', tab.id === `tab-${tabName}`);
  });

  // Update title
  const titles = {
    dashboard: 'Dashboard',
    console: 'Konsole',
    files: 'Dateimanager',
    plugins: 'Plugins',
    settings: 'Einstellungen'
  };
  document.getElementById('page-title').textContent = titles[tabName] || tabName;

  // Load tab-specific content
  switch (tabName) {
    case 'files':
      loadFiles(currentPath);
      break;
    case 'plugins':
      loadPlugins();
      break;
    case 'settings':
      loadSettings(document.getElementById('settings-file-select').value);
      break;
    case 'console':
      setTimeout(() => {
        const output = document.getElementById('console-output');
        output.scrollTop = output.scrollHeight;
      }, 100);
      break;
  }

  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('open');
}
