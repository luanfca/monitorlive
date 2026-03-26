import express from 'express';
import path from 'path';
import { startMonitor, updateClientMonitor, runMonitorCheck } from './server/monitor.js';

const distPath = path.join(process.cwd(), 'dist');

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Add CORS headers for proxy
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Cache-Control');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  app.use(express.json());

  // Inicia o monitor de jogos
  startMonitor();

  // Endpoint para atualizar os jogadores monitorados pelo cliente
  app.post('/api/update-monitor', (req, res) => {
    const { token, players, userId } = req.body;
    if (!token || !Array.isArray(players)) {
        return res.status(400).json({ error: 'Invalid payload' });
    }
    updateClientMonitor(token, players, userId);
    res.json({ status: 'monitoring updated' });
  });

  // Endpoint de cron para manter o servidor acordado e forçar a checagem
  app.get('/api/cron', async (req, res) => {
    console.log('Cron job acionado. Executando checagem...');
    await runMonitorCheck();
    res.json({ status: 'success', message: 'Monitor check executed' });
  });

  // Endpoint para enviar notificacao de teste
  app.post('/api/test-notification', async (req, res) => {
    const { token } = req.body;
    if (!token) {
        return res.status(400).json({ error: 'Token is required' });
    }
    
    try {
        const { messaging } = await import('./server/firebaseAdmin.js');
        if (messaging) {
            await messaging.send({
                token,
                notification: {
                    title: 'LiveMatch Pro - Teste!',
                    body: 'Notificação de teste recebida com sucesso!'
                }
            });
            res.json({ status: 'success' });
        } else {
            res.status(500).json({ error: 'Firebase Admin not initialized' });
        }
    } catch (e: any) {
        if (e.code === 'messaging/registration-token-not-registered' || e.message?.includes('NotRegistered')) {
            console.log(`Token not registered (expired or invalid), removing from monitor: ${token.substring(0, 10)}...`);
            const { removeClientMonitor } = await import('./server/monitor.js');
            removeClientMonitor(token);
            res.status(404).json({ error: 'Token not registered' });
        } else {
            console.error('Error sending test notification:', e);
            res.status(500).json({ error: 'Failed to send notification' });
        }
    }
  });

  // Stub for push subscription
  app.post('/push/subscribe', (req, res) => {
    console.log('Push subscription received (stubbed)');
    res.json({ status: 'success' });
  });

  const PROXY_PROVIDERS = [
      (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
      (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
      (url: string) => `https://thingproxy.freeboard.io/fetch/${url}`,
      (url: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
      (url: string) => `https://proxy.cors.sh/${url}`,
      (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
  ];

  const fetchWithProxies = async (targetUrl: string): Promise<any> => {
      const shuffledProxies = [...PROXY_PROVIDERS].sort(() => Math.random() - 0.5);
      
      for (const proxyGen of shuffledProxies) {
          const proxyUrl = proxyGen(targetUrl);
          try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 15000);

              const response = await fetch(proxyUrl, {
                  method: 'GET',
                  signal: controller.signal
              });
              clearTimeout(timeoutId);

              if (response.ok) {
                  const text = await response.text();
                  if (text) {
                      try {
                          const json = JSON.parse(text);
                          if (json.contents) {
                              return JSON.parse(json.contents);
                          }
                          return json;
                      } catch (e) {
                          return null;
                      }
                  }
              }
          } catch (error) {
              // Ignore and try next proxy
          }
      }
      return null;
  };

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
        
        if (response.status === 403) {
            console.log(`Direct fetch failed with 403 for ${url}, trying proxies from backend...`);
            const proxyData = await fetchWithProxies(url);
            if (proxyData) {
                return res.json(proxyData);
            }
        }

        console.error(`SofaScore API error: ${response.status} for ${url}`);
        return res.status(response.status).json({ error: `SofaScore API error: ${response.status}` });
      }

      const contentType = response.headers.get('content-type');
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      }

      // Buffer the response to check if it's empty
      const buffer = await response.arrayBuffer();
      
      if (buffer.byteLength === 0) {
          console.warn(`Empty response from ${url}`);
          return res.status(204).end();
      }

      res.send(Buffer.from(buffer));
    } catch (error) {
      console.error('Proxy error:', error);
      res.status(500).json({ error: 'Proxy error' });
    }
  };

  // Live events
  app.get('/live', async (req, res) => {
    // Correct endpoint for live events
    await fetchSofa(`https://api.sofascore.app/api/v1/sport/football/events/live`, res, req);
  });

  // Lineups
  app.get('/lineups/:id', async (req, res) => {
    await fetchSofa(`https://api.sofascore.app/api/v1/event/${req.params.id}/lineups`, res, req);
  });

  // Player stats
  app.get('/player/:eventId/:playerId', async (req, res) => {
    // Note: SofaScore API structure might vary. Trying standard endpoint.
    // Sometimes stats are under /event/:id/player/:playerId/statistics
    // Or just /player/:playerId/events/last/0 (but we need specific event)
    // Let's try /event/:eventId/player/:playerId/statistics
    await fetchSofa(`https://api.sofascore.app/api/v1/event/${req.params.eventId}/player/${req.params.playerId}/statistics`, res, req);
  });

  // Player image
  app.get('/player-image/:id', async (req, res) => {
    await fetchSofa(`https://api.sofascore.app/api/v1/player/${req.params.id}/image`, res, req);
  });

  // Heatmap
  app.get('/heatmap/:eventId/:playerId', async (req, res) => {
    await fetchSofa(`https://api.sofascore.app/api/v1/event/${req.params.eventId}/player/${req.params.playerId}/heatmap`, res, req);
  });
  
  // Heatmap Data (Points)
  app.get('/heatmap/:eventId/:playerId/data', async (req, res) => {
      await fetchSofa(`https://api.sofascore.app/api/v1/event/${req.params.eventId}/player/${req.params.playerId}/heatmap`, res, req);
  });

  // Scheduled events (Fallback for live)
  app.get('/sport/football/scheduled-events/:date', async (req, res) => {
    await fetchSofa(`https://api.sofascore.app/api/v1/sport/football/scheduled-events/${req.params.date}`, res, req);
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
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // Inicia um "cron job interno" para rodar a cada 60 segundos
    // Isso ajuda a manter a checagem funcionando enquanto o servidor estiver acordado,
    // já que serviços externos (como cron-job.org) são bloqueados pela tela de proteção do AI Studio.
    setInterval(async () => {
      console.log('[Internal Cron] Executando checagem automática...');
      try {
        await runMonitorCheck();
      } catch (error) {
        console.error('[Internal Cron] Erro na checagem:', error);
      }
    }, 60000);
  });
}

startServer();
