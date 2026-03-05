// Background Runner Script
// This script runs in a separate background process on Android/iOS

addEventListener('checkPlayers', async (resolve, reject, args) => {
    try {
        const { players, interval } = args || {};
        
        if (!players || players.length === 0) {
            resolve();
            return;
        }

        // We need to fetch data here. Since we can't import modules easily in this context,
        // we'll use fetch directly.
        
        // Group players by eventId
        const playersByEvent = {};
        for (const p of players) {
            if (!playersByEvent[p.eventId]) playersByEvent[p.eventId] = [];
            playersByEvent[p.eventId].push(p);
        }

        // Load saved state from Preferences to avoid stale checks
        let savedStats = {};
        try {
             // We can access Capacitor plugins in the background runner context
             const { value } = await Capacitor.Plugins.Preferences.get({ key: 'bg_player_stats' });
             if (value) savedStats = JSON.parse(value);
        } catch (e) {
             console.warn('Failed to load bg stats', e);
        }

        const updates = [];
        const alerts = [];
        let stateChanged = false;

        for (const eventIdStr of Object.keys(playersByEvent)) {
            const eventId = Number(eventIdStr);
            const playersInEvent = playersByEvent[eventId];

            try {
                // Fetch lineups from backend
                // Use absolute URL for background runner as it has no base
                const response = await fetch(`https://api.sofascore.com/api/v1/event/${eventId}/lineups`, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
                        'Referer': 'https://www.sofascore.com/',
                        'Origin': 'https://www.sofascore.com',
                        'Accept': 'application/json, text/plain, */*'
                    }
                });
                if (!response.ok) continue;
                
                const data = await response.json();
                if (!data || !data.home || !data.away) continue;

                const processTeam = (teamData) => {
                    const list = [];
                    (teamData.players || []).forEach((row) => {
                        const p = row.player;
                        const stats = row.statistics || {};
                        list.push({
                            id: p.id,
                            name: p.name || p.shortName || 'Unknown',
                            minutes: stats.minutesPlayed || stats.minutes || 0,
                            substitute: row.substitute,
                            statistics: {
                                goals: stats.goals || 0,
                                assists: stats.goalAssist || stats.assists || 0,
                                totalShots: stats.totalShots || stats.shotsTotal || 0,
                                shotsOnTarget: stats.onTargetScoringAttempt || stats.shotsOnTarget || 0,
                                tackles: stats.totalTackle || stats.tackles || 0,
                                fouls: stats.fouls || stats.totalFoul || stats.foulsCommitted || 0,
                                wasFouled: stats.wasFouled || stats.foulsDrawn || 0,
                                yellowCards: stats.yellowCards || stats.yellowCard || 0,
                                redCards: stats.redCards || stats.redCard || 0,
                                rating: stats.rating || 0
                            }
                        });
                    });
                    return list;
                };

                const allPlayers = [
                    ...processTeam(data.home),
                    ...processTeam(data.away)
                ];

                for (const player of playersInEvent) {
                    const gamePlayer = allPlayers.find(p => p.id === player.sofaId);
                    if (!gamePlayer || !gamePlayer.statistics) continue;

                    const s = gamePlayer.statistics;
                    const stats = {
                        displayName: gamePlayer.name,
                        playerId: gamePlayer.id,
                        minutes: gamePlayer.minutes,
                        goals: s.goals,
                        assists: s.assists,
                        shotsTotal: s.totalShots,
                        shotsOnTarget: s.shotsOnTarget,
                        tackles: s.tackles,
                        fouls: s.fouls,
                        foulsDrawn: s.wasFouled,
                        yellowCards: s.yellowCards,
                        redCards: s.redCards,
                        rating: s.rating,
                        isSubstitute: gamePlayer.substitute
                    };

                    // Use saved state if available, otherwise fallback to args state
                    const prev = savedStats[player.id] || player.lastStats;
                    let playerAlerted = false;

                    if (prev) {
                        if (player.alerts.shotsOn && stats.shotsOnTarget > prev.shotsOnTarget) {
                            alerts.push(`🎯 ${player.name}: CHUTE NO ALVO! (Total: ${stats.shotsOnTarget})`);
                            playerAlerted = true;
                        }
                        if (player.alerts.tackles && stats.tackles > prev.tackles) {
                            alerts.push(`🛡️ ${player.name}: NOVO DESARME! (Total: ${stats.tackles})`);
                            playerAlerted = true;
                        }
                        if (player.alerts.yellow && stats.yellowCards > prev.yellowCards) {
                            alerts.push(`🟨 ${player.name}: CARTÃO AMARELO! (Total: ${stats.yellowCards})`);
                            playerAlerted = true;
                        }
                        if (player.alerts.fouls && stats.fouls > prev.fouls) {
                            alerts.push(`⚠️ ${player.name}: COMETEU FALTA! (Total: ${stats.fouls})`);
                            playerAlerted = true;
                        }
                        if (player.alerts.foulsDrawn && stats.foulsDrawn > prev.foulsDrawn) {
                            alerts.push(`🤕 ${player.name}: SOFREU FALTA! (Total: ${stats.foulsDrawn})`);
                            playerAlerted = true;
                        }
                        if (player.alerts.subOut && !prev.isSubstitute && stats.isSubstitute) {
                            alerts.push(`🔄 ${player.name}: SUBSTITUÍDO!`);
                            playerAlerted = true;
                        }
                    }
                    
                    if (playerAlerted) {
                        savedStats[player.id] = stats;
                        stateChanged = true;
                    }
                    
                    updates.push({ id: player.id, stats });
                }

            } catch (err) {
                console.error('Background fetch error', err);
            }
        }
        
        if (stateChanged) {
            try {
                await Capacitor.Plugins.Preferences.set({ 
                    key: 'bg_player_stats', 
                    value: JSON.stringify(savedStats) 
                });
            } catch (e) { console.warn('Failed to save bg stats', e); }
        }

        if (alerts.length > 0) {
            // Trigger Local Notification
            // Stagger notifications to ensure they all arrive separately
            const notifications = alerts.map((alert, idx) => ({
                title: 'Alerta de Jogo',
                body: alert,
                id: new Date().getTime() + idx,
                schedule: { at: new Date(Date.now() + 1000 + (idx * 2000)) }, // 2 second delay between each
                sound: 'beep.wav',
                smallIcon: 'ic_stat_icon_config_sample',
                actionTypeId: "",
                extra: null
            }));

            Capacitor.Plugins.LocalNotifications.schedule({ notifications });
        }

        // Save state for next run? 
        // Background Runner is stateless between runs unless we use KV store.
        // For now, we return the result to the main app if it's awake?
        // Actually, Background Runner is mainly for notifications when app is killed/backgrounded.
        // We need to persist the 'lastStats' somewhere so the next background check can compare.
        // Capacitor KV Store or similar would be needed here.
        
        // However, for this MVP fix, just sending notifications is a good step.
        // But without state, we can't compare "prev" vs "current" in the background easily 
        // unless we pass the state IN every time (which we do via args) 
        // OR we save it to storage.
        
        // Since we can't easily write back to the args for the next run in this specific plugin setup without re-registering,
        // we might rely on the main app updating the background task args when it's open.
        // When closed, the background task might run with STALE args if we don't update them.
        
        // Actually, BackgroundRunner.dispatchEvent allows passing data.
        
        resolve({ updates, alerts });

    } catch (error) {
        reject(error);
    }
});
