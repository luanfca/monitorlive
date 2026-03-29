
import { Capacitor } from '@capacitor/core';
import { CapacitorHttp } from '@capacitor/core';
import { Game, GameLineups, GamePlayer, PlayerStats } from '../types';
import { logService } from './logService';

// Helper para detectar plataforma nativa (mesmo em Web Workers)
const isNative = (): boolean => {
    try {
        if (Capacitor && Capacitor.isNativePlatform()) return true;
    } catch (e) {}
    
    // Fallback para Web Workers no Capacitor
    if (typeof self !== 'undefined' && self.location) {
        const origin = self.location.origin;
        if (origin.includes('localhost') && (origin.startsWith('http:') || origin.startsWith('capacitor:'))) {
            // Em produção web, a origem seria o domínio real. localhost no celular indica Capacitor.
            // Para evitar falso positivo no dev server (localhost:5173), verificamos a porta.
            if (!self.location.port || self.location.port === '') {
                return true;
            }
        }
    }
    return false;
};

// Configuração da Base URL (Prioridade para Variável de Ambiente, Fallback para Produção)
// Use o Shared App URL como proxy para evitar problemas de CORS no Web Worker no Android.
// No ambiente Web (Preview/Browser), use o caminho relativo '' para bater no próprio servidor local,
// ou a URL do backend se estiver configurada (ex: deploy separado no Render).
const DEFAULT_BACKEND_URL = 'https://monitorlive-7rv3.onrender.com';

// Vite replaces import.meta.env.VITE_API_URL statically during build.
// We must access it directly, not through a dynamic object, so it works in production.
let configuredApiUrl = '';
try {
    // @ts-ignore
    configuredApiUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE || '';
} catch (e) {
    // Ignore error if import.meta is not available
}

// Force ignore the dead backend URL
if (configuredApiUrl && configuredApiUrl.includes('live-match-pro-api.onrender.com')) {
    configuredApiUrl = '';
}

export const API_BASE = isNative() 
    ? (configuredApiUrl || DEFAULT_BACKEND_URL)
    : configuredApiUrl;

// Debug para verificar conexão em produção
console.log('BACKEND URL:', API_BASE || 'Local (Relative)');
// console.log('PLATFORM:', Capacitor.getPlatform()); // Removed to avoid worker crash

// Helper to normalize strings for comparison
export const normalizeString = (str: string): string => {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
};

// Helper centralizado para imagens de jogadores via Backend
export const getPlayerImageUrl = (playerId: number): string => {
  if (isNative()) {
      return `https://api.sofascore.app/api/v1/player/${playerId}/image`;
  }
  return `${API_BASE}/player-image/${playerId}`;
};

// Helper para obter a URL do mapa de calor via Backend
export const getPlayerHeatmapUrl = (eventId: number, playerId: number): string => {
  if (isNative()) {
      // Note: Heatmap images might require headers, so this direct URL might not work in <img> tag
      // unless SofaScore allows it. If not, we might need to fetch blob and convert to base64.
      // For now, let's try direct URL or fallback to our proxy if we were using one.
      // But since we don't have a deployed proxy, we must try direct.
      return `https://api.sofascore.app/api/v1/event/${eventId}/player/${playerId}/heatmap`;
  }
  return `${API_BASE}/heatmap/${eventId}/${playerId}`;
};

// Helper para obter a URL do mapa de calor via Backend (Pontos)
export const getPlayerHeatmapPoints = async (eventId: number, playerId: number): Promise<any[] | null> => {
  try {
    // Tenta endpoint padrão do SofaScore (via proxy)
    const data = await fetchBackendData(`/heatmap/${eventId}/${playerId}`);
    if (data && Array.isArray(data.heatmap)) {
        return data.heatmap;
    }
    // Fallback: Tenta endpoint direto de heatmap se o proxy seguir outra estrutura
    const directData = await fetchBackendData(`/heatmap/${eventId}/${playerId}/data`);
    if (directData && Array.isArray(directData)) {
        return directData;
    }
    return null;
  } catch (error) {
    return null;
  }
};

// Lista de Proxies Públicos para Rotação (Web / Fallback)
const PROXY_PROVIDERS = [
    (url: string) => `https://yacdn.org/proxy/${url}`,
    (url: string) => `https://corsproxy.org/?${encodeURIComponent(url)}`,
    (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    (url: string) => `https://thingproxy.freeboard.io/fetch/${url}`,
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url: string) => `https://jsonp.afeld.me/?url=${encodeURIComponent(url)}`
];

// Helper para tentar buscar via múltiplos proxies
const fetchWithProxies = async (targetUrl: string): Promise<any> => {
    let lastError;
    
    // Tenta domínios diferentes do SofaScore
    const domainsToTry = [
        targetUrl,
        targetUrl.replace('api.sofascore.app', 'api.sofascore.com'),
        targetUrl.replace('api.sofascore.app', 'www.sofascore.com')
    ];
    
    const proxies = [...PROXY_PROVIDERS];
    
    for (const domainUrl of domainsToTry) {
        logService.addLog('info', `Trying Domain: ${domainUrl}`);
        for (const proxyGen of proxies) {
            const proxyUrl = proxyGen(domainUrl);
            logService.addLog('info', `Trying Proxy: ${proxyUrl}`);
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 12000); // Timeout ajustado para 12s

            const headers: any = {};
            if (proxyUrl.includes('corsproxy.io') && !domainUrl.includes('.app')) {
                headers['Origin'] = 'https://www.sofascore.com';
                headers['Referer'] = 'https://www.sofascore.com/';
            }

            const response = await fetch(proxyUrl, {
                method: 'GET',
                headers,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`Proxy error: ${response.status}`);
            }

            if (response.ok) {
                const text = await response.text();
                try {
                    const data = JSON.parse(text);
                    
                    // Tratamento especial para AllOrigins /get (retorna JSON com contents)
                    if (proxyUrl.includes('api.allorigins.win/get') || proxyUrl.includes('api.allorigins.hexlet.app/get')) {
                        if (data.status && data.status.http_code >= 400) {
                            logService.addLog('warn', `Proxy returned http_code ${data.status.http_code}`);
                            continue;
                        }
                        if (data.contents) {
                            const parsedContents = JSON.parse(data.contents);
                            if (parsedContents.error) {
                                logService.addLog('warn', 'Proxy returned API error');
                                continue;
                            }
                            return parsedContents;
                        }
                    }
                    
                    if (data.error) {
                        logService.addLog('warn', 'Proxy returned API error');
                        continue;
                    }
                    
                    return data;
                } catch (parseError) {
                    logService.addLog('warn', 'Proxy returned invalid JSON', parseError);
                    continue; // Tenta próximo proxy
                }
            }
        } catch (error) {
            logService.addLog('warn', `Proxy failed (${proxyUrl}):`, error);
            lastError = error;
        }
        
        // Pequeno delay antes de tentar o próximo
        await new Promise(resolve => setTimeout(resolve, 300));
        } // End of proxies loop
    } // End of domains loop
    
    try {
        logService.addLog('info', 'Trying ultimate fallback with basic fetch...');
        const basicResponse = await fetch(targetUrl);
        if (basicResponse.ok) {
            const text = await basicResponse.text();
            return JSON.parse(text);
        }
    } catch (e) {
        logService.addLog('warn', 'Ultimate fallback failed:', e);
    }
    
    throw lastError || new Error('All proxies failed');
};

const fetchBackendData = async (endpoint: string) => {
  try {
    // Adiciona timestamp para evitar cache agressivo em WebViews
    const timestamp = `t=${Date.now()}`;
    
    // --- LÓGICA NATIVA (APK/IOS) ---
    // Se for nativo E tiver CapacitorHttp (Main Thread), usa chamada direta.
    // Se for nativo mas NÃO tiver CapacitorHttp (Web Worker), cai para a lógica Web (Proxy).
    if (isNative() && typeof CapacitorHttp !== 'undefined' && CapacitorHttp.get) {
        let directUrl = '';
        
        // Mapeamento de Endpoints para URL Real do SofaScore
        if (endpoint === '/live') {
            directUrl = 'https://api.sofascore.app/api/v1/sport/football/events/live';
        } else if (endpoint.startsWith('/lineups/')) {
            const id = endpoint.split('/')[2];
            directUrl = `https://api.sofascore.app/api/v1/event/${id}/lineups`;
        } else if (endpoint.startsWith('/player/')) {
            // /player/:eventId/:playerId -> /event/:eventId/player/:playerId/statistics
            const parts = endpoint.split('/');
            const eventId = parts[2];
            const playerId = parts[3];
            directUrl = `https://api.sofascore.app/api/v1/event/${eventId}/player/${playerId}/statistics`;
        } else if (endpoint.startsWith('/heatmap/')) {
             // /heatmap/:eventId/:playerId -> /event/:eventId/player/:playerId/heatmap
             const parts = endpoint.split('/');
             const eventId = parts[2];
             const playerId = parts[3];
             // Check if it's /data
             if (parts[4] === 'data') {
                 directUrl = `https://api.sofascore.app/api/v1/event/${eventId}/player/${playerId}/heatmap`;
             } else {
                 directUrl = `https://api.sofascore.app/api/v1/event/${eventId}/player/${playerId}/heatmap`;
             }
        } else if (endpoint.startsWith('/sport/football/scheduled-events/')) {
            const date = endpoint.split('/').pop();
            directUrl = `https://api.sofascore.app/api/v1/sport/football/scheduled-events/${date}`;
        } else {
            // Default fallback
            directUrl = `https://api.sofascore.app/api/v1${endpoint}`;
        }

        logService.addLog('info', `Native Fetch: ${directUrl}`);

        // Atualizado User-Agent para uma versão mais recente
        const mobileUA = 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36';
        
        const doRequest = async (retries = 3, delay = 1000, useWebHeaders = true): Promise<any> => {
            try {
                const headers: any = {
                    'Cache-Control': 'no-cache',
                    'Accept': '*/*',
                    'User-Agent': mobileUA,
                    'Connection': 'keep-alive'
                };

                logService.addLog('info', `Executing Native Request to: ${directUrl}`);
                logService.addLog('info', `Headers:`, JSON.stringify(headers));

                // Usa CapacitorHttp.get diretamente se disponível (Main Thread), senão usa fetch (Web Worker)
                let responseStatus;
                let data;

                if (typeof CapacitorHttp !== 'undefined' && CapacitorHttp.get) {
                    const response = await CapacitorHttp.get({
                        url: directUrl,
                        headers: headers
                    });
                    responseStatus = response.status;
                    data = response.data;
                    if (typeof data === 'string' && (data.trim().startsWith('{') || data.trim().startsWith('['))) {
                        try {
                            data = JSON.parse(data);
                        } catch (e) {
                            logService.addLog('warn', 'Failed to parse CapacitorHttp string data', e);
                        }
                    }
                } else {
                    const response = await fetch(directUrl, {
                        method: 'GET',
                        headers: headers
                    });
                    responseStatus = response.status;
                    if (responseStatus >= 200 && responseStatus < 300) {
                        const text = await response.text();
                        if (text) {
                            data = JSON.parse(text);
                        } else {
                            data = null;
                        }
                    }
                }

                logService.addLog('info', `Native Response Status: ${responseStatus}`);
                
                if (responseStatus < 200 || responseStatus >= 300) {
                    throw new Error(`HTTP Error: ${responseStatus}`);
                }
                
                logService.addLog('info', `Native Response Data Preview:`, JSON.stringify(data).substring(0, 1000));
                
                return data;
            } catch (err) {
                logService.addLog('error', 'Native Request Exception:', err);
                if (retries > 0) {
                     logService.addLog('warn', `Network error, retrying in ${delay}ms...`, err);
                     await new Promise(resolve => setTimeout(resolve, delay));
                     return doRequest(retries - 1, delay * 2, useWebHeaders);
                }
                throw err;
            }
        };

        try {
            return await doRequest();
        } catch (nativeError) {
            logService.addLog('error', 'Native fetch failed after retries, falling back to Public Proxies', nativeError);
            // Fallback to Proxy Rotation
            try {
                return await fetchWithProxies(directUrl);
            } catch (proxyError) {
                logService.addLog('error', 'All proxies failed in Native Fallback', proxyError);
                return null;
            }
        }

    } else {
        // --- LÓGICA WEB (USANDO PROXY LOCAL OU SHARED APP URL) ---
        // Em ambiente de desenvolvimento/web, usamos o servidor local (server.ts)
        // ou o Shared App URL que atua como proxy para o SofaScore.
        const url = `${API_BASE}${endpoint}${endpoint.includes('?') ? '&' : '?'}${timestamp}`;
        
        // Mapeamento de Endpoints para URL Real do SofaScore (para fallback)
        let directUrl = '';
        if (endpoint === '/live') {
            directUrl = 'https://api.sofascore.app/api/v1/sport/football/events/live';
        } else if (endpoint.startsWith('/lineups/')) {
            const id = endpoint.split('/')[2];
            directUrl = `https://api.sofascore.app/api/v1/event/${id}/lineups`;
        } else if (endpoint.startsWith('/player/')) {
            const parts = endpoint.split('/');
            const eventId = parts[2];
            const playerId = parts[3];
            directUrl = `https://api.sofascore.app/api/v1/event/${eventId}/player/${playerId}/statistics`;
        } else if (endpoint.startsWith('/heatmap/')) {
             const parts = endpoint.split('/');
             const eventId = parts[2];
             const playerId = parts[3];
             directUrl = `https://api.sofascore.app/api/v1/event/${eventId}/player/${playerId}/heatmap`;
        } else if (endpoint.startsWith('/sport/football/scheduled-events/')) {
            const date = endpoint.split('/').pop();
            directUrl = `https://api.sofascore.app/api/v1/sport/football/scheduled-events/${date}`;
        } else {
            directUrl = `https://api.sofascore.app/api/v1${endpoint}`;
        }

        // Try direct fetch first (SofaScore allows CORS for some endpoints)
        try {
            logService.addLog('info', `Web Fetch (Direct): ${directUrl}`);
            const directResponse = await fetch(directUrl);
            if (directResponse.ok) {
                const text = await directResponse.text();
                if (text) return JSON.parse(text);
            }
        } catch (e) {
            logService.addLog('warn', 'Direct web fetch failed, falling back to proxy...', e);
        }

        logService.addLog('info', `Web Fetch (Proxy): ${url}`);
        try {
            const response = await fetch(url);
            if (!response.ok) {
                let errorDetails = '';
                try {
                    const errData = await response.json();
                    errorDetails = errData.details || errData.error || '';
                } catch (e) {}
                throw new Error(`Local proxy error: ${response.status} ${errorDetails}`);
            }
            if (response.status === 204) return null;
            
            const text = await response.text();
            if (!text) return null;
            return JSON.parse(text);
        } catch (error) {
            logService.addLog('error', 'Local proxy failed in Web Mode, falling back to Public Proxies', error);
            try {
                return await fetchWithProxies(directUrl);
            } catch (proxyError) {
                logService.addLog('error', 'All proxies failed in Web Fallback', proxyError);
                return null;
            }
        }
    }
  } catch (error) {
    console.warn(`API Warn (${endpoint}):`, error);
    return null;
  }
};

// Helper robusto para encontrar estatísticas mesmo com variações de nomes da API
const getStat = (stats: any, patterns: string[], defaultKeys: string[]): number => {
  if (!stats) return 0;
  
  // 1. Tenta chaves conhecidas primeiro (mais rápido)
  for (const key of defaultKeys) {
    if (stats[key] !== undefined && stats[key] !== null) return Number(stats[key]);
  }

  // 2. Tenta em sub-objetos comuns (defensive, offensive, etc)
  const subObjects = ['defensive', 'offensive', 'passing', 'duels', 'general'];
  for (const sub of subObjects) {
    if (stats[sub] && typeof stats[sub] === 'object') {
      for (const key of defaultKeys) {
        if (stats[sub][key] !== undefined) return Number(stats[sub][key]);
      }
    }
  }

  // 3. Busca por padrão no nome da chave (fallback final)
  const allKeys = Object.keys(stats);
  for (const pattern of patterns) {
    const foundKey = allKeys.find(k => k.toLowerCase().includes(pattern.toLowerCase()));
    if (foundKey) return Number(stats[foundKey]);
  }

  return 0;
};

export const getLiveGames = async (): Promise<Game[]> => {
  let data = null;
  
  try {
    data = await fetchBackendData('/live');
  } catch (error) {
    logService.addLog('warn', 'Error fetching live games endpoint, trying fallback...', error);
  }
    
  // Fallback: Se /live falhar ou vier vazio, tenta buscar jogos do dia e filtrar os ao vivo
  if (!data || !data.events || data.events.length === 0) {
      logService.addLog('warn', 'Live endpoint empty or failed, trying scheduled events fallback...');
      try {
          const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
          const scheduledData = await fetchBackendData(`/sport/football/scheduled-events/${today}`);
          
          if (scheduledData && scheduledData.events) {
              // Filtra apenas jogos que estão acontecendo (inprogress)
              const liveEvents = scheduledData.events.filter((e: any) => e.status.type === 'inprogress');
              if (liveEvents.length > 0) {
                  data = { events: liveEvents };
              }
          }
      } catch (fallbackError) {
          logService.addLog('error', 'Fallback also failed', fallbackError);
      }
  }
  
  if (!data) return [];

  // SofaScore API returns { events: [...] }
  const events = data.events || (Array.isArray(data) ? data : []);
  
  if (!Array.isArray(events)) return [];

  return events.map((e: any) => {
        // Calculate minute if not provided directly
        let minute: number | undefined = undefined;
        
        if (e.status?.type === 'inprogress') {
            if (e.time?.currentPeriodStartTimestamp) {
                 const now = Math.floor(Date.now() / 1000);
                 const start = e.time.currentPeriodStartTimestamp;
                 let diff = Math.floor((now - start) / 60);
                 
                 // Adjust for 2nd half (code 7) or other periods if needed
                 // This is a simplification; robust logic would check period type
                 if (e.status.code === 7) { 
                     diff += 45;
                 }
                 if (diff < 0) diff = 0;
                 minute = diff;
            }
        }

        return {
          id: e.id,
          homeTeam: { name: e.homeTeam.name, score: e.homeScore?.current },
          awayTeam: { name: e.awayTeam.name, score: e.awayScore?.current },
          tournament: e.tournament?.name || 'Unknown',
          minute: minute,
          status: e.status?.description || 'Live',
          statusCode: e.status?.code
        };
    });
};

export const getGamePlayers = async (eventId: number): Promise<GameLineups | null> => {
  try {
    const data = await fetchBackendData(`/lineups/${eventId}`);
    
    // Se o backend retornar erro ou vazio
    if (!data || !data.home || !data.away) return null;

    // O backend já deve retornar a estrutura correta ou a do SofaScore.
    // Mantemos o processamento caso o backend retorne o raw data do SofaScore.
    const processTeam = (teamData: any) => {
      const starters: GamePlayer[] = [];
      const substitutes: GamePlayer[] = [];

      (teamData.players || []).forEach((row: any) => {
        const p = row.player;
        const stats = row.statistics || {};
        
        const playerObj: GamePlayer = {
          id: p.id,
          name: p.name || p.shortName || 'Unknown',
          position: p.position || '?',
          shirtNumber: p.shirtNumber || '',
          minutes: stats.minutesPlayed || stats.minutes || 0,
          substitute: row.substitute, // This is true if player starts on bench
          statistics: {
              rating: stats.rating || 0,
              goals: stats.goals || 0,
              assists: stats.goalAssist || stats.assists || 0,
              totalShots: stats.totalShots || stats.shotsTotal || 0,
              shotsOnTarget: stats.onTargetScoringAttempt || stats.shotsOnTarget || 0,
              totalPasses: stats.totalPass || stats.totalPasses || 0,
              keyPasses: stats.keyPass || stats.keyPasses || 0,
              tackles: stats.totalTackle || stats.tackles || 0,
              interceptions: getStat(stats, ['intercept'], ['interception', 'interceptions', 'totalInterception', 'totalInterceptions', 'interceptionWon', 'interceptedPass']),
              duelsWon: getStat(stats, ['duelWon'], ['totalDuelWon', 'duelsWon', 'duelWon', 'groundDuelsWon', 'aerialDuelsWon']),
              // Expanded mappings for Fouls in Lineups
              fouls: stats.fouls || stats.totalFoul || stats.foulsCommitted || stats.foul || stats.totalFouls || 0,
              wasFouled: stats.wasFouled || stats.foulsDrawn || stats.foulsSuffered || stats.was_fouled || 0,
              yellowCards: stats.yellowCards || stats.yellowCard || 0,
              redCards: stats.redCards || stats.redCard || 0
          }
        };

        // Check for substitution events if available in the row data
        // SofaScore often puts substituted out players in the starters list but with a flag or event
        if (row.subtitution || row.substitutedOut) {
             // If we can detect they were subbed out, we might want to flag it
             // But for now, let's rely on the worker logic comparing previous state
        }

        if (row.substitute) substitutes.push(playerObj);
        else starters.push(playerObj);
      });

      return {
        name: teamData.name,
        starters,
        substitutes
      };
    };

    return {
      home: processTeam(data.home),
      away: processTeam(data.away)
    };
  } catch (error) {
    logService.addLog('error', 'Error fetching lineups', error);
    return null;
  }
};

export const getPlayerStats = async (eventId: number, playerName: string, playerId?: number): Promise<PlayerStats | null> => {
  try {
    // Tenta buscar por ID primeiro se disponível, senão por nome
    const identifier = playerId ? String(playerId) : encodeURIComponent(playerName);
    const data = await fetchBackendData(`/player/${eventId}/${identifier}`);
    
    if (!data) return null;

    // O SofaScore às vezes retorna as estatísticas em locais diferentes
    const stats = data.statistics || data.player?.statistics || data.stats || data;
    const playerInfo = data.player || data;
    
    return {
        displayName: playerInfo.name || playerInfo.displayName || playerInfo.shortName || playerName,
        playerId: playerInfo.id || playerInfo.playerId || playerId || 0,
        minutes: stats.minutesPlayed || stats.minutes || data.minutesPlayed || data.minutes || 0,
        
        // Attack
        goals: stats.goals || 0,
        assists: stats.goalAssist || stats.assists || 0,
        shotsTotal: stats.totalShots || stats.shotsTotal || 0,
        shotsOnTarget: stats.onTargetScoringAttempt || stats.shotsOnTarget || 0,
        keyPasses: stats.keyPass || stats.keyPasses || 0,

        // Defense
        tackles: stats.totalTackle || stats.tackles || 0,
        interceptions: getStat(stats, ['intercept'], ['interception', 'interceptions', 'totalInterception', 'totalInterceptions', 'interceptionWon', 'interceptedPass']),
        duelsWon: getStat(stats, ['duelWon'], ['totalDuelWon', 'duelsWon', 'duelWon', 'groundDuelsWon', 'aerialDuelsWon']),

        // Discipline
        fouls: stats.fouls || stats.totalFoul || stats.foulsCommitted || stats.foul || stats.totalFouls || 0,
        foulsDrawn: stats.wasFouled || stats.foulsDrawn || stats.foulsSuffered || stats.was_fouled || 0,
        yellowCards: stats.yellowCards || stats.yellowCard || 0,
        redCards: stats.redCards || stats.redCard || 0,

        // General
        totalPasses: stats.totalPass || stats.totalPasses || 0,
        rating: stats.rating || 0,
        isSubstitute: !!(data.substitute || data.isSubstitute || stats.substitute)
    };
  } catch (error) {
    // Retorna null silenciosamente em caso de erro na camada superior também
    return null;
  }
};
