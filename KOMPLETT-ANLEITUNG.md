# 🎮 Minecraft Server Panel — KOMPLETT-ANLEITUNG

> **Alles 100% GRATIS, keine Kreditkarte, kein localhost, alles online!**

---

## 🏗️ So funktioniert es

```
DEIN BROWSER (Chrome/Firefox/Edge)
         │
         ▼
┌─────────────────────────────────┐
│   DEINE WEBSITE (Render.com)    │
│   URL: mc-panel.onrender.com    │
│                                 │
│   • Start / Stop / Restart      │
│   • Live-Konsole                │
│   • Dateimanager                │
│   • Plugin-Upload               │
│   • Welten-Manager              │
│   • Spieler-Verwaltung          │
│   • Einstellungen               │
│                                 │
│   100% GRATIS, immer online!    │
└────────────┬────────────────────┘
             │ Pterodactyl API
             ▼
┌─────────────────────────────────┐
│   MC SERVER (FalixNodes.net)    │
│                                 │
│   • Gratis 4 GB RAM             │
│   • Java & Bedrock              │
│   • Paper/Spigot/Forge/Fabric   │
│   • 24/7 online                 │
│   • Keine Kreditkarte!          │
│   • Pterodactyl Panel mit API   │
└─────────────────────────────────┘
```

---

## 📋 Was du brauchst (NUR 2 Accounts!)

| Account | Link | Wofür | Kreditkarte? |
|---|---|---|---|
| **FalixNodes** | https://falixnodes.net | Gratis MC Server | ❌ NEIN |
| **Render.com** | https://render.com | Website hosten | ❌ NEIN |
| **GitHub** | https://github.com | Code speichern | ❌ NEIN |

---

## 📝 Schritt-für-Schritt Anleitung

### Schritt 1: FalixNodes Account erstellen + Server erstellen

1. Gehe zu **https://falixnodes.net**
2. Klicke **"Sign Up"** / Registrieren
3. Erstelle einen Account (E-Mail + Passwort)
4. Nach dem Login: Klicke **"Create Server"**
5. Wähle:
   - **Game**: Minecraft Java
   - **Server Software**: Paper (empfohlen für Plugins!)
   - **Version**: 1.21.1 (oder neueste)
   - **RAM**: 4 GB (oder was verfügbar ist)
6. Klicke **"Create"**

### Schritt 2: API-Key holen (WICHTIG!)

1. Gehe zu deinem **FalixNodes Panel** (der Link wird dir nach Server-Erstellung gezeigt)
2. Klicke oben rechts auf deinen **Benutzernamen** / Profil
3. Gehe zu **"API Credentials"** oder **"Account Settings"**
4. Klicke **"Create API Key"**
5. Gib eine Beschreibung ein: `minecraft-panel`
6. **KOPIERE DEN API-KEY** und speichere ihn sicher! Du brauchst ihn gleich.

### Schritt 3: Server-ID finden

1. Im Panel, gehe zu deinem Server
2. Schau in die **URL** deines Browsers — da steht sowas wie:
   `https://panel.falixnodes.net/server/abc12345`
3. Der Teil nach `/server/` ist deine **Server-ID**: `abc12345`
4. **Notiere dir die Server-ID!**

### Schritt 4: Panel-URL notieren

Die Panel-URL ist die Adresse deines FalixNodes Panels, z.B.:
`https://panel.falixnodes.net`

### Schritt 5: Website auf Render.com deployen

1. Gehe zu **https://github.com** und erstelle ein Repository
2. Lade den `frontend/` Ordner von deinem Desktop hoch
3. Gehe zu **https://render.com**
4. Logge dich ein (am besten mit GitHub)
5. Klicke **"New" → "Static Site"**
6. Wähle dein GitHub Repository
7. Einstellungen:
   - **Name**: `minecraft-panel`
   - **Publish Directory**: `./`
8. Klicke **"Create Static Site"**
9. Deine Website ist live! URL: `https://minecraft-panel.onrender.com`

### Schritt 6: Website konfigurieren

1. Öffne deine Website
2. Beim ersten Mal wirst du nach 3 Dingen gefragt:
   - **Panel URL**: z.B. `https://panel.falixnodes.net`
   - **API Key**: der Key aus Schritt 2
   - **Server ID**: die ID aus Schritt 3
3. Das wird lokal gespeichert (im Browser)
4. FERTIG! 🎉

---

## 🌐 Website Features

### Dashboard
- ⚡ Server Status (Online/Offline/Starting)
- ▶️ START Button
- ⏹️ STOP Button
- 🔄 RESTART Button
- 👥 Spieler-Anzahl
- 💾 RAM/CPU Nutzung
- 🕐 Uptime

### Live-Konsole
- 🖥️ Echtzeit Server-Logs
- ⌨️ Befehle eingeben
- 📜 Scrollbare History

### Dateimanager
- 📁 Ordner durchsuchen
- 📄 Dateien lesen/bearbeiten
- ⬆️ Dateien hochladen
- ⬇️ Dateien herunterladen
- 🗑️ Dateien/Ordner löschen
- ✏️ Umbenennen
- 📁 Neue Ordner erstellen

### Plugins
- 📋 Installierte Plugins anzeigen
- ⬆️ Plugin .jar hochladen
- 🗑️ Plugins löschen

### Einstellungen
- 🎮 server.properties bearbeiten
- ✏️ Alle Config-Dateien bearbeiten

---

## ❓ FAQ

### "Ist das wirklich gratis?"
JA! FalixNodes und Render.com sind beide 100% gratis ohne Kreditkarte.

### "Geht der Server aus wenn ich die Website schließe?"
NEIN! Der MC Server läuft auf FalixNodes Servern, nicht auf deinem PC. 
Er läuft weiter auch wenn du die Website schließt.
(Aber: FalixNodes kann Server nach langer Inaktivität pausieren)

### "Können meine Freunde auf den Server?"
JA! Die Server-Adresse findest du im FalixNodes Panel.

### "Kann ich Plugins installieren?"
JA! Über den Dateimanager auf der Website kannst du .jar Dateien 
in den plugins/ Ordner hochladen.

---

## 🗂️ Projekt-Dateien

```
Minecraft Server Panel/
├── KOMPLETT-ANLEITUNG.md      ← Diese Datei!
├── frontend/                   ← Website (→ auf Render.com deployen)
│   ├── index.html              ← Hauptseite
│   ├── css/
│   │   └── styles.css          ← Design
│   └── js/
│       └── app.js              ← Alle Funktionen
└── backend/                    ← (nicht nötig - läuft über FalixNodes API)
```
