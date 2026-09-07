const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); // Needs node-fetch v2
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'frontend')));

const PANEL_URL = 'https://client.falixnodes.net';

app.all('/api/*', async (req, res) => {
  try {
    const url = PANEL_URL + req.url;
    
    const options = {
      method: req.method,
      headers: {
        'Authorization': req.headers.authorization || '',
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    };

    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      options.body = JSON.stringify(req.body);
    }

    const response = await fetch(url, options);
    
    // Wir leiten alle Headers weiter (optional, aber hilfreich)
    response.headers.forEach((val, key) => {
      res.setHeader(key, val);
    });

    const data = await response.text();
    res.status(response.status).send(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
