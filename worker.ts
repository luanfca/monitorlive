
import { getGamePlayers } from './services/sofaService';
import { MonitoredPlayer, PlayerStats } from './types';

let intervalId: any;
let heartbeatId: any;
let currentPlayers: MonitoredPlayer[] = [];
let isRunning = false;

self.onmessage = async (e) => {
  const { type, payload } = e.data;

  if (type === 'START') {
    const { players, interval } = payload;
    currentPlayers = players;
    startTimer(interval);
    startHeartbeat();
    runCheck();
  } else if (type === 'STOP') {
    if (intervalId) clearInterval(intervalId);
    if (heartbeatId) clearInterval(heartbeatId);
    intervalId = null;
    heartbeatId = null;
  } else if (type === 'UPDATE_PLAYERS') {
    currentPlayers = payload;
  } else if (type === 'UPDATE_INTERVAL') {
    startTimer(payload);
  } else if (type === 'FORCE_CHECK') {
    runCheck();
  }
};

function startTimer(interval: number) {
  if (intervalId) clearInterval(intervalId);
  intervalId = setInterval(runCheck, interval * 1000);
}

function startHeartbeat() {
    if (heartbeatId) clearInterval(heartbeatId);
    // Envia um ping a cada 10 segundos para manter o worker ativo
    heartbeatId = setInterval(() => {
        self.postMessage({ type: 'HEARTBEAT' });
    }, 10000);
}

async function runCheck() {
  if (isRunning || currentPlayers.length === 0) return;
  isRunning = true;

  const updates: any[] = [];
  const alerts: string[] = [];

  try {
    // Agrupa jogadores por ID do jogo para fazer apenas 1 requisição por jogo
    const playersByEvent: Record<number, MonitoredPlayer[]> = {};
    for (const p of currentPlayers) {
        if (!playersByEvent[p.eventId]) playersByEvent[p.eventId] = [];
        playersByEvent[p.eventId].push(p);
    }

    for (const eventIdStr of Object.keys(playersByEvent)) {
        const eventId = Number(eventIdStr);
        const playersInEvent = playersByEvent[eventId];
        
        try {
            const lineups = await getGamePlayers(eventId);
            if (!lineups) continue;

            const allPlayers = [
                ...lineups.home.starters, ...lineups.home.substitutes,
                ...lineups.away.starters, ...lineups.away.substitutes
            ];

            for (const player of playersInEvent) {
                const gamePlayer = allPlayers.find(p => p.id === player.sofaId);
                if (!gamePlayer || !gamePlayer.statistics) continue;

                const s = gamePlayer.statistics;
                
                const stats: PlayerStats = {
                    displayName: gamePlayer.name,
                    playerId: gamePlayer.id,
                    minutes: gamePlayer.minutes,
                    goals: s.goals || 0,
                    assists: s.assists || 0,
                    shotsTotal: s.totalShots || 0,
                    shotsOnTarget: s.shotsOnTarget || 0,
                    keyPasses: s.keyPasses || 0,
                    tackles: s.tackles || 0,
                    interceptions: s.interceptions || 0,
                    duelsWon: s.duelsWon || 0,
                    fouls: s.fouls || 0,
                    foulsDrawn: s.wasFouled || 0,
                    yellowCards: s.yellowCards || 0,
                    redCards: s.redCards || 0,
                    totalPasses: s.totalPasses || 0,
                    rating: s.rating || 0,
                    isSubstitute: gamePlayer.substitute
                };

                const prev = player.lastAlertedStats || player.lastStats;
                if (prev) {
                    if (player.alerts.shotsOn && stats.shotsOnTarget > prev.shotsOnTarget) {
                        alerts.push(`🎯 ${player.name}: CHUTE NO ALVO! (Total: ${stats.shotsOnTarget})`);
                    }
                    if (player.alerts.tackles && stats.tackles > prev.tackles) {
                        alerts.push(`🛡️ ${player.name}: NOVO DESARME! (Total: ${stats.tackles})`);
                    }
                    if (player.alerts.yellow && stats.yellowCards > prev.yellowCards) {
                        alerts.push(`🟨 ${player.name}: CARTÃO AMARELO! (Total: ${stats.yellowCards})`);
                    }
                    if (player.alerts.fouls && stats.fouls > prev.fouls) {
                        alerts.push(`⚠️ ${player.name}: COMETEU FALTA! (Total: ${stats.fouls})`);
                    }
                    if (player.alerts.foulsDrawn && stats.foulsDrawn > prev.foulsDrawn) {
                        alerts.push(`🤕 ${player.name}: SOFREU FALTA! (Total: ${stats.foulsDrawn})`);
                    }
                    if (player.alerts.shots && stats.shotsTotal > prev.shotsTotal) {
                        // Evita duplicidade se for chute no alvo (já notificado pelo shotsOn), 
                        // mas o usuário pode querer saber de qualquer chute se ativar 'shots'
                        // Se shotsOn também estiver ativo e for no alvo, pode gerar 2 notificações.
                        // Mas como são configs separadas, faz sentido respeitar.
                        // Porém, para não ficar chato, podemos verificar:
                        const isTarget = stats.shotsOnTarget > prev.shotsOnTarget;
                        if (!isTarget || !player.alerts.shotsOn) {
                             alerts.push(`👟 ${player.name}: CHUTOU! (Total: ${stats.shotsTotal})`);
                        }
                    }
                    // Improved substitution detection:
                    // 1. If they were NOT a substitute before, and NOW they are marked as substitute
                    // 2. OR if they were in the game (minutes > 0) and suddenly disappear from starters (handled by logic above, but here we check status)
                    // Note: 'isSubstitute' flag usually means they started on the bench.
                    // If a player starts, isSubstitute is false. If they get subbed out, they might still be isSubstitute=false but have a 'subbedOut' property (which we don't have here yet).
                    // However, some APIs change 'substitute' to true when moved to bench.
                    // Let's rely on a heuristic: If minutes stopped increasing while game is live? No, that's hard.
                    // Let's assume the API updates 'substitute' or moves them to the bench list.
                    
                    if (player.alerts.subOut && !prev.isSubstitute && stats.isSubstitute) {
                        alerts.push(`🔄 ${player.name}: SUBSTITUÍDO!`);
                    }
                }
                
                // Atualiza o estado local do worker
                const playerIndex = currentPlayers.findIndex(p => p.id === player.id);
                if (playerIndex !== -1) {
                    // Update lastAlertedStats if we generated alerts
                    const newLastAlertedStats = (alerts.length > 0) ? stats : player.lastAlertedStats;
                    currentPlayers[playerIndex] = { ...player, lastStats: stats, lastAlertedStats: newLastAlertedStats };
                }
                
                updates.push({ id: player.id, stats });
            }
        } catch (e) {
            console.error('Worker fetch error for event', eventId, e);
        }
    }

    if (updates.length > 0 || alerts.length > 0) {
      self.postMessage({ type: 'RESULT', updates, alerts });
    } else {
      self.postMessage({ type: 'RESULT', updates: [], alerts: [] });
    }
  } finally {
    isRunning = false;
  }
}
