
import { getGamePlayers, getLiveGames } from './services/sofaService';
import { MonitoredPlayer, PlayerStats, Game } from './types';

let intervalId: any;
let heartbeatId: any;
let currentPlayers: MonitoredPlayer[] = [];
let monitoredGames: Game[] = []; // Jogos sendo monitorados
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
  } else if (type === 'UPDATE_MONITORED_GAMES') {
    monitoredGames = payload;
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
  if (isRunning || (currentPlayers.length === 0 && monitoredGames.length === 0)) return;
  isRunning = true;

  const updates: any[] = [];
  const alerts: { message: string, type: 'addition' | 'removal' | 'substitution' }[] = [];

  try {
    // 1. Monitoramento de Jogos (Gols)
    const liveGames = await getLiveGames();
    for (const game of monitoredGames) {
        const liveGame = liveGames.find(g => g.id === game.id);
        if (liveGame) {
            if (liveGame.homeTeam.score !== game.homeTeam.score || liveGame.awayTeam.score !== game.awayTeam.score) {
                alerts.push({ message: `⚽ GOL! ${liveGame.homeTeam.name} ${liveGame.homeTeam.score} - ${liveGame.awayTeam.score} ${liveGame.awayTeam.name}`, type: 'addition' });
                // Update monitoredGames state
                const gameIndex = monitoredGames.findIndex(g => g.id === game.id);
                if (gameIndex !== -1) {
                    monitoredGames[gameIndex] = liveGame;
                }
            }
        }
    }

    // 2. Monitoramento de Jogadores
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

                let playerAlerted = false;

                const prev = player.lastAlertedStats || player.lastStats;
                if (prev) {
                    if (player.alerts.shotsOn && stats.shotsOnTarget > prev.shotsOnTarget) {
                        alerts.push({ message: `🎯 ${player.name}: CHUTE NO ALVO! (Total: ${stats.shotsOnTarget})`, type: 'addition' });
                        playerAlerted = true;
                    }
                    if (player.alerts.tackles && stats.tackles > prev.tackles) {
                        alerts.push({ message: `🛡️ ${player.name}: NOVO DESARME! (Total: ${stats.tackles})`, type: 'addition' });
                        playerAlerted = true;
                    }
                    if (player.alerts.yellow && stats.yellowCards > prev.yellowCards) {
                        alerts.push({ message: `🟨 ${player.name}: CARTÃO AMARELO! (Total: ${stats.yellowCards})`, type: 'addition' });
                        playerAlerted = true;
                    }
                    if (player.alerts.fouls && stats.fouls > prev.fouls) {
                        alerts.push({ message: `⚠️ ${player.name}: COMETEU FALTA! (Total: ${stats.fouls})`, type: 'addition' });
                        playerAlerted = true;
                    }
                    if (player.alerts.foulsDrawn && stats.foulsDrawn > prev.foulsDrawn) {
                        alerts.push({ message: `🤕 ${player.name}: SOFREU FALTA! (Total: ${stats.foulsDrawn})`, type: 'addition' });
                        playerAlerted = true;
                    }
                    if (player.alerts.shots && stats.shotsTotal > prev.shotsTotal) {
                        const isTarget = stats.shotsOnTarget > prev.shotsOnTarget;
                        if (!isTarget || !player.alerts.shotsOn) {
                             alerts.push({ message: `👟 ${player.name}: CHUTOU! (Total: ${stats.shotsTotal})`, type: 'addition' });
                             playerAlerted = true;
                        }
                    }
                    if (player.alerts.subOut && !prev.isSubstitute && stats.isSubstitute) {
                        alerts.push({ message: `🔄 ${player.name}: SUBSTITUÍDO!`, type: 'substitution' });
                        playerAlerted = true;
                    }

                    // Removal checks
                    if (player.alerts.tackles && stats.tackles < prev.tackles) {
                        alerts.push({ message: `❌ ${player.name}: DESARME REMOVIDO! (Total: ${stats.tackles})`, type: 'removal' });
                        playerAlerted = true;
                    }
                    if (player.alerts.shotsOn && stats.shotsOnTarget < prev.shotsOnTarget) {
                        alerts.push({ message: `❌ ${player.name}: CHUTE NO ALVO REMOVIDO! (Total: ${stats.shotsOnTarget})`, type: 'removal' });
                        playerAlerted = true;
                    }
                }
                
                // Atualiza o estado local do worker
                const playerIndex = currentPlayers.findIndex(p => p.id === player.id);
                if (playerIndex !== -1) {
                    // Update lastAlertedStats ONLY if THIS player generated alerts
                    const newLastAlertedStats = playerAlerted ? stats : player.lastAlertedStats;
                    currentPlayers[playerIndex] = { ...player, lastStats: stats, lastAlertedStats: newLastAlertedStats };
                }
                
                updates.push({ id: player.id, stats, hasAlert: playerAlerted });
            }
        } catch (e) {
            console.error('Worker fetch error for event', eventId, e);
        }
    }

    if (updates.length > 0 || alerts.length > 0) {
      self.postMessage({ type: 'RESULT', updates, alerts, monitoredGames });
    } else {
      self.postMessage({ type: 'RESULT', updates: [], alerts: [], monitoredGames });
    }
  } finally {
    isRunning = false;
  }
}
