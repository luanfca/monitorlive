import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Add CORS headers for proxy
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Stub for push subscription
  app.post('/push/subscribe', (req, res) => {
    console.log('Push subscription received (stubbed)');
    res.json({ status: 'success' });
  });

  const fetchSofa = async (url: string, res: express.Response, req?: express.Request) => {
    try {
      console.log(`Proxying request to: ${url}`);
      const headers: HeadersInit = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.sofascore.com/',
        'Origin': 'https://www.sofascore.com',
        'Accept': 'application/json, text/plain, */*'
      };

      if (req && req.headers['accept']) {
          headers['Accept'] = req.headers['accept'];
      }

      const response = await fetch(url, {
        headers
      });

      if (!response.ok) {
        if (response.status === 404) {
            return res.status(404).json({ error: 'Not found' });
        }
        console.error(`SofaScore API error: ${response.status} for ${url}`);
        return res.status(response.status).json({ error: `SofaScore API error: ${response.status}` });
      }

      const contentType = response.headers.get('content-type');
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      }

      if (response.body) {
          // @ts-ignore
          const nodeStream = Readable.fromWeb(response.body);
          nodeStream.pipe(res);
      } else {
          res.end();
      }
    } catch (error) {
      console.error('Proxy error:', error);
      res.status(500).json({ error: 'Proxy error' });
    }
  };

  // Live events
  app.get('/live', async (req, res) => {
    // Correct endpoint for live events
    await fetchSofa(`https://api.sofascore.com/api/v1/sport/football/events/live`, res, req);
  });

  // Lineups
  app.get('/lineups/:id', async (req, res) => {
    await fetchSofa(`https://api.sofascore.com/api/v1/event/${req.params.id}/lineups`, res, req);
  });

  // Player stats
  app.get('/player/:eventId/:playerId', async (req, res) => {
    // Note: SofaScore API structure might vary. Trying standard endpoint.
    // Sometimes stats are under /event/:id/player/:playerId/statistics
    // Or just /player/:playerId/events/last/0 (but we need specific event)
    // Let's try /event/:eventId/player/:playerId/statistics
    await fetchSofa(`https://api.sofascore.com/api/v1/event/${req.params.eventId}/player/${req.params.playerId}/statistics`, res, req);
  });

  // Player image
  app.get('/player-image/:id', async (req, res) => {
    await fetchSofa(`https://api.sofascore.app/api/v1/player/${req.params.id}/image`, res, req);
  });

  // Heatmap
  app.get('/heatmap/:eventId/:playerId', async (req, res) => {
    await fetchSofa(`https://api.sofascore.com/api/v1/event/${req.params.eventId}/player/${req.params.playerId}/heatmap`, res, req);
  });
  
  // Heatmap Data (Points)
  app.get('/heatmap/:eventId/:playerId/data', async (req, res) => {
      await fetchSofa(`https://api.sofascore.com/api/v1/event/${req.params.eventId}/player/${req.params.playerId}/heatmap`, res, req);
  });

  // Scheduled events (Fallback for live)
  app.get('/sport/football/scheduled-events/:date', async (req, res) => {
    await fetchSofa(`https://api.sofascore.com/api/v1/sport/football/scheduled-events/${req.params.date}`, res, req);
  });


  // Vite middleware
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
