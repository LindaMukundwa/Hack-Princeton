// Simple Node.js Express backend to proxy Flat.io API requests securely
// FLAT_API_KEY en .env file 
require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const app = express();
const PORT = process.env.PORT || 3001;

// Search Flat.io for a score matching the query (MIDI file name)
app.get('/api/flat/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Missing query' });
  const url = `https://api.flat.io/v2/scores/search?q=${encodeURIComponent(query)}`;
  try {
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${process.env.FLAT_API_KEY}` }
    });
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get MusicXML for a given Flat.io score ID
app.get('/api/flat/musicxml', async (req, res) => {
  const scoreId = req.query.id;
  if (!scoreId) return res.status(400).json({ error: 'Missing score id' });
  const url = `https://api.flat.io/v2/scores/${scoreId}/export/musicxml`;
  try {
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${process.env.FLAT_API_KEY}` }
    });
    if (!response.ok) throw new Error('Flat.io API error');
    res.set('Content-Type', 'application/vnd.recordare.musicxml+xml');
    const xml = await response.text();
    res.send(xml);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Flat.io proxy server running on port ${PORT}`);
});
