// ============================================
// Minecraft Server Process Manager
// Verwaltet den MC Server Prozess (Start/Stop/Restart)
// ============================================

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

class MinecraftManager {
  constructor(serverPath, jarName, minRam, maxRam) {
    this.serverPath = path.resolve(serverPath);
    this.jarName = jarName || 'server.jar';
    this.minRam = minRam || '2G';
    this.maxRam = maxRam || '4G';
    this.process = null;
    this.status = 'offline'; // offline, starting, online, stopping
    this.consoleListeners = [];
    this.consoleHistory = [];
    this.maxHistoryLines = 500;
    this.startTime = null;
    this.playerCount = 0;
    this.maxPlayers = 20;
    this.players = [];
  }

  // Server starten
  start() {
    return new Promise((resolve, reject) => {
      if (this.process) {
        return reject(new Error('Server läuft bereits!'));
      }

      const jarPath = path.join(this.serverPath, this.jarName);
      if (!fs.existsSync(jarPath)) {
        return reject(new Error(`Server JAR nicht gefunden: ${jarPath}`));
      }

      // EULA prüfen
      const eulaPath = path.join(this.serverPath, 'eula.txt');
      if (!fs.existsSync(eulaPath)) {
        fs.writeFileSync(eulaPath, 'eula=true\n');
      } else {
        const eulaContent = fs.readFileSync(eulaPath, 'utf8');
        if (!eulaContent.includes('eula=true')) {
          fs.writeFileSync(eulaPath, eulaContent.replace('eula=false', 'eula=true'));
        }
      }

      this.status = 'starting';
      this._broadcast('[PANEL] Server wird gestartet...\n');

      const javaArgs = [
        `-Xms${this.minRam}`,
        `-Xmx${this.maxRam}`,
        '-XX:+UseG1GC',
        '-XX:+ParallelRefProcEnabled',
        '-XX:MaxGCPauseMillis=200',
        '-XX:+UnlockExperimentalVMOptions',
        '-XX:+DisableExplicitGC',
        '-XX:+AlwaysPreTouch',
        '-jar',
        this.jarName,
        'nogui'
      ];

      this.process = spawn('java', javaArgs, {
        cwd: this.serverPath,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.startTime = Date.now();

      // Stdout verarbeiten
      this.process.stdout.on('data', (data) => {
        const text = data.toString();
        this._broadcast(text);
        this._parseOutput(text);
      });

      // Stderr verarbeiten
      this.process.stderr.on('data', (data) => {
        const text = data.toString();
        this._broadcast(text);
      });

      // Prozess beendet
      this.process.on('close', (code) => {
        this.process = null;
        this.status = 'offline';
        this.startTime = null;
        this.playerCount = 0;
        this.players = [];
        this._broadcast(`[PANEL] Server gestoppt (Exit Code: ${code})\n`);
      });

      this.process.on('error', (err) => {
        this.process = null;
        this.status = 'offline';
        this.startTime = null;
        this._broadcast(`[PANEL] FEHLER: ${err.message}\n`);
        reject(err);
      });

      // Warten bis "Done" in der Konsole erscheint
      const checkStarted = (text) => {
        if (text.includes('Done') && text.includes('For help')) {
          this.status = 'online';
          this._broadcast('[PANEL] ✅ Server ist online!\n');
          resolve();
        }
      };
      this.consoleListeners.push(checkStarted);

      // Timeout nach 120 Sekunden
      setTimeout(() => {
        if (this.status === 'starting') {
          this.status = 'online'; // Trotzdem als online markieren
          resolve();
        }
      }, 120000);
    });
  }

  // Server stoppen
  stop() {
    return new Promise((resolve, reject) => {
      if (!this.process) {
        return reject(new Error('Server läuft nicht!'));
      }

      this.status = 'stopping';
      this._broadcast('[PANEL] Server wird gestoppt...\n');

      // "stop" Befehl an den MC Server senden
      this.sendCommand('stop');

      // Warten bis der Prozess sich beendet
      const timeout = setTimeout(() => {
        // Falls der Server nach 30 Sekunden nicht gestoppt hat, killen
        if (this.process) {
          this.process.kill('SIGKILL');
          this._broadcast('[PANEL] Server wurde zwangsweise gestoppt.\n');
        }
        resolve();
      }, 30000);

      this.process.on('close', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  // Server neustarten
  async restart() {
    if (this.process) {
      await this.stop();
      // Kurz warten
      await new Promise(r => setTimeout(r, 3000));
    }
    await this.start();
  }

  // Befehl an den MC Server senden
  sendCommand(command) {
    if (!this.process || !this.process.stdin) {
      throw new Error('Server läuft nicht!');
    }
    this.process.stdin.write(command + '\n');
    this._broadcast(`> ${command}\n`);
  }

  // Server Status
  getStatus() {
    return {
      status: this.status,
      uptime: this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0,
      players: this.playerCount,
      maxPlayers: this.maxPlayers,
      playerList: this.players,
      ram: this._getRAMUsage(),
      cpu: this._getCPUUsage()
    };
  }

  // RAM Nutzung des Systems
  _getRAMUsage() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    return {
      used: Math.round(usedMem / 1024 / 1024),  // MB
      total: Math.round(totalMem / 1024 / 1024), // MB
      percent: Math.round((usedMem / totalMem) * 100)
    };
  }

  // CPU Nutzung
  _getCPUUsage() {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;
    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });
    return {
      percent: Math.round(100 - (totalIdle / totalTick * 100)),
      cores: cpus.length
    };
  }

  // Konsolen-Output parsen (Spieler erkennen, etc.)
  _parseOutput(text) {
    // Spieler joined
    const joinMatch = text.match(/(\w+) joined the game/);
    if (joinMatch) {
      const name = joinMatch[1];
      if (!this.players.includes(name)) {
        this.players.push(name);
        this.playerCount = this.players.length;
      }
    }

    // Spieler left
    const leaveMatch = text.match(/(\w+) left the game/);
    if (leaveMatch) {
      const name = leaveMatch[1];
      this.players = this.players.filter(p => p !== name);
      this.playerCount = this.players.length;
    }

    // Max Players aus server.properties
    const maxMatch = text.match(/max-players[=:](\d+)/i);
    if (maxMatch) {
      this.maxPlayers = parseInt(maxMatch[1]);
    }

    // Server fertig gestartet
    if (text.includes('Done') && text.includes('For help')) {
      this.status = 'online';
    }
  }

  // Nachricht an alle Konsolen-Listener senden
  _broadcast(text) {
    // In History speichern
    this.consoleHistory.push(text);
    if (this.consoleHistory.length > this.maxHistoryLines) {
      this.consoleHistory.shift();
    }

    // An alle Listener senden
    this.consoleListeners.forEach(listener => {
      try {
        listener(text);
      } catch (e) {
        // Listener entfernen wenn Fehler
      }
    });
  }

  // Konsolen-Listener hinzufügen
  addConsoleListener(listener) {
    this.consoleListeners.push(listener);
    return () => {
      this.consoleListeners = this.consoleListeners.filter(l => l !== listener);
    };
  }

  // Konsolen-History abrufen
  getConsoleHistory() {
    return this.consoleHistory.join('');
  }
}

module.exports = MinecraftManager;
