import { messaging } from './firebaseAdmin.js';

interface ClientMonitor {
  token: string;
  players: any[]; // MonitoredPlayer[]
}

const clients: Record<string, ClientMonitor> = {};

export const updateClientMonitor = (token: string, players: any[]) => {
  clients[token] = { token, players };
  console.log(`Updated monitor for token ${token.substring(0, 10)}... with ${players.length} players.`);
};

export const removeClientMonitor = (token: string) => {
  if (clients[token]) {
      delete clients[token];
      console.log(`Removed monitor for token ${token.substring(0, 10)}...`);
  }
};

export const startMonitor = () => {
    console.log('Monitor de jogadores (Backend) iniciado...');
    
    // Loop de monitoramento a cada 30 segundos
    setInterval(async () => {
        try {
            // Extract unique event IDs from all clients
            const eventIds = new Set<number>();
            for (const client of Object.values(clients)) {
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
                    const response = await fetch(`https://api.sofascore.app/api/v1/event/${eventId}/lineups`, {
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
                    }
                } catch (e) {
                    console.error(`Erro ao buscar lineups do evento ${eventId}:`, e);
                }
            }

            // Check for updates for each client
            for (const client of Object.values(clients)) {
                const updates: string[] = [];
                
                for (let i = 0; i < client.players.length; i++) {
                    const p = client.players[i];
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

                    // Compare and generate alerts
                    if (p.alerts.tackles && currentStats.tackles > last.tackles) {
                        updates.push(`Desarme! ${p.name} (${currentStats.tackles})`);
                    }
                    if (p.alerts.fouls && currentStats.fouls > last.fouls) {
                        updates.push(`Falta Cometida! ${p.name} (${currentStats.fouls})`);
                    }
                    if (p.alerts.foulsDrawn && currentStats.foulsDrawn > last.foulsDrawn) {
                        updates.push(`Falta Sofrida! ${p.name} (${currentStats.foulsDrawn})`);
                    }
                    if (p.alerts.shots && currentStats.shotsTotal > last.shotsTotal) {
                        updates.push(`Finalização! ${p.name} (${currentStats.shotsTotal})`);
                    }
                    if (p.alerts.shotsOn && currentStats.shotsOnTarget > last.shotsOnTarget) {
                        updates.push(`Finalização no Alvo! ${p.name} (${currentStats.shotsOnTarget})`);
                    }
                    if (p.alerts.yellow && currentStats.yellowCards > last.yellowCards) {
                        updates.push(`🟨 Cartão Amarelo! ${p.name}`);
                    }
                    if (p.alerts.red && currentStats.redCards > last.redCards) {
                        updates.push(`🟥 Cartão Vermelho! ${p.name}`);
                    }
                    if (p.alerts.goals && currentStats.goals > last.goals) {
                        updates.push(`⚽ GOL! ${p.name}`);
                    }
                    if (p.alerts.assists && currentStats.assists > last.assists) {
                        updates.push(`👟 Assistência! ${p.name}`);
                    }
                    if (p.alerts.subOut && currentStats.isSubstitute && !last.isSubstitute) {
                        updates.push(`🔄 Substituído! ${p.name} saiu do jogo.`);
                    }

                    // Update lastAlertedStats
                    p.lastAlertedStats = { ...currentStats };
                }

                if (updates.length > 0 && messaging) {
                    try {
                        await messaging.send({
                            token: client.token,
                            notification: {
                                title: 'LiveMatch Pro - Alerta!',
                                body: updates.join('\n')
                            }
                        });
                        console.log(`Push enviado para ${client.token.substring(0, 10)}...`);
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
    }, 30000); // 30 seconds
};
