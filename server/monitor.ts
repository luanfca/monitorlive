import { messaging } from './firebaseAdmin.js';
import { gotScraping } from 'got-scraping';

const PROXY_PROVIDERS = [
    (url: string) => `https://api.allorigins.hexlet.app/get?url=${encodeURIComponent(url)}`,
    (url: string) => `https://corsproxy.org/?${encodeURIComponent(url)}`,
    (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url: string) => `https://thingproxy.freeboard.io/fetch/${url}`,
    (url: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`
];

const fetchWithProxies = async (targetUrl: string): Promise<any> => {
    const proxies = [...PROXY_PROVIDERS];
    
    const domainsToTry = [
        targetUrl,
        targetUrl.replace('api.sofascore.app', 'api.sofascore.com'),
        targetUrl.replace('api.sofascore.app', 'www.sofascore.com')
    ];
    
    for (const domainUrl of domainsToTry) {
        try {
            const gotResponse = await gotScraping({
                url: domainUrl,
                responseType: 'text',
                timeout: { request: 10000 },
                headers: {
                    'Referer': 'https://www.sofascore.com/',
                    'Origin': 'https://www.sofascore.com'
                }
            });
            
            if (gotResponse.statusCode >= 200 && gotResponse.statusCode < 300) {
                return JSON.parse(gotResponse.body);
            }
        } catch (e: any) {
            console.log(`gotScraping failed for ${domainUrl}: ${e.message}`);
        }
    }
    
    for (const domainUrl of domainsToTry) {
      for (const proxyGen of proxies) {
          const proxyUrl = proxyGen(domainUrl);
          try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 15000);

            const response = await fetch(proxyUrl, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*',
                    'Cache-Control': 'no-cache',
                    'Referer': 'https://www.sofascore.com/',
                    'Origin': 'https://www.sofascore.com'
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
      } // End of proxies loop
    } // End of domains loop
    return null;
};

interface ClientMonitor {
  token: string;
  userId?: string; // Add userId to link multiple devices
  players: any[]; // MonitoredPlayer[]
  lastPing: number;
}

const clients: Record<string, ClientMonitor> = {};

export const updateClientMonitor = (token: string, players: any[], userId?: string) => {
  clients[token] = { token, userId, players, lastPing: Date.now() };
  console.log(`Updated monitor for token ${token.substring(0, 10)}... (User: ${userId || 'Anonymous'}) with ${players.length} players.`);
};

export const removeClientMonitor = (token: string) => {
  if (clients[token]) {
      delete clients[token];
      console.log(`Removed monitor for token ${token.substring(0, 10)}...`);
  }
};

export const runMonitorCheck = async () => {
    try {
        // Cleanup clients that haven't pinged in 12 hours (43200000 ms)
        const now = Date.now();
        for (const token in clients) {
            if (now - clients[token].lastPing > 43200000) {
                console.log(`Client ${token.substring(0, 10)}... timed out. Removing.`);
                delete clients[token];
            }
        }

        // Extract unique event IDs from all clients
        const eventIds = new Set<number>();
        // Also group players by userId to avoid duplicate checks for the same user on multiple devices
        const uniqueUserPlayers: Record<string, any[]> = {};
        
        for (const client of Object.values(clients)) {
            const key = client.userId || client.token; // Group by user ID if available, otherwise token
            if (!uniqueUserPlayers[key]) {
                uniqueUserPlayers[key] = client.players;
            }
            
            for (const player of client.players) {
                eventIds.add(player.eventId);
            }
        }

        if (eventIds.size === 0) return;

        console.log(`Verificando atualizações para ${eventIds.size} eventos ativos...`);

        // Fetch lineups for all active events
        const eventLineups: Record<number, any> = {};
        for (const eventId of eventIds) {
            try {
                const directUrl = `https://api.sofascore.app/api/v1/event/${eventId}/lineups`;
                const response = await fetch(directUrl, {
                    headers: { 
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Referer': 'https://www.sofascore.com/',
                        'Accept': 'application/json, text/plain, */*'
                    }
                });
                if (response.ok) {
                    const text = await response.text();
                    if (text) {
                        eventLineups[eventId] = JSON.parse(text);
                    }
                } else if (response.status === 403) {
                    console.log(`Direct fetch failed with 403 for event ${eventId}, trying proxies...`);
                    const proxyData = await fetchWithProxies(directUrl);
                    if (proxyData) {
                        eventLineups[eventId] = proxyData;
                    }
                }
            } catch (e) {
                console.error(`Erro ao buscar lineups do evento ${eventId}:`, e);
            }
        }

        // Check for updates for each unique user/device group
        const userUpdates: Record<string, { updates: string[], updatedPlayers: any[] }> = {};

        for (const [key, players] of Object.entries(uniqueUserPlayers)) {
            const updates: string[] = [];
            const updatedPlayers = [...players];
            
            for (let i = 0; i < updatedPlayers.length; i++) {
                const p = updatedPlayers[i];
                if (!p.isMonitored) continue;
                const lineupData = eventLineups[p.eventId];
                if (!lineupData) continue;

                // Find player in lineup
                let gamePlayer = null;
                const allPlayers = [
                    ...(lineupData.home?.players || []),
                    ...(lineupData.away?.players || [])
                ];
                
                const row = allPlayers.find((r: any) => r.player.id === p.sofaId);
                if (!row) continue;

                const stats = row.statistics || {};
                const currentStats = {
                    tackles: stats.totalTackle || stats.tackles || 0,
                    fouls: stats.fouls || stats.totalFoul || stats.foulsCommitted || stats.foul || stats.totalFouls || 0,
                    foulsDrawn: stats.wasFouled || stats.foulsDrawn || stats.foulsSuffered || stats.was_fouled || 0,
                    shotsTotal: stats.totalShots || stats.shotsTotal || 0,
                    shotsOnTarget: stats.onTargetScoringAttempt || stats.shotsOnTarget || 0,
                    yellowCards: stats.yellowCards || stats.yellowCard || 0,
                    redCards: stats.redCards || stats.redCard || 0,
                    isSubstitute: row.substitute || row.substitutedOut || false,
                    goals: stats.goals || 0,
                    assists: stats.goalAssist || stats.assists || 0,
                    interceptions: stats.interceptionWon || stats.interceptions || 0,
                    duelsWon: stats.duelWon || stats.duelsWon || 0,
                };

                const last = p.lastAlertedStats || p.lastStats || {
                    tackles: 0, fouls: 0, foulsDrawn: 0, shotsTotal: 0, shotsOnTarget: 0, yellowCards: 0, redCards: 0, isSubstitute: false, goals: 0, assists: 0, interceptions: 0, duelsWon: 0
                };

                const alerts = p.alerts || {};

                // Compare and generate alerts
                if (alerts.tackles && currentStats.tackles > last.tackles) {
                    updates.push(`Desarme! ${p.name} (${currentStats.tackles})`);
                }
                if (alerts.fouls && currentStats.fouls > last.fouls) {
                    updates.push(`Falta Cometida! ${p.name} (${currentStats.fouls})`);
                }
                if (alerts.foulsDrawn && currentStats.foulsDrawn > last.foulsDrawn) {
                    updates.push(`Falta Sofrida! ${p.name} (${currentStats.foulsDrawn})`);
                }
                if (alerts.shots && currentStats.shotsTotal > last.shotsTotal) {
                    updates.push(`Finalização! ${p.name} (${currentStats.shotsTotal})`);
                }
                if (alerts.shotsOn && currentStats.shotsOnTarget > last.shotsOnTarget) {
                    updates.push(`Finalização no Alvo! ${p.name} (${currentStats.shotsOnTarget})`);
                }
                if (alerts.yellow && currentStats.yellowCards > last.yellowCards) {
                    updates.push(`🟨 Cartão Amarelo! ${p.name}`);
                }
                if (alerts.red && currentStats.redCards > last.redCards) {
                    updates.push(`🟥 Cartão Vermelho! ${p.name}`);
                }
                if (alerts.goals && currentStats.goals > last.goals) {
                    updates.push(`⚽ GOL! ${p.name}`);
                }
                if (alerts.assists && currentStats.assists > last.assists) {
                    updates.push(`👟 Assistência! ${p.name}`);
                }
                if (alerts.subOut && currentStats.isSubstitute && !last.isSubstitute) {
                    updates.push(`🔄 Substituído! ${p.name} saiu do jogo.`);
                }

                // Update lastAlertedStats
                p.lastAlertedStats = { ...currentStats };
            }
            
            userUpdates[key] = { updates, updatedPlayers };
        }

        // Send notifications to all clients
        for (const client of Object.values(clients)) {
            const key = client.userId || client.token;
            const { updates, updatedPlayers } = userUpdates[key] || { updates: [], updatedPlayers: client.players };
            
            // Update the client's players reference so it has the new lastAlertedStats
            client.players = updatedPlayers;

            if (updates.length > 0 && messaging) {
                try {
                    await messaging.send({
                        token: client.token,
                        notification: {
                            title: 'LiveMatch Pro - Alerta!',
                            body: updates.join('\n')
                        },
                        android: {
                            priority: 'high',
                            notification: {
                                sound: 'default'
                            }
                        }
                    });
                    console.log(`Push enviado para ${client.token.substring(0, 10)}... (User: ${client.userId || 'Anonymous'})`);
                } catch (e: any) {
                    if (e.code === 'messaging/registration-token-not-registered' || e.message?.includes('NotRegistered')) {
                        console.log(`Token not registered (expired or invalid), removing from monitor: ${client.token.substring(0, 10)}...`);
                        removeClientMonitor(client.token);
                    } else {
                        console.error('Erro ao enviar push:', e);
                    }
                }
            }
        }

    } catch (error) {
        console.error('Erro no monitoramento:', error);
    }
};

export const startMonitor = () => {
    console.log('Monitor de jogadores (Backend) iniciado...');
    
    // Loop de monitoramento a cada 30 segundos
    setInterval(runMonitorCheck, 30000); // 30 seconds
};
