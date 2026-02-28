
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Square, Activity, Search, List, Volume2, VolumeX, Trash2, Settings, Plus, AlertCircle, RefreshCw, Bell, BellOff, Info, ExternalLink, ShieldAlert, X, Lock, Menu, LayoutDashboard, Download, Target, CheckCircle2, AlertTriangle, MoreVertical, Footprints, Shield, Flag, BadgeAlert, LogOut } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { App as CapApp } from '@capacitor/app';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { Game, MonitoredPlayer, LogEntry, PlayerStats, GameLineups, GamePlayer } from './types';
import * as api from './services/sofaService';
import SoccerField from './components/SoccerField';
import SofaImage from './components/SofaImage';
import SofaHeatmap from './components/SofaHeatmap';


// --- Helpers Globais ---

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

let audioCtx: AudioContext | null = null;

const initAudio = () => {
    try {
        if (!audioCtx) {
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioContext) {
                audioCtx = new AudioContext();
            }
        }
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume().catch(e => console.warn("Audio resume failed", e));
        }
    } catch (e) {
        console.warn("Audio init failed", e);
    }
    return audioCtx;
};

const triggerAlert = (frequency = 1200, duration = 300) => {
  try {
    const ctx = initAudio();
    if (ctx) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = frequency;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration / 1000);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration / 1000);
    }
    if ('vibrate' in navigator && !Capacitor.isNativePlatform()) {
        try { navigator.vibrate([200, 100, 200]); } catch(e){}
    }
  } catch (e) {
    console.error('Alert trigger error', e);
  }
};

interface GameCardProps {
  game: Game;
  onClick: (id: number) => void;
}

const GameCard = React.memo(({ game, onClick }: GameCardProps) => {
  return (
    <button 
        onClick={() => onClick(game.id)}
        className="w-full bg-zinc-900/60 backdrop-blur-md border border-zinc-800/80 p-5 rounded-[1.5rem] hover:border-emerald-500/40 transition-all active:scale-[0.98] text-left group shadow-lg relative overflow-hidden flex flex-col h-full"
    >
        <div className="flex-1 z-10 relative w-full">
            <div className="flex justify-between items-start mb-4">
                <span className="text-[10px] uppercase text-zinc-400 font-black bg-black/40 px-2 py-1 rounded-md border border-white/5 max-w-[70%] truncate tracking-wider">{game.tournament}</span>
                <div className="flex items-center gap-1.5 bg-emerald-500/10 px-2 py-1 rounded-md border border-emerald-500/10">
                    {(typeof game.minute === 'number' || game.status === 'Live') && (
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                    )}
                    <span className="text-[10px] text-emerald-400 font-mono font-black uppercase tracking-tight leading-none">
                        {typeof game.minute === 'number' ? `${game.minute}'` : (game.status === 'Ended' || game.status === 'FT' ? 'Fim' : game.status)}
                    </span>
                </div>
            </div>
            
            <div className="flex items-center justify-between gap-4">
                <div className="flex-1 space-y-3 w-full">
                    <div className="flex justify-between items-center">
                        <div className="font-bold text-zinc-100 truncate text-sm uppercase tracking-tight max-w-[70%]">{game.homeTeam.name}</div>
                        <div className="font-mono text-xl font-black text-white">{game.homeTeam.score ?? 0}</div>
                    </div>
                    <div className="flex justify-between items-center">
                        <div className="font-bold text-zinc-100 truncate text-sm uppercase tracking-tight max-w-[70%]">{game.awayTeam.name}</div>
                        <div className="font-mono text-xl font-black text-white">{game.awayTeam.score ?? 0}</div>
                    </div>
                </div>
            </div>
        </div>
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-500/5 blur-[50px] rounded-full pointer-events-none" />
    </button>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.game.id === nextProps.game.id &&
    prevProps.game.minute === nextProps.game.minute &&
    prevProps.game.status === nextProps.game.status &&
    prevProps.game.homeTeam.score === nextProps.game.homeTeam.score &&
    prevProps.game.awayTeam.score === nextProps.game.awayTeam.score
  );
});

const App: React.FC = () => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [latestCommitUrl, setLatestCommitUrl] = useState('');
  
  const [activeTab, setActiveTab] = useState<'monitor' | 'search' | 'logs'>('monitor');
  const [isMonitoring, setIsMonitoring] = useState(() => localStorage.getItem('is_monitoring') === 'true');
  const [intervalTime, setIntervalTime] = useState(() => {
    const saved = localStorage.getItem('interval_time');
    return saved ? Number(saved) : 60;
  });
  const [countdown, setCountdown] = useState(60);
  const [isMuted, setIsMuted] = useState(false);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    'Notification' in window ? Notification.permission : 'denied'
  );
  const [players, setPlayers] = useState<MonitoredPlayer[]>(() => {
    try {
        const saved = localStorage.getItem('monitored_players');
        return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });
  const playersRef = useRef<MonitoredPlayer[]>(players);
  
  // Keep ref in sync with state
  useEffect(() => {
      playersRef.current = players;
  }, [players]);

  // Update Checker
  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const response = await fetch('https://api.github.com/repos/luanfca/MonitorLive/commits');
        const data = await response.json();
        const latestCommit = data[0]?.sha;
        const currentCommit = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

        if (latestCommit && currentCommit && currentCommit !== 'dev' && latestCommit !== currentCommit) {
          // Em um cenário real de OTA (Over-The-Air) com Capacitor Updater,
          // você precisaria de um servidor que fornecesse o .zip da build (pasta dist).
          // Como estamos usando GitHub Releases, vamos assumir que você fará o upload de um update.zip
          // na release 'latest' junto com o APK.
          setLatestCommitUrl('https://github.com/luanfca/MonitorLive/releases/download/latest/update.zip');
          setUpdateAvailable(true);
        }
      } catch (error) {
        console.error('Failed to check for updates', error);
      }
    };
    
    if (Capacitor.isNativePlatform()) {
        CapacitorUpdater.notifyAppReady();
        checkUpdate();
    }
  }, []);

  const handleUpdate = async () => {
      if (!latestCommitUrl) return;
      
      setIsUpdating(true);
      try {
          // Ouve o progresso do download
          CapacitorUpdater.addListener('download', (info) => {
              setUpdateProgress(Math.round((info.percent || 0) * 100));
          });

          // Baixa a atualização
          const version = await CapacitorUpdater.download({
              url: latestCommitUrl,
              version: Date.now().toString(), // Um ID único para a versão
          });

          // Aplica a atualização e recarrega o app
          await CapacitorUpdater.set({ id: version.id });
      } catch (error) {
          console.error('Erro ao atualizar:', error);
          alert('Falha ao baixar a atualização. Tente novamente mais tarde.');
          setIsUpdating(false);
      }
  };

  const [logs, setLogs] = useState<LogEntry[]>(() => {
      try {
          const saved = localStorage.getItem('match_logs');
          return saved ? JSON.parse(saved) : [];
      } catch (e) { return []; }
  });
  const [toasts, setToasts] = useState<{id: string, msg: string, type: string}[]>([]);
  const [updatedPlayersIds, setUpdatedPlayersIds] = useState<Set<number>>(new Set());
  const [liveGames, setLiveGames] = useState<Game[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null);
  const [lineups, setLineups] = useState<GameLineups | null>(null);
  const [isLoadingGames, setIsLoadingGames] = useState(false);
  const [isLoadingLineups, setIsLoadingLineups] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [lastSync, setLastSync] = useState<string>('Aguardando primeira varredura...');
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [selectedPlayerDetails, setSelectedPlayerDetails] = useState<MonitoredPlayer | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const keepAliveOscillator = useRef<OscillatorNode | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wakeLockRef = useRef<any>(null);
  const isWorkerUpdate = useRef(false);

  const addToast = (msg: string, type: string) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, {id, msg, type}]);
    setTimeout(() => { setToasts(prev => prev.filter(t => t.id !== id)); }, 4000);
  };

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    const entry: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      time: new Date().toLocaleTimeString('pt-BR'),
      message,
      type
    };
    setLogs(prev => [entry, ...prev].slice(0, 50));
  };

  useEffect(() => {
      addLog('Iniciando LiveMatch v2.1 (Anti-Bloqueio Ativado)', 'info');
      if (Capacitor.isNativePlatform()) {
          addLog('Modo Nativo Detectado: Usando CapacitorHttp com Rotação de UA', 'success');
      } else {
          addLog('Modo Web: Usando Proxy Local', 'info');
      }
  }, []);

  const sendNotification = async (title: string, body: string) => {
    if (!isMuted) triggerAlert(1200, 500);

    // 1. Android/iOS Nativo (Capacitor)
    if (Capacitor.isNativePlatform()) {
        try {
            // Garante permissão antes de enviar
            const perm = await LocalNotifications.checkPermissions();
            if (perm.display !== 'granted') return;

            await LocalNotifications.schedule({
                notifications: [{
                    title: title,
                    body: body,
                    id: new Date().getTime() % 2147483647, // Garante Inteiro válido 32-bit
                    schedule: { at: new Date(Date.now() + 100) }, // 100ms delay para garantir execução
                    sound: undefined, // Som padrão
                    attachments: [],
                    actionTypeId: "",
                    extra: null,
                    channelId: 'live_match_alerts_v3' // FUNDAMENTAL para popup no Android 8+
                }]
            });
        } catch (e) {
            console.error("Erro ao enviar notificação nativa", e);
        }
        return;
    }

    // 2. Web / PWA
    if (notifPermission !== 'granted') return;
    const options: any = {
        body: body,
        icon: 'https://cdn-icons-png.flaticon.com/512/53/53283.png',
        badge: 'https://cdn-icons-png.flaticon.com/512/53/53283.png',
        vibrate: [200, 100, 200, 100, 200],
        tag: 'live-alert',
        renotify: true,
        requireInteraction: true,
    };
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(title, options);
        return;
      } catch (e) {}
    } 
    try {
       const n = new Notification(title, options);
       n.onclick = () => window.focus();
    } catch (e) {}
  };

  // Force update when returning to app
  const forceUpdate = useCallback(async () => {
    if (isMonitoring && workerRef.current) {
        workerRef.current.postMessage({ type: 'FORCE_CHECK' });
        addLog('Retomando monitoramento...', 'info');

        // Re-request Wake Lock if lost
        if ('wakeLock' in navigator && !wakeLockRef.current) {
            try {
                wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
            } catch (err) {}
        }
    }
  }, [isMonitoring]);

  useEffect(() => {
    // Browser visibility
    const handleVisibility = () => {
        if (document.visibilityState === 'visible') forceUpdate();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Capacitor App State
    let appStateListener: any;
    if (Capacitor.isNativePlatform()) {
        appStateListener = CapApp.addListener('appStateChange', async ({ isActive }) => {
            if (isActive) {
                forceUpdate();
                // Stop background runner when app is active to save battery/resources
                // (Optional: keep it running if you want double check)
            } else if (isMonitoring) {
                // App went to background, start/update background task
                try {
                    const { BackgroundRunner } = await import('@capacitor/background-runner');
                    await BackgroundRunner.dispatchEvent({
                        label: 'com.livematch.tracker.background',
                        event: 'checkPlayers',
                        details: {
                            players: playersRef.current,
                            interval: intervalTime
                        }
                    });
                    addLog('Monitoramento em segundo plano ativado', 'info');
                } catch (e) {
                    console.error('Background Runner Error:', e);
                }
            }
        });
    }

    return () => {
        document.removeEventListener('visibilitychange', handleVisibility);
        if (appStateListener) appStateListener.remove();
    };
  }, [forceUpdate]);

  // Handle updates from worker or main thread
  const handleWorkerResult = useCallback((updates: any[], alerts: string[]) => {
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setLastSync(`Atualizado hoje às ${timeStr}`);
        setCountdown(intervalTime); // Reset visual countdown on actual sync
        
        // Handle Alerts
        if (alerts && alerts.length > 0) {
            sendNotification('ALERTA DE JOGO ⚽', alerts[0]);
            alerts.forEach((msg: string) => addLog(msg, 'success'));
        }

        // Update Players State
        if (updates && updates.length > 0) {
            isWorkerUpdate.current = true;
            const changedIds = new Set<number>();

            setPlayers(prevPlayers => {
                return prevPlayers.map(p => {
                    const update = updates.find((u: any) => u.id === p.id);
                    if (update) {
                        // Check for actual changes before updating
                        const prev = p.lastStats;
                        const curr = update.stats;
                        let hasChanged = false;

                        if (!prev) {
                            hasChanged = true;
                        } else {
                            // Compare key stats to determine if we should blink
                            if (prev.minutes !== curr.minutes ||
                                prev.goals !== curr.goals ||
                                prev.assists !== curr.assists ||
                                prev.shotsTotal !== curr.shotsTotal ||
                                prev.shotsOnTarget !== curr.shotsOnTarget ||
                                prev.tackles !== curr.tackles ||
                                prev.interceptions !== curr.interceptions ||
                                prev.duelsWon !== curr.duelsWon ||
                                prev.fouls !== curr.fouls ||
                                prev.foulsDrawn !== curr.foulsDrawn ||
                                prev.yellowCards !== curr.yellowCards ||
                                prev.redCards !== curr.redCards ||
                                prev.totalPasses !== curr.totalPasses ||
                                prev.rating !== curr.rating) {
                                hasChanged = true;
                            }
                        }

                        if (hasChanged) {
                            changedIds.add(p.id);
                        }

                        // PROTEÇÃO: Só atualiza se os novos dados parecerem válidos ou se os minutos aumentaram
                        // Se os novos minutos forem 0 e já tínhamos minutos, mantemos os antigos (provável bug da API)
                        const currentMinutes = p.lastStats?.minutes || 0;
                        const newMinutes = update.stats.minutes || 0;
                        
                        if (newMinutes < currentMinutes && newMinutes === 0 && currentMinutes > 0) {
                            // Mantém os antigos se os novos vierem zerados por erro
                            return p;
                        }
                        
                        // If we have alerts, update lastAlertedStats to current stats
                        // This ensures the next check uses these stats as the baseline
                        const newLastAlertedStats = (alerts && alerts.length > 0 && hasChanged) ? update.stats : p.lastAlertedStats;

                        return { ...p, lastStats: update.stats, lastAlertedStats: newLastAlertedStats };
                    }
                    return p;
                });
            });
            
            // Only blink if there are actual changes or alerts
            if (changedIds.size > 0 || (alerts && alerts.length > 0)) {
                setUpdatedPlayersIds(changedIds);
                setTimeout(() => setUpdatedPlayersIds(new Set()), 4000);
            }
            
            setTimeout(() => { isWorkerUpdate.current = false; }, 100);
        }
  }, [intervalTime, sendNotification]);

  // Native Polling Logic (Fallback for Worker)
  const isCheckingRef = useRef(false);
  
  const runNativeCheck = useCallback(async () => {
      // Use ref directly to always get latest state without closure issues
      const currentPlayers = playersRef.current;
      
      // CRITICAL: Check isMonitoring AGAIN inside the callback to prevent race conditions
      // where a check starts just as monitoring is stopped.
      if (!isMonitoring || currentPlayers.length === 0 || isCheckingRef.current) return;
      isCheckingRef.current = true;

      const updates: any[] = [];
      const alerts: string[] = [];

      // Group by event
      const playersByEvent: Record<number, MonitoredPlayer[]> = {};
      for (const p of currentPlayers) {
          if (!playersByEvent[p.eventId]) playersByEvent[p.eventId] = [];
          playersByEvent[p.eventId].push(p);
      }

      for (const eventIdStr of Object.keys(playersByEvent)) {
          const eventId = Number(eventIdStr);
          const playersInEvent = playersByEvent[eventId];
          
          try {
              const lineups = await api.getGamePlayers(eventId);
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

                  // Use lastAlertedStats if available, otherwise fallback to lastStats
                  // This ensures we compare against what we LAST ALERTED, not just last fetched state
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
                          const isTarget = stats.shotsOnTarget > prev.shotsOnTarget;
                          if (!isTarget || !player.alerts.shotsOn) {
                               alerts.push(`👟 ${player.name}: CHUTOU! (Total: ${stats.shotsTotal})`);
                          }
                      }
                      if (player.alerts.subOut && !prev.isSubstitute && stats.isSubstitute) {
                          alerts.push(`🔄 ${player.name}: SUBSTITUÍDO!`);
                      }
                  }
                  updates.push({ id: player.id, stats });
              }
          } catch (e) {
              console.error('Native fetch error', e);
          }
      }

      // FINAL CHECK: If monitoring was stopped while we were fetching, DO NOT ALERT.
      if (!isMonitoring) {
          isCheckingRef.current = false;
          return;
      }

      handleWorkerResult(updates, alerts);
      isCheckingRef.current = false;
  }, [isMonitoring, handleWorkerResult]);

  useEffect(() => {
      let timeoutId: any;
      let isActive = true;
      
      const loop = async () => {
          if (!isActive) return;
          if (Capacitor.isNativePlatform() && isMonitoring) {
              await runNativeCheck();
              if (isActive) {
                  timeoutId = setTimeout(loop, intervalTime * 1000);
              }
          }
      };

      if (Capacitor.isNativePlatform() && isMonitoring) {
          loop();
      }
      
      return () => {
          isActive = false;
          clearTimeout(timeoutId);
      };
  }, [isMonitoring, intervalTime, runNativeCheck]);

  // Initialize Worker (Web Only)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
        workerRef.current = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
        workerRef.current.onerror = (e) => console.error('Worker error:', e);
    }
    return () => {
        workerRef.current?.terminate();
    };
  }, []);

  // Update onmessage handler
  useEffect(() => {
    if (workerRef.current) {
        workerRef.current.onmessage = (e) => {
            const { type, updates, alerts, message } = e.data;
            if (type === 'ERROR') {
                addToast(message, 'error');
            } else if (type === 'RESULT') {
                handleWorkerResult(updates, alerts);
            }
        };
    }
  }, [handleWorkerResult]);






  // Sync players with worker
  useEffect(() => {
      if (isMonitoring && workerRef.current) {
          workerRef.current.postMessage({ type: 'UPDATE_PLAYERS', payload: players });
      }
  }, [players, isMonitoring]);




  // Inicialização do Canal de Notificação para Android (Pop-up/Heads-up)
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
        // Cria canal com configurações agressivas para garantir visibilidade
        LocalNotifications.createChannel({
            id: 'live_match_alerts_v3', // ID novo para forçar atualização
            name: 'Alertas ao Vivo (Prioridade)',
            description: 'Notificações de eventos em tempo real',
            importance: 5, // 5 = HIGH (Força o popup/banner)
            visibility: 1, // 1 = PUBLIC (Mostra conteúdo na tela de bloqueio)
            vibration: true,
            sound: undefined, // Usa som padrão do sistema
            lights: true,
            lightColor: '#10B981' // Emerald color
        }).catch(err => console.error("Erro criando channel", err));
    }
  }, []);

  const subscribePush = async () => {
      // PWA Push Logic
      if (!('serviceWorker' in navigator) || Capacitor.isNativePlatform()) return;
      if (!('PushManager' in window)) return;
      try {
          const swReadyPromise = navigator.serviceWorker.ready;
          const timeoutPromise = new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error('Timeout SW')), 4000)
          );
          const reg = await Promise.race([swReadyPromise, timeoutPromise]) as ServiceWorkerRegistration;
          const existingSub = await reg.pushManager.getSubscription();
          if (existingSub) return;
          const permission = await Notification.requestPermission();
          if (permission !== 'granted') return;
          const vapidPublicKey = 'BOx7Xmb4hHpCQ6pEa7LLNrhn_KubWhLS4LjlhI1dDYLcVvd7lmpk9EWoYHEafNM_A9HmRhtNzdBjynMENDt9Q9k';
          const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
          });
          await fetch('/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sub)
          });
          addToast('Notificações Push Conectadas', 'success');
      } catch (e) { console.warn('Push error', e); }
  };

  const startKeepAlive = () => {
      const ctx = initAudio();
      if (ctx && !keepAliveOscillator.current) {
          try {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.frequency.value = 20; 
              gain.gain.value = 0.0001;
              osc.start();
              keepAliveOscillator.current = osc;
          } catch (e) {}
      }
  };

  const stopKeepAlive = () => {
      if (keepAliveOscillator.current) {
          try {
            keepAliveOscillator.current.stop();
            keepAliveOscillator.current.disconnect();
            keepAliveOscillator.current = null;
          } catch (e) {}
      }
  };

  useEffect(() => { localStorage.setItem('is_monitoring', String(isMonitoring)); }, [isMonitoring]);
  useEffect(() => { 
    localStorage.setItem('interval_time', String(intervalTime)); 
    if (isMonitoring && workerRef.current) {
        workerRef.current.postMessage({ type: 'UPDATE_INTERVAL', payload: intervalTime });
    }
  }, [intervalTime, isMonitoring]);
  useEffect(() => { localStorage.setItem('match_logs', JSON.stringify(logs)); }, [logs]);
  useEffect(() => {
    playersRef.current = players;
    localStorage.setItem('monitored_players', JSON.stringify(players));
    
    // Sync with worker if monitoring is active and list changed by USER (not worker)
    if (isMonitoring && workerRef.current && !isWorkerUpdate.current) {
        workerRef.current.postMessage({ type: 'UPDATE_PLAYERS', payload: players });
        
        // Also update background runner if active
        if (Capacitor.isNativePlatform()) {
            import('@capacitor/background-runner').then(({ BackgroundRunner }) => {
                BackgroundRunner.dispatchEvent({
                    label: 'com.livematch.tracker.background',
                    event: 'checkPlayers',
                    details: {
                        players: players,
                        interval: intervalTime
                    }
                }).catch(console.error);
            });
        }
    }
    // Reset flag
    isWorkerUpdate.current = false;

    // Auto-stop if list is empty
    if (players.length === 0 && isMonitoring) {
        setIsMonitoring(false);
        workerRef.current?.postMessage({ type: 'STOP' });
        if (audioRef.current) audioRef.current.pause();
        if (wakeLockRef.current) {
            wakeLockRef.current.release()
                .then(() => { wakeLockRef.current = null; })
                .catch((e: any) => console.warn('Wake Lock release failed', e));
        }
        stopKeepAlive();
        addLog('Monitoramento parado: Lista vazia', 'info');
    }
  }, [players, isMonitoring]);

  useEffect(() => {
    if ('Notification' in window && !Capacitor.isNativePlatform()) {
      const checkPermission = () => {
          const current = Notification.permission;
          setNotifPermission(current);
      };
      const permInterval = setInterval(checkPermission, 1500);
      return () => clearInterval(permInterval);
    }
  }, []);





  const testNotification = () => {
    sendNotification('⚽ Teste do LiveMatch', 'As notificações estão ativas! Se você recebeu isso, o radar está pronto.');
  };

  const requestNativePermissions = async () => {
      try {
          const result = await LocalNotifications.requestPermissions();
          if (result.display === 'granted') {
              addToast('Permissões Nativas Concedidas', 'success');
              setNotifPermission('granted');
          } else {
              setNotifPermission('denied');
              setIsHelpOpen(true);
          }
      } catch (e) {
          console.error("Erro pedindo permissão nativa", e);
      }
  };

  const handleStartMonitoring = async () => {
      if (players.length === 0 && !isMonitoring) {
          addToast('Adicione jogadores para monitorar', 'error');
          return;
      }
      initAudio();
      const newMonitoringState = !isMonitoring;
      setIsMonitoring(newMonitoringState);
      
      if (newMonitoringState) {
          // Start Worker
          if (workerRef.current) {
              workerRef.current.postMessage({ 
                  type: 'START', 
                  payload: { players, interval: intervalTime } 
              });
          }

          // Start Audio Keep-Alive (Silent Loop) - Robust
          if (audioRef.current) {
              audioRef.current.muted = true; // Ensure muted to allow autoplay policy
              audioRef.current.volume = 0.01; // Minimal volume just in case
              audioRef.current.loop = true;
              const playPromise = audioRef.current.play();
              if (playPromise !== undefined) {
                  playPromise.catch(error => {
                      console.warn("Audio play failed, user interaction needed", error);
                  });
              }
          }

          // Request Wake Lock
          if ('wakeLock' in navigator) {
              try {
                  // @ts-ignore
                  navigator.wakeLock.request('screen')
                      .then((lock) => {
                          wakeLockRef.current = lock;
                          lock.addEventListener('release', () => {
                              console.log('Wake Lock released');
                              // Re-request if still monitoring
                              if (isMonitoring) {
                                  // @ts-ignore
                                  navigator.wakeLock.request('screen')
                                      .then(l => wakeLockRef.current = l)
                                      .catch(e => console.warn('Re-request Wake Lock failed', e));
                              }
                          });
                      })
                      .catch((err) => {
                          console.warn('Wake Lock request failed:', err);
                      });
              } catch (err) {
                  console.error('Wake Lock error', err);
              }
          }

          startKeepAlive(); // Keep existing oscillator as backup

          (async () => {
              try {
                  if (Capacitor.isNativePlatform()) {
                      await requestNativePermissions();
                  } else {
                      // Web Logic
                      if (notifPermission === 'default' && 'Notification' in window) {
                          const p = await Notification.requestPermission();
                          setNotifPermission(p);
                      }
                      if (notifPermission === 'granted') await subscribePush();
                      else if (notifPermission === 'denied') setIsHelpOpen(true);
                  }
              } catch (err) {}
          })();
      } else { 
          // Stop Worker
          workerRef.current?.postMessage({ type: 'STOP' });
          
          // Stop Audio
          if (audioRef.current) {
              audioRef.current.pause();
          }

          // Release Wake Lock
          if (wakeLockRef.current) {
              try {
                  await wakeLockRef.current.release();
              } catch (e) {
                  console.warn('Wake Lock release failed', e);
              }
              wakeLockRef.current = null;
          }

          stopKeepAlive(); 
      }
  };

  // Removed monitorCycle as it is now handled by the worker


  const zeroCountRef = useRef(0);

  useEffect(() => {
    if (isMonitoring) {
        setCountdown(intervalTime);
        zeroCountRef.current = 0;
        
        countdownRef.current = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 0) {
                    zeroCountRef.current += 1;
                    // Se ficar no 0 por mais de 10 segundos extras, força o worker
                    if (zeroCountRef.current > 10) {
                        forceUpdate();
                        zeroCountRef.current = 0;
                    }
                    return 0;
                }
                zeroCountRef.current = 0;
                return prev - 1;
            });
        }, 1000);
    } else {
        if (countdownRef.current) clearInterval(countdownRef.current);
        setCountdown(0);
    }
    return () => {
        if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [isMonitoring, intervalTime]);

  const fetchGames = async () => {
    setIsLoadingGames(true);
    const games = await api.getLiveGames();
    setLiveGames(games);
    setIsLoadingGames(false);
  };

  const selectGame = async (gameId: number) => {
    if (selectedGameId === gameId) { setSelectedGameId(null); setLineups(null); return; }
    setSelectedGameId(gameId);
    setIsLoadingLineups(true);
    const data = await api.getGamePlayers(gameId);
    setLineups(data);
    setIsLoadingLineups(false);
  };

  const addPlayer = (gamePlayer: GamePlayer) => {
    if (players.some(p => p.sofaId === gamePlayer.id)) { addLog(`${gamePlayer.name} já está no radar`, 'alert'); return; }
    if (!selectedGameId) return;

    // PREENCHIMENTO INICIAL DOS DADOS (CORREÇÃO DE UX E BUG)
    // Usa os dados que já temos da escalação para não começar zerado e resolver problema de "não mostra faltas"
    const initialStats: PlayerStats | null = gamePlayer.statistics ? {
        displayName: gamePlayer.name,
        playerId: gamePlayer.id,
        minutes: gamePlayer.minutes,
        goals: gamePlayer.statistics.goals || 0,
        assists: gamePlayer.statistics.assists || 0,
        tackles: gamePlayer.statistics.tackles || 0,
        interceptions: gamePlayer.statistics.interceptions || 0,
        duelsWon: gamePlayer.statistics.duelsWon || 0,
        fouls: gamePlayer.statistics.fouls || 0,
        foulsDrawn: gamePlayer.statistics.wasFouled || 0,
        shotsTotal: gamePlayer.statistics.totalShots || 0,
        shotsOnTarget: gamePlayer.statistics.shotsOnTarget || 0,
        keyPasses: gamePlayer.statistics.keyPasses || 0,
        totalPasses: gamePlayer.statistics.totalPasses || 0,
        yellowCards: 0, 
        redCards: 0,
        rating: gamePlayer.statistics.rating || 0,
        isSubstitute: gamePlayer.substitute
    } : null;

    const newPlayer: MonitoredPlayer = {
        id: Date.now(),
        sofaId: gamePlayer.id,
        name: gamePlayer.name,
        eventId: selectedGameId,
        alerts: {
            tackles: false, 
            fouls: false, 
            foulsDrawn: false,
            shots: false, 
            shotsOn: false, 
            yellow: false, 
            subOut: false,
            interceptions: false,
            duelsWon: false
        },
        lastStats: initialStats
    };
    setPlayers(prev => [...prev, newPlayer]);
    addLog(`${gamePlayer.name} monitorado`, 'success');
    addToast(`${gamePlayer.name} adicionado!`, 'success');
  };

  const renderHelpModal = () => (
    <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
        <div className="bg-zinc-900 border border-emerald-500/30 w-full max-w-sm rounded-[2rem] p-6 relative shadow-[0_0_50px_rgba(16,185,129,0.15)] overflow-y-auto max-h-[90vh]">
            <button onClick={() => setIsHelpOpen(false)} className="absolute top-4 right-4 p-2 bg-black/20 rounded-full text-zinc-400 hover:text-white transition-colors">
                <X size={20} />
            </button>
            <div className="flex flex-col items-center text-center gap-4 mt-2">
                <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mb-1 animate-pulse"><Bell size={32} className="text-emerald-500" /></div>
                <div>
                    <h3 className="text-xl font-black uppercase text-white tracking-tight mb-2">Ajuda & Configuração</h3>
                    <p className="text-[11px] text-zinc-400 leading-relaxed font-medium mb-4 px-2 italic">Configure seu Android para garantir que o monitoramento funcione em segundo plano.</p>
                </div>
                
                <div className="bg-black/40 p-5 rounded-2xl text-left w-full border border-white/5 space-y-4">
                    <div className="flex gap-4">
                        <div className="w-7 h-7 bg-emerald-500/20 rounded-lg flex items-center justify-center text-xs font-bold text-emerald-400 shrink-0">1</div>
                        <div className="space-y-1">
                            <p className="text-[11px] text-zinc-300 font-bold uppercase">Bateria & Otimização</p>
                            <p className="text-[10px] text-zinc-500">O Android mata apps em segundo plano. Para evitar isso:</p>
                            <div className="bg-zinc-800/50 p-2 rounded-lg border border-white/5 mt-1">
                                <p className="text-[9px] text-zinc-400">
                                    1. Abra <strong>Configurações</strong> do Android<br/>
                                    2. Vá em <strong>Aplicativos</strong> &gt; <strong>LiveMatch Tracker</strong><br/>
                                    3. Toque em <strong>Bateria</strong><br/>
                                    4. Selecione <strong>"Sem Restrições"</strong> (ou "Não Otimizar")
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <div className="w-7 h-7 bg-emerald-500/20 rounded-lg flex items-center justify-center text-xs font-bold text-emerald-400 shrink-0">2</div>
                        <div className="space-y-1">
                            <p className="text-[11px] text-zinc-300 font-bold uppercase">Notificações Bloqueadas?</p>
                            <p className="text-[10px] text-zinc-500">Se o botão de notificação estiver cinza nas configurações:</p>
                            <ul className="list-disc pl-4 text-[9px] text-zinc-500 space-y-1 mt-1">
                                <li>Toque nos 3 pontinhos (canto superior)</li>
                                <li>"Permitir configurações restritas"</li>
                            </ul>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col w-full gap-3 mt-4">
                    <button onClick={async () => {
                        if (Capacitor.isNativePlatform()) {
                             await requestNativePermissions();
                        } else if ('Notification' in window) {
                             await Notification.requestPermission();
                        }
                        setIsHelpOpen(false);
                    }} className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase tracking-widest rounded-xl transition-all active:scale-95 shadow-lg shadow-emerald-900/20">Solicitar Permissões</button>
                </div>
            </div>
        </div>
    </div>
  );

  const Heatmap = ({ eventId, playerId }: { eventId: number, playerId: number }) => {
    return (
        <div className="relative w-full h-full flex items-center justify-center">
            <SofaHeatmap 
                eventId={eventId}
                playerId={playerId}
                className="w-full h-full object-contain relative z-10"
            />
            <div className="absolute bottom-3 right-3 z-20">
                <div className="px-2 py-1 bg-black/60 backdrop-blur-md rounded-lg border border-white/10 text-[7px] font-black text-zinc-400 uppercase tracking-widest">
                    Atualizado em tempo real
                </div>
            </div>
        </div>
    );
};

interface PlayerDetailsModalProps {
    player: MonitoredPlayer;
    onClose: () => void;
}

const PlayerDetailsModal: React.FC<PlayerDetailsModalProps> = ({ player, onClose }) => {
    if (!player || !player.lastStats) return null;
    const s = player.lastStats;

    return (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-zinc-900/95 backdrop-blur-xl w-full max-w-md rounded-[2.5rem] border border-white/10 p-8 relative shadow-2xl overflow-y-auto max-h-[90vh] ring-1 ring-white/5">
                <div className="flex justify-between items-start mb-8">
                    <div className="flex items-center gap-5">
                        <div className="w-20 h-20 bg-black rounded-3xl border border-white/10 overflow-hidden shadow-2xl ring-1 ring-black/50">
                            <SofaImage playerId={player.sofaId} alt={player.name} className="w-full h-full object-cover" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black uppercase text-white tracking-tighter leading-none mb-2">{player.name}</h3>
                            <div className="flex items-center gap-3">
                                <span className={`px-3 py-1 rounded-xl text-xs font-black font-mono shadow-lg ${s.rating >= 7 ? 'bg-emerald-500 text-black' : 'bg-zinc-800 text-white'}`}>
                                    {s.rating.toFixed(1)} <span className="opacity-60 ml-1 text-[10px]">RATING</span>
                                </span>
                                <span className="text-[10px] text-zinc-500 font-black uppercase tracking-widest bg-white/5 px-3 py-1 rounded-lg border border-white/5">{s.minutes}' JOGADOS</span>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="bg-white/5 p-2.5 rounded-full text-zinc-400 hover:text-white transition-colors"><X size={24}/></button>
                </div>

                <div className="space-y-8">
                    {/* Ataque */}
                    <div className="animate-in slide-in-from-bottom-2 duration-300 delay-75">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                                <Target size={16} className="text-blue-400"/>
                            </div>
                            <h4 className="text-xs font-black uppercase text-white tracking-[0.2em]">Ataque</h4>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="bg-black/30 p-4 rounded-2xl border border-white/5 text-center group hover:bg-black/40 transition-colors">
                                <div className="text-2xl font-black text-white font-mono mb-0.5">{s.goals}</div>
                                <div className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Gols</div>
                            </div>
                            <div className="bg-black/30 p-4 rounded-2xl border border-white/5 text-center group hover:bg-black/40 transition-colors">
                                <div className="text-2xl font-black text-white font-mono mb-0.5">{s.assists}</div>
                                <div className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Assists</div>
                            </div>
                            <div className="bg-black/30 p-4 rounded-2xl border border-white/5 text-center group hover:bg-black/40 transition-colors">
                                <div className="text-2xl font-black text-white font-mono mb-0.5">{s.shotsOnTarget}<span className="text-zinc-600 text-sm mx-0.5">/</span>{s.shotsTotal}</div>
                                <div className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Chutes (Alvo)</div>
                            </div>
                        </div>
                    </div>

                    {/* Construção */}
                    <div className="animate-in slide-in-from-bottom-2 duration-300 delay-150">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                                <Activity size={16} className="text-emerald-400"/>
                            </div>
                            <h4 className="text-xs font-black uppercase text-white tracking-[0.2em]">Construção</h4>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="bg-black/30 p-4 rounded-2xl border border-white/5 text-center group hover:bg-black/40 transition-colors">
                                <div className="text-2xl font-black text-white font-mono mb-0.5">{s.keyPasses}</div>
                                <div className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Passes Dec.</div>
                            </div>
                            <div className="bg-black/30 p-4 rounded-2xl border border-white/5 text-center group hover:bg-black/40 transition-colors">
                                <div className="text-2xl font-black text-white font-mono mb-0.5">{s.totalPasses}</div>
                                <div className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Passes Tot.</div>
                            </div>
                            <div className="bg-black/30 p-4 rounded-2xl border border-white/5 text-center group hover:bg-black/40 transition-colors">
                                <div className="text-2xl font-black text-white font-mono mb-0.5">{s.foulsDrawn}</div>
                                <div className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Sofridas</div>
                            </div>
                        </div>
                    </div>

                    {/* Defesa */}
                    <div className="animate-in slide-in-from-bottom-2 duration-300 delay-200">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 rounded-xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
                                <Shield size={16} className="text-orange-400"/>
                            </div>
                            <h4 className="text-xs font-black uppercase text-white tracking-[0.2em]">Defesa</h4>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="bg-black/30 p-4 rounded-2xl border border-white/5 text-center group hover:bg-black/40 transition-colors">
                                <div className="text-2xl font-black text-white font-mono mb-0.5">{s.tackles}</div>
                                <div className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Desarmes</div>
                            </div>
                            <div className="bg-black/30 p-4 rounded-2xl border border-white/5 text-center group hover:bg-black/40 transition-colors">
                                <div className="text-2xl font-black text-white font-mono mb-0.5">{s.interceptions}</div>
                                <div className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Intercep.</div>
                            </div>
                            <div className="bg-black/30 p-4 rounded-2xl border border-white/5 text-center group hover:bg-black/40 transition-colors">
                                <div className="text-2xl font-black text-white font-mono mb-0.5">{s.duelsWon}</div>
                                <div className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Duelos</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

  const removePlayer = (id: number) => setPlayers(prev => prev.filter(p => p.id !== id));
  const toggleAlert = (playerId: number, key: keyof MonitoredPlayer['alerts']) => {
    setPlayers(prev => prev.map(p => {
        if (p.id !== playerId) return p;
        return { ...p, alerts: { ...p.alerts, [key]: !p.alerts[key] } };
    }));
  };

  const renderPlayerCard = (p: MonitoredPlayer) => {
    const s = p.lastStats || { 
        tackles: 0, fouls: 0, foulsDrawn: 0, shotsTotal: 0, shotsOnTarget: 0, yellowCards: 0, redCards: 0, rating: 0,
        goals: 0, assists: 0, keyPasses: 0, totalPasses: 0, interceptions: 0, duelsWon: 0, minutes: 0,
        isSubstitute: false, displayName: p.name, playerId: p.sofaId
    };
    const isUpdated = updatedPlayersIds.has(p.id);
    
    // Configuração dos itens de monitoramento para o Grid unificado
    const monitorItems = [
        { key: 'tackles', label: 'Desarmes', val: s.tackles, icon: Shield },
        { key: 'fouls', label: 'Cometidas', val: s.fouls, icon: AlertTriangle },
        { key: 'foulsDrawn', label: 'Sofridas', val: s.foulsDrawn, icon: Flag },
        { key: 'shots', label: 'Chutes', val: s.shotsTotal, icon: Footprints },
        { key: 'shotsOn', label: 'No Alvo', val: s.shotsOnTarget, icon: Target },
        { key: 'yellow', label: 'Cartões', val: s.yellowCards + s.redCards, icon: BadgeAlert, isCard: true },
        { key: 'subOut', label: 'Saída', val: s.minutes > 0 ? 'ON' : 'OFF', icon: LogOut },
    ];

    return (
        <div key={p.id} className={`bg-gradient-to-br from-zinc-900 to-black rounded-[2rem] border transition-all duration-500 overflow-hidden relative shadow-2xl group ${isUpdated ? 'border-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.3)] scale-[1.02] ring-1 ring-emerald-500/50' : 'border-zinc-800 hover:border-zinc-700'}`}>
            {isUpdated && <div className="absolute inset-0 bg-emerald-500/10 animate-pulse pointer-events-none z-0" />}
            
            {/* Header: Imagem, Nome e Ações */}
            <div className="p-5 flex gap-4 items-center border-b border-white/5 bg-white/[0.02]">
                <div className="relative">
                    <div className="w-14 h-14 bg-black rounded-2xl border border-zinc-700 overflow-hidden shadow-lg relative z-10">
                        <SofaImage playerId={p.sofaId} alt={p.name} className="w-full h-full object-cover" />
                    </div>
                    {/* Indicador de Rating */}
                    {s.rating > 0 && (
                        <div className={`absolute -bottom-2 -right-2 z-20 px-1.5 py-0.5 rounded-lg border border-black/50 shadow-md text-[10px] font-black font-mono ${s.rating >= 7 ? 'bg-emerald-500 text-black' : 'bg-zinc-800 text-white'}`}>
                            {s.rating.toFixed(1)}
                        </div>
                    )}
                </div>
                
                <div className="flex-1 min-w-0">
                    <h3 className="font-black text-white text-lg leading-tight uppercase tracking-tight truncate">{p.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                        <div className="flex items-center gap-1.5 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/10">
                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                            <span className="text-[9px] text-emerald-400 font-black tracking-widest uppercase">Ao Vivo</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-zinc-800/50 px-2 py-0.5 rounded-md border border-white/5">
                             <span className="text-[9px] text-zinc-300 font-black tracking-widest uppercase">{s.minutes}'</span>
                        </div>
                        <button onClick={() => setSelectedPlayerDetails(p)} className="text-[9px] font-bold uppercase text-zinc-500 hover:text-white flex items-center gap-1 bg-zinc-800/50 px-2 py-0.5 rounded-md transition-colors">
                            <Plus size={10} /> Detalhes
                        </button>
                    </div>
                </div>

                <button onClick={() => removePlayer(p.id)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-800/50 text-zinc-500 hover:bg-red-500/20 hover:text-red-400 transition-colors">
                    <Trash2 size={16} />
                </button>
            </div>

            {/* Grid de Estatísticas e Controles */}
            <div className="p-4 bg-black/20">
                <div className="flex items-center gap-2 mb-3 px-1">
                    <Activity size={12} className="text-zinc-600" />
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-600">Painel de Alertas</span>
                </div>
                
                <div className="grid grid-cols-3 gap-2">
                    {monitorItems.map((item) => {
                        const isActive = p.alerts[item.key as keyof typeof p.alerts];
                        const Icon = item.icon;
                        return (
                            <button 
                                key={item.key} 
                                onClick={() => toggleAlert(p.id, item.key as keyof typeof p.alerts)}
                                className={`
                                    relative p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all duration-200 active:scale-95 group/btn
                                    ${isActive 
                                        ? 'bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.05)]' 
                                        : 'bg-zinc-900/50 border-white/5 opacity-60 hover:opacity-100 hover:bg-zinc-800'}
                                `}
                            >
                                <div className="flex w-full justify-between items-start">
                                    <Icon size={12} className={isActive ? 'text-emerald-400' : 'text-zinc-600'} />
                                    <span className={`font-mono font-black text-lg leading-none ${isActive ? 'text-white' : 'text-zinc-500'}`}>
                                        {item.val}
                                    </span>
                                </div>
                                <span className={`text-[9px] font-black uppercase tracking-tight w-full text-left truncate ${isActive ? 'text-emerald-400' : 'text-zinc-600'}`}>
                                    {item.label}
                                </span>
                                
                                {/* Indicador visual de status ON/OFF */}
                                <div className={`absolute top-2 right-2 w-1.5 h-1.5 rounded-full transition-colors ${isActive ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,1)]' : 'bg-zinc-800'}`} />
                            </button>
                        )
                    })}
                </div>
            </div>
        </div>
    );
  };

  const renderMonitor = () => (
    <div className="space-y-6 pb-32 safe-area-top animate-in fade-in duration-500">
      {/* Header Dashboard */}
      <div className="bg-zinc-950/80 backdrop-blur-xl p-6 border-b border-white/5 sticky top-0 z-30 shadow-2xl safe-area-top pt-safe-top">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
            <div className="flex items-center gap-6">
                <div className="flex flex-col">
                    <span className="text-[9px] text-zinc-500 font-black uppercase tracking-[0.2em] leading-none mb-1.5">Status do Sistema</span>
                    <div className="flex items-center gap-3">
                        <div className={`relative flex h-3 w-3 ${isMonitoring ? '' : 'opacity-50'}`}>
                          {isMonitoring && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
                          <span className={`relative inline-flex rounded-full h-3 w-3 ${isMonitoring ? 'bg-emerald-500' : 'bg-zinc-600'}`}></span>
                        </div>
                        <div className="flex flex-col">
                            <span className={`text-lg font-black tracking-tight leading-none ${isMonitoring ? 'text-white' : 'text-zinc-500'}`}>
                                {isMonitoring ? 'MONITORANDO' : 'PAUSADO'}
                            </span>
                            {isMonitoring && (
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-tighter">{lastSync}</span>
                                    <button onClick={forceUpdate} className="md:hidden text-emerald-500 active:scale-90 transition-transform">
                                        <RefreshCw size={10} />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                
                {isMonitoring && (
                    <div className="hidden md:flex flex-col border-l border-white/10 pl-6">
                        <div className="flex items-center gap-3 mb-1.5">
                            <span className="text-[9px] text-zinc-500 font-black uppercase tracking-[0.2em] leading-none">Próxima Varredura</span>
                            <button onClick={forceUpdate} className="text-emerald-500 hover:text-emerald-400 transition-colors">
                                <RefreshCw size={10} />
                            </button>
                        </div>
                        <div className="flex items-baseline gap-1">
                            <span className="text-lg font-mono text-emerald-400 font-black">{countdown}</span>
                            <span className="text-[10px] text-zinc-600 font-bold uppercase">segundos</span>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex gap-3">
                <button 
                    onClick={handleStartMonitoring} 
                    className={`
                        h-12 px-6 rounded-2xl font-black flex items-center gap-3 transition-all active:scale-95 shadow-lg uppercase text-xs tracking-widest ring-1 ring-inset
                        ${isMonitoring 
                            ? 'bg-red-500/10 text-red-500 ring-red-500/20 hover:bg-red-500/20' 
                            : 'bg-emerald-500 text-black ring-emerald-400 hover:bg-emerald-400 shadow-emerald-500/20'}
                    `}
                >
                    {isMonitoring ? (
                        <>
                            <Square size={16} fill="currentColor" />
                            <span className="hidden md:inline">Parar</span>
                        </>
                    ) : (
                        <>
                            <Play size={16} fill="currentColor" />
                            <span className="hidden md:inline">Iniciar</span>
                        </>
                    )}
                </button>
                <button 
                    onClick={() => setIsSettingsOpen(true)} 
                    className="h-12 w-12 flex items-center justify-center bg-zinc-900 text-zinc-400 border border-zinc-800 rounded-2xl hover:text-white hover:border-zinc-700 transition-colors active:scale-95"
                >
                    <Settings size={20} />
                </button>
            </div>
        </div>
      </div>

      <div className="px-6 max-w-7xl mx-auto">
      {players.length === 0 ? (
        <div className="text-center py-32 flex flex-col items-center gap-8 opacity-60 animate-in zoom-in-95 duration-500">
            <div className="w-24 h-24 bg-zinc-900 rounded-[2.5rem] flex items-center justify-center border border-zinc-800 shadow-2xl rotate-3">
                <Activity size={40} className="text-zinc-600" />
            </div>
            <div>
                <h3 className="text-xl font-black uppercase text-white tracking-tight mb-2">Radar Vazio</h3>
                <p className="text-sm text-zinc-500 font-medium max-w-[250px] mx-auto leading-relaxed">Adicione jogadores de partidas ao vivo para começar a receber alertas em tempo real.</p>
            </div>
            <button 
                onClick={() => { setActiveTab('search'); fetchGames(); }} 
                className="group bg-white text-black px-8 py-4 rounded-full text-xs font-black uppercase tracking-widest active:scale-95 hover:bg-zinc-200 transition-colors shadow-xl shadow-white/10 flex items-center gap-3"
            >
                <Plus size={16} className="group-hover:rotate-90 transition-transform duration-300"/>
                Adicionar Jogador
            </button>
        </div>
      ) : (
        <>
            <div className="flex justify-between items-end mb-8 px-2">
                <div>
                    <h2 className="text-3xl font-black uppercase text-white tracking-tighter mb-1">Jogadores</h2>
                    <div className="flex items-center gap-2 text-zinc-500">
                        <Activity size={14} className="text-emerald-500" />
                        <span className="text-xs font-bold uppercase tracking-widest">{players.length} Monitorados</span>
                    </div>
                </div>
                <button 
                    onClick={() => setIsClearConfirmOpen(true)} 
                    className="text-[10px] font-black uppercase text-red-400 bg-red-500/5 px-4 py-2 rounded-xl border border-red-500/10 flex items-center gap-2 hover:bg-red-500/10 transition-colors active:scale-95"
                >
                    <Trash2 size={14} /> Limpar Lista
                </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
               {players.map(p => renderPlayerCard(p))}
            </div>
        </>
      )}
      </div>
    </div>
  );

  const renderSearch = () => (
    <div className="pb-32 safe-area-top animate-in slide-in-from-bottom-4 duration-500">
        <div className="sticky top-0 bg-zinc-950/90 backdrop-blur-xl pt-safe-top pb-6 z-30 px-6 border-b border-white/5 mb-6 shadow-2xl">
             <div className="max-w-7xl mx-auto pt-4">
                 <h2 className="text-3xl font-black uppercase text-white tracking-tighter mb-4">Buscar Partida</h2>
                 <div className="flex gap-3">
                    <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center px-5 focus-within:border-emerald-500/50 focus-within:bg-zinc-900/80 transition-all shadow-inner ring-1 ring-white/5 group">
                        <Search size={20} className="text-zinc-600 group-focus-within:text-emerald-500 transition-colors" />
                        <input 
                            type="text" 
                            placeholder="Buscar times, campeonatos..." 
                            value={searchTerm} 
                            onChange={(e) => setSearchTerm(e.target.value)} 
                            className="bg-transparent border-none outline-none text-white p-4 w-full text-base font-bold placeholder:text-zinc-700" 
                        />
                    </div>
                    <button 
                        onClick={fetchGames} 
                        disabled={isLoadingGames} 
                        className="bg-emerald-500 text-black w-16 rounded-2xl font-black active:scale-90 flex items-center justify-center hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-900/20"
                    >
                        <RefreshCw size={24} className={isLoadingGames ? 'animate-spin' : ''} />
                    </button>
                 </div>
             </div>
        </div>
        <div className="px-6 max-w-7xl mx-auto">
        {!selectedGameId ? (
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {liveGames.length === 0 && !isLoadingGames && (
                    <div className="text-center py-32 flex flex-col items-center col-span-full opacity-50">
                        <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center mb-4">
                            <Search size={32} className="text-zinc-700" />
                        </div>
                        <p className="font-black text-zinc-500 uppercase text-xs tracking-[0.2em]">Nenhum jogo encontrado</p>
                    </div>
                )}
                {liveGames.filter(g => api.normalizeString(g.homeTeam.name).includes(api.normalizeString(searchTerm)) || api.normalizeString(g.awayTeam.name).includes(api.normalizeString(searchTerm))).map(game => (<GameCard key={game.id} game={game} onClick={selectGame} />))}
             </div>
        ) : (
            <div className="animate-in slide-in-from-right duration-500">
                <button 
                    onClick={() => setSelectedGameId(null)} 
                    className="mb-8 text-zinc-400 hover:text-white flex items-center gap-3 text-[10px] font-black uppercase tracking-widest bg-zinc-900 px-6 py-4 rounded-2xl border border-zinc-800 active:scale-95 transition-all hover:bg-zinc-800"
                >
                    <div className="bg-zinc-800 p-1 rounded-md"><X size={12}/></div>
                    Voltar para Lista
                </button>
                
                {isLoadingLineups ? (
                    <div className="text-center py-40 flex flex-col items-center">
                        <div className="relative w-16 h-16 mb-8">
                            <div className="absolute inset-0 border-4 border-zinc-800 rounded-full"></div>
                            <div className="absolute inset-0 border-4 border-emerald-500 rounded-full border-t-transparent animate-spin"></div>
                        </div>
                        <span className="font-black uppercase tracking-[0.3em] text-[10px] text-zinc-500">Carregando Escalações...</span>
                    </div>
                ) : lineups ? (
                    <div className="w-full max-w-full md:max-w-6xl mx-auto">
                        <SoccerField lineups={lineups} onSelectPlayer={addPlayer} />
                    </div>
                ) : (
                    <div className="text-center text-red-400 py-20 font-black uppercase text-xs tracking-widest bg-red-500/5 rounded-3xl border border-red-500/10">
                        ⚠️ Escalação indisponível
                    </div>
                )}
            </div>
        )}
        </div>
    </div>
  );

  return (
    <div className="min-h-screen font-sans bg-zinc-950 text-zinc-100 selection:bg-emerald-500/30 pb-24 md:pb-0">
        {/* Silent Audio for Background Keep-Alive */}
        <audio ref={audioRef} loop src="data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq" className="hidden" />
        
        {updateAvailable && (
            <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-200">
                <div className="bg-zinc-900 w-full max-w-sm rounded-[2.5rem] border border-emerald-500/30 p-8 text-center shadow-2xl ring-1 ring-emerald-500/20 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-emerald-600"></div>
                    <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6 mx-auto ring-1 ring-emerald-500/20">
                        <Download size={32} className="text-emerald-500" />
                    </div>
                    <h3 className="text-2xl font-black uppercase text-white mb-3 tracking-tight">Nova Atualização!</h3>
                    <p className="text-sm text-zinc-400 mb-8 leading-relaxed px-4">Uma nova versão do aplicativo está disponível com melhorias e correções.</p>
                    <div className="flex flex-col gap-3">
                        <button 
                            onClick={handleUpdate}
                            disabled={isUpdating}
                            className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase rounded-2xl transition-colors text-xs tracking-widest shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isUpdating ? `Atualizando... ${updateProgress}%` : 'Instalar Atualização'}
                        </button>
                        <button 
                            onClick={() => setUpdateAvailable(false)} 
                            disabled={isUpdating}
                            className="w-full py-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-black uppercase rounded-2xl transition-colors text-xs tracking-widest disabled:opacity-50"
                        >
                            Lembrar Mais Tarde
                        </button>
                    </div>
                </div>
            </div>
        )}

        <div className="fixed top-6 right-6 z-[100] pointer-events-none flex flex-col items-end gap-3">
            {toasts.map(t => (<div key={t.id} className="bg-emerald-500 text-black px-6 py-3 rounded-2xl shadow-2xl font-black text-xs uppercase tracking-wide border border-white/20 flex items-center gap-3 animate-in slide-in-from-right-10 fade-in duration-300"><Activity size={16} strokeWidth={3} />{t.msg}</div>))}
        </div>

        {isHelpOpen && renderHelpModal()}
        {selectedPlayerDetails && <PlayerDetailsModal player={selectedPlayerDetails} onClose={() => setSelectedPlayerDetails(null)} />}
        {isSettingsOpen && (
             <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-xl flex items-end md:items-center justify-center p-4 animate-in fade-in duration-300 safe-area-bottom">
                 <div className="bg-zinc-900/90 w-full max-w-sm rounded-[2.5rem] border border-white/10 p-8 relative shadow-2xl ring-1 ring-white/5">
                    <div className="flex justify-between items-center mb-8">
                        <h3 className="text-xl font-black uppercase text-white tracking-tight">Configurações</h3>
                        <button onClick={() => setIsSettingsOpen(false)} className="bg-white/5 p-2 rounded-full text-zinc-400 hover:text-white transition-colors"><X size={20}/></button>
                    </div>
                    <div className="space-y-6">
                        <div className="bg-black/20 p-5 rounded-3xl border border-white/5">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Intervalo de Varredura</span>
                                <span className="text-xl font-black text-emerald-400 font-mono">{intervalTime}s</span>
                            </div>
                            <div className="text-[9px] text-zinc-600 font-bold uppercase mb-4 tracking-tighter">
                                {intervalTime >= 60 ? '✅ Recomendado para Segundo Plano' : '⚠️ Pode ser pausado pelo sistema'}
                            </div>
                            <input type="range" min="10" max="120" step="5" value={intervalTime} onChange={(e) => setIntervalTime(Number(e.target.value))} className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500" />
                        </div>
                        <button onClick={() => setIsMuted(!isMuted)} className={`w-full p-5 rounded-3xl border flex items-center justify-between transition-all active:scale-[0.98] ${isMuted ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-zinc-800/50 border-white/5 text-zinc-300 hover:bg-zinc-800'}`}>
                            <div className="flex items-center gap-4">
                                <div className={`p-3 rounded-2xl ${isMuted ? 'bg-red-500/20' : 'bg-zinc-700/50'}`}>{isMuted ? <VolumeX size={20}/> : <Volume2 size={20}/>}</div>
                                <div className="text-left">
                                    <div className="text-sm font-bold uppercase tracking-wide">Sons de Alerta</div>
                                    <div className="text-[10px] opacity-60 font-medium mt-0.5">{isMuted ? 'Desativado' : 'Ativado'}</div>
                                </div>
                            </div>
                            <div className={`w-12 h-7 rounded-full p-1 transition-colors ${isMuted ? 'bg-zinc-700' : 'bg-emerald-500'}`}>
                                <div className={`w-5 h-5 bg-white rounded-full shadow-md transition-transform ${isMuted ? 'translate-x-0' : 'translate-x-5'}`} />
                            </div>
                        </button>
                        <div className="grid grid-cols-2 gap-3">
                             <button onClick={testNotification} className="flex-1 p-4 rounded-2xl bg-zinc-800/50 border border-white/5 text-zinc-300 flex items-center justify-center gap-2 font-bold uppercase text-[10px] tracking-widest hover:bg-zinc-800 transition-colors"><Bell size={16}/> Testar</button>
                             <button onClick={() => setIsHelpOpen(true)} className="flex-1 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center gap-2 font-bold uppercase text-[10px] tracking-widest hover:bg-emerald-500/20 transition-colors"><BellOff size={16}/> Ajuda</button>
                        </div>
                    </div>
                 </div>
             </div>
        )}
        {isClearConfirmOpen && (
             <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-200">
                <div className="bg-zinc-900 w-full max-w-sm rounded-[2.5rem] border border-zinc-800 p-8 text-center shadow-2xl">
                    <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6 mx-auto ring-1 ring-red-500/20">
                        <Trash2 size={32} className="text-red-500" />
                    </div>
                    <h3 className="text-2xl font-black uppercase text-white mb-3 tracking-tight">Limpar Radar?</h3>
                    <p className="text-sm text-zinc-400 mb-8 leading-relaxed px-4">Isso removerá todos os jogadores da sua lista de monitoramento atual.</p>
                    <div className="flex gap-3">
                        <button onClick={() => setIsClearConfirmOpen(false)} className="flex-1 py-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-black uppercase rounded-2xl transition-colors text-xs tracking-widest">Cancelar</button>
                        <button onClick={() => { setIsMonitoring(false); setPlayers([]); setIsClearConfirmOpen(false); }} className="flex-1 py-4 bg-red-500 hover:bg-red-600 text-white font-black uppercase rounded-2xl transition-colors text-xs tracking-widest shadow-lg shadow-red-900/20">Limpar Tudo</button>
                    </div>
                </div>
             </div>
        )}

        <div className="w-full max-w-7xl mx-auto min-h-screen relative bg-zinc-950 md:border-x md:border-zinc-800/50 shadow-2xl">
            <main className="min-h-screen pb-safe-bottom">
                {activeTab === 'monitor' && renderMonitor()}
                {activeTab === 'search' && renderSearch()}
                {activeTab === 'logs' && (
                    <div className="pb-32 px-6 pt-24 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-4">
                                <h2 className="font-black text-3xl uppercase text-white tracking-tighter">Live Log</h2>
                                {logs.length > 0 && (
                                    <button 
                                        onClick={() => { setLogs([]); addToast('Logs limpos', 'success'); }} 
                                        className="p-2 bg-zinc-800 rounded-xl text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors active:scale-95" 
                                        title="Limpar Logs"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                )}
                            </div>
                            <span className="text-xs font-bold text-zinc-500 bg-zinc-900 px-3 py-1 rounded-full border border-zinc-800">{logs.length} Eventos</span>
                        </div>
                        <div className="space-y-3">
                            {logs.map(log => (
                                <div key={log.id} className={`p-4 rounded-2xl border flex items-start gap-3 transition-all hover:scale-[1.01] ${log.type === 'success' ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-100' : 'bg-zinc-900/50 border-zinc-800 text-zinc-400'}`}>
                                    <div className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${log.type === 'success' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-zinc-600'}`} />
                                    <div className="flex-1">
                                        <div className="text-[10px] font-mono opacity-50 mb-1 tracking-wider">{log.time}</div>
                                        <div className="text-sm font-medium leading-snug">{log.message}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </main>
            
            {/* Floating Navigation Bar */}
            <nav className="fixed bottom-8 left-0 right-0 z-50 safe-area-bottom pointer-events-none flex justify-center px-6">
                <div className="bg-zinc-900/80 backdrop-blur-2xl border border-white/10 p-2 rounded-[2.5rem] shadow-2xl shadow-black/50 flex justify-between w-full max-w-[360px] pointer-events-auto ring-1 ring-white/5">
                    {['monitor', 'search', 'logs'].map((id) => (
                        <button 
                            key={id} 
                            onClick={() => setActiveTab(id as any)} 
                            className={`flex items-center justify-center gap-2 py-4 px-6 rounded-[2rem] transition-all duration-300 relative overflow-hidden group ${activeTab === id ? 'flex-[1.5]' : 'flex-1'}`}
                        >
                            {activeTab === id && <div className="absolute inset-0 bg-emerald-500 opacity-10" />}
                            <div className={`relative z-10 transition-colors duration-300 ${activeTab === id ? 'text-emerald-400' : 'text-zinc-500 group-hover:text-zinc-300'}`}>
                                {id === 'monitor' ? <LayoutDashboard size={24} strokeWidth={activeTab === id ? 2.5 : 2} /> : 
                                 id === 'search' ? <Search size={24} strokeWidth={activeTab === id ? 2.5 : 2} /> : 
                                 <List size={24} strokeWidth={activeTab === id ? 2.5 : 2} />}
                            </div>
                            {activeTab === id && (
                                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 animate-in fade-in slide-in-from-left-2 duration-300 whitespace-nowrap">
                                    {id === 'monitor' ? 'Radar' : id === 'search' ? 'Buscar' : 'Logs'}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </nav>
        </div>

    </div>
  );
};

export default App;
