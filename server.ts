import express from 'express';
import path from 'path';
import cors from 'cors';
import { startMonitor, updateClientMonitor, runMonitorCheck } from './server/monitor.js';

const distPath = path.join(process.cwd(), 'dist');

async function startServer() {
  const app = express();

  // Add CORS headers for proxy
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Cache-Control']
  }));

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
      (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
      (url: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
      (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
      (url: string) => `https://thingproxy.freeboard.io/fetch/${url}`,
      (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`
  ];

  const fetchWithProxies = async (targetUrl: string): Promise<any> => {
      // Don't shuffle, use the most reliable ones first
      const proxies = [...PROXY_PROVIDERS];
      
      for (const proxyGen of proxies) {
          const proxyUrl = proxyGen(targetUrl);
          try {
              const controller = new AbortController();
              // Increase timeout to 12 seconds
              const timeoutId = setTimeout(() => controller.abort(), 12000);

              const response = await fetch(proxyUrl, {
                  method: 'GET',
                  headers: {
                      'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
                      'Accept': 'application/json, text/plain, */*',
                      'Cache-Control': 'no-cache'
                  },
                  signal: controller.signal
              });
              clearTimeout(timeoutId);

              if (response.ok) {
                  const text = await response.text();
                  if (text) {
                      try {
                          const json = JSON.parse(text);
                          
                          // Handle allorigins.win/get format
                          if (json.status && json.status.http_code) {
                              if (json.status.http_code >= 400) {
                                  console.warn(`Proxy ${proxyUrl} returned http_code ${json.status.http_code}, trying next...`);
                                  continue;
                              }
                          }
                          
                          if (json.contents) {
                              const parsedContents = JSON.parse(json.contents);
                              if (parsedContents.error) {
                                  console.warn(`Proxy ${proxyUrl} returned API error, trying next...`);
                                  continue;
                              }
                              return parsedContents;
                          }
                          
                          if (json.error) {
                              console.warn(`Proxy ${proxyUrl} returned API error, trying next...`);
                              continue;
                          }
                          
                          return json;
                      } catch (e) {
                          console.warn(`Proxy ${proxyUrl} returned invalid JSON, trying next...`);
                          continue;
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
      
      const urlsToTry = [
          url,
          url.includes('.app') ? url.replace('.app', '.com') : url.replace('.com', '.app'),
          url.replace('api.sofascore.app', 'www.sofascore.com').replace('api.sofascore.com', 'www.sofascore.com')
      ];

      let response: Response | null = null;
      let successfulUrl = url;

      for (let i = 0; i < urlsToTry.length; i++) {
          const currentUrl = urlsToTry[i];
          console.log(`Trying URL ${i + 1}/${urlsToTry.length}: ${currentUrl}`);
          
          // Try Native App Headers first
          const headers: HeadersInit = {
            'User-Agent': 'SofaScore/14.4.0 (Android 13; SM-G998B)',
            'Accept': 'application/json',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
          };

          if (req && req.headers['accept']) {
              headers['Accept'] = req.headers['accept'];
          }

          response = await fetch(currentUrl, { headers });

          if (response.ok) {
              successfulUrl = currentUrl;
              break;
          }

          // Se falhar com 403, tenta com headers de navegador
          if (response.status === 403) {
              console.log(`403 received, trying with Googlebot headers: ${currentUrl}`);
              
              const browserHeaders: HeadersInit = {
                'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
              };

              response = await fetch(currentUrl, { headers: browserHeaders });
              
              if (response.ok) {
                  successfulUrl = currentUrl;
                  break;
              }
              
              // Tenta Googlebot Smartphone
              console.log(`Still failing, trying Googlebot Smartphone: ${currentUrl}`);
              const mobileHeaders: HeadersInit = {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
                'Accept': 'application/json, text/plain, */*',
                'Cache-Control': 'no-cache'
              };
              
              response = await fetch(currentUrl, { headers: mobileHeaders });
              
              if (response.ok) {
                  successfulUrl = currentUrl;
                  break;
              }
          }
      }

      if (!response || !response.ok) {
        if (response && (response.status === 404 || response.status === 403)) {
            console.log(`Direct fetch failed with ${response.status}, trying proxies from backend...`);
            
            for (const proxyUrl of urlsToTry) {
                console.log(`Trying proxies with URL: ${proxyUrl}`);
                const proxyData = await fetchWithProxies(proxyUrl);
                if (proxyData) {
                    return res.json(proxyData);
                }
            }
            
            return res.status(response.status).json({ error: `Failed to fetch data: ${response.statusText}` });
        }
        return res.status(response?.status || 500).json({ error: `Failed to fetch data` });
      }

      const contentType = response.headers.get('content-type');
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      }

      // Buffer the response to check if it's empty
      const buffer = await response.arrayBuffer();
      
      if (buffer.byteLength === 0) {
          console.warn(`Empty response from ${successfulUrl}, trying proxies from backend...`);
          for (const proxyUrl of urlsToTry) {
              const proxyData = await fetchWithProxies(proxyUrl);
              if (proxyData) {
                  return res.json(proxyData);
              }
          }
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

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${port} (Production mode: ${process.env.NODE_ENV === 'production'})`);
    
    // Inicia um "cron job interno" para rodar a cada 60 segundos (mantém o servidor acordado e checando)
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
