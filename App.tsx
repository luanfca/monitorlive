
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Square, Activity, Search, List, Volume2, VolumeX, Trash2, Settings, Plus, AlertCircle, RefreshCw, Bell, BellOff, Info, ExternalLink, ShieldAlert, X, Lock, Menu, LayoutDashboard, Download, Target, CheckCircle2, AlertTriangle, MoreVertical, Footprints, Shield, Flag, BadgeAlert, LogOut } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
import { App as CapApp } from '@capacitor/app';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { Preferences } from '@capacitor/preferences';
import { Game, MonitoredPlayer, LogEntry, PlayerStats, GameLineups, GamePlayer } from './types';
import * as api from './services/sofaService';
import { getMessaging, getToken, onMessage, deleteToken } from 'firebase/messaging';
import { auth, db } from './services/firebase';
import { onAuthStateChanged, signInAnonymously, GoogleAuthProvider, signInWithPopup, signOut, signInWithCredential } from 'firebase/auth';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { collection, onSnapshot, query, where, orderBy, limit, doc, setDoc, deleteDoc, getDocs } from 'firebase/firestore';
import SoccerField from './components/SoccerField';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
}
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

const triggerSwoosh = () => {
  try {
    const ctx = initAudio();
    if (ctx) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        // Swoosh: sweep de alta para baixa frequência
        osc.frequency.setValueAtTime(1000, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.8);
        osc.type = 'sine';
        
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
        
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.8);
    }
  } catch (e) {
    console.error('Swoosh trigger error', e);
  }
};

interface GameCardProps {
  game: Game;
  onClick: (id: number) => void;
  isMonitored: boolean;
  onToggleMonitor: (game: Game) => void;
}

const GameCard = React.memo(({ game, onClick, isMonitored, onToggleMonitor }: GameCardProps) => {
  return (
    <div 
        onClick={() => onClick(game.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(game.id); }}
        className="w-full bg-[#1e1e1e] border border-white/5 p-4 rounded-2xl hover:border-blue-500/40 transition-all active:scale-[0.98] text-left group relative overflow-hidden flex flex-col h-full cursor-pointer"
    >
        <button 
            onClick={(e) => { e.stopPropagation(); onToggleMonitor(game); }}
            className={`absolute top-3 right-3 z-20 p-2 rounded-full transition-colors ${isMonitored ? 'bg-blue-600' : 'bg-[#2a2a2a] hover:bg-[#333]'}`}
        >
            <Bell size={16} className={isMonitored ? 'text-white' : 'text-zinc-400'} />
        </button>
        <div className="flex-1 z-10 relative w-full">
            <div className="flex justify-between items-start mb-3">
                <span className="text-[11px] text-zinc-400 font-medium px-2 py-1 rounded-md bg-[#2a2a2a] max-w-[70%] truncate">{game.tournament}</span>
                <div className="flex items-center gap-1.5 bg-blue-500/10 px-2 py-1 rounded-md">
                    {(typeof game.minute === 'number' || game.status === 'Live') && (
                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                    )}
                    <span className="text-[11px] text-blue-400 font-medium">
                        {(() => {
                            const isHalftime = game.statusCode === 31 || game.status === 'Halftime' || game.status === 'HT' || game.status === 'Intervalo' || game.status === 'Break' || game.status === 'Half time';
                            const isEnded = game.statusCode === 100 || game.statusCode === 106 || game.statusCode === 120 || game.status === 'Ended' || game.status === 'FT' || game.status === 'Fim' || game.status === 'Full time';
                            const statusText = isHalftime ? 'Intervalo' : isEnded ? 'Fim' : '';
                            
                            if (typeof game.minute === 'number') {
                                return statusText ? `${game.minute}' - ${statusText}` : `${game.minute}'`;
                            }
                            return statusText || game.status;
                        })()}
                    </span>
                </div>
            </div>
            
            <div className="flex items-center justify-between gap-4">
                <div className="flex-1 space-y-2 w-full">
                    <div className="flex justify-between items-center">
                        <div className="font-medium text-zinc-100 truncate text-sm max-w-[80%]">{game.homeTeam.name}</div>
                        <div className="font-bold text-lg text-white">{game.homeTeam.score ?? 0}</div>
                    </div>
                    <div className="flex justify-between items-center">
                        <div className="font-medium text-zinc-100 truncate text-sm max-w-[80%]">{game.awayTeam.name}</div>
                        <div className="font-bold text-lg text-white">{game.awayTeam.score ?? 0}</div>
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.game.id === nextProps.game.id &&
    prevProps.game.minute === nextProps.game.minute &&
    prevProps.game.status === nextProps.game.status &&
    prevProps.game.homeTeam.score === nextProps.game.homeTeam.score &&
    prevProps.game.awayTeam.score === nextProps.game.awayTeam.score &&
    prevProps.isMonitored === nextProps.isMonitored
  );
});

const API_URL = import.meta.env.VITE_API_URL || 'https://live-match-pro-api.onrender.com';

const App: React.FC = () => {
  let messaging: any = null;
  try {
    if (!Capacitor.isNativePlatform()) {
      messaging = getMessaging();
    }
  } catch (e) {
    console.warn('Firebase messaging not supported', e);
  }

  // --- Hooks (devem ser chamados incondicionalmente) ---
  const [fcmToken, setFcmToken] = useState<string | null>(null);

  const [toasts, setToasts] = useState<{id: string, msg: string, type: string}[]>([]);
  const addToast = useCallback((msg: string, type: string) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, {id, msg, type}]);
    setTimeout(() => { setToasts(prev => prev.filter(t => t.id !== id)); }, 4000);
  }, []);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    const entry: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      time: new Date().toLocaleTimeString('pt-BR'),
      message,
      type
    };
    setLogs(prev => [entry, ...prev].slice(0, 50));
  }, []);

  // 1. Efeitos de inicialização
  useEffect(() => {
      const requestPermission = async () => {
          if (Capacitor.isNativePlatform()) {
              try {
                  let permStatus = await PushNotifications.checkPermissions();
                  if (permStatus.receive === 'prompt') {
                      permStatus = await PushNotifications.requestPermissions();
                  }
                  if (permStatus.receive !== 'granted') {
                      throw new Error('User denied permissions!');
                  }
                  await PushNotifications.register();

                  PushNotifications.addListener('registration', (token) => {
                      console.log('Push registration success, token: ' + token.value);
                      setFcmToken(token.value);
                  });

                  PushNotifications.addListener('registrationError', (error: any) => {
                      console.error('Error on registration: ' + JSON.stringify(error));
                  });

                  PushNotifications.addListener('pushNotificationReceived', (notification) => {
                      console.log('Push received: ', notification);
                      addToast(notification.title + ': ' + notification.body, 'info');
                      addLog('Notificação recebida: ' + notification.body, 'info');
                  });

                  PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
                      console.log('Push action performed: ', notification);
                  });
              } catch (e) {
                  console.error('Erro ao configurar Push Nativo:', e);
              }
          } else {
              try {
                  if ('serviceWorker' in navigator) {
                      await navigator.serviceWorker.register('/firebase-messaging-sw.js');
                  }
                  const permission = await Notification.requestPermission();
                  if (permission === 'granted') {
                      const vapidKey = (import.meta as any).env ? (import.meta as any).env.VITE_VAPID_KEY : process.env.VITE_VAPID_KEY;
                      const token = await getToken(messaging, { vapidKey });
                      console.log('FCM Token:', token);
                      setFcmToken(token);
                  }
              } catch (e) {
                  console.error('Erro ao solicitar permissão de notificação (Web):', e);
              }
          }
      };
      requestPermission();
  }, []);

  // 2. Estados
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [latestCommitUrl, setLatestCommitUrl] = useState('');
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setIsAuthReady(true);
      } else {
        try {
          await signInAnonymously(auth);
        } catch (error) {
          console.error("Erro no login anônimo", error);
          setIsAuthReady(true);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const [updatedPlayersIds, setUpdatedPlayersIds] = useState<Set<number>>(new Set());
  const [liveGames, setLiveGames] = useState<Game[]>([]);
  const [monitoredGames, setMonitoredGames] = useState<Game[]>(() => {
      try {
          const saved = localStorage.getItem('monitored_games');
          return saved ? JSON.parse(saved) : [];
      } catch (e) { return []; }
  });

  const [players, setPlayers] = useState<MonitoredPlayer[]>([]);
  const playersRef = useRef<MonitoredPlayer[]>(players);



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
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  useEffect(() => {
    if (user) {
      const q = query(collection(db, `users/${user.uid}/monitoredPlayers`));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const loadedPlayers = snapshot.docs.map(doc => doc.data() as MonitoredPlayer);
        setPlayers(loadedPlayers);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/monitoredPlayers`);
      });
      return () => unsubscribe();
    } else {
      setPlayers([]);
    }
  }, [user]);

  useEffect(() => {
    if (fcmToken) {
      fetch(`${API_URL}/api/update-monitor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            token: fcmToken, 
            players: isMonitoring ? players : [],
            userId: user?.uid 
        })
      }).catch(e => console.error('Erro ao sincronizar com backend:', e));
    }
  }, [fcmToken, players, isMonitoring, user]);

  // 3. Efeitos de autenticação e outros
  useEffect(() => {
    setIsAuthReady(true);
  }, []);

  useEffect(() => {
      playersRef.current = players;
  }, [players]);

  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const response = await fetch('https://api.github.com/repos/luanfca/MonitorLive/commits');
        const data = await response.json();
        const latestCommit = data[0]?.sha;
        const currentCommit = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

        if (latestCommit && currentCommit && currentCommit !== 'dev' && latestCommit !== currentCommit) {
          setLatestCommitUrl('https://github.com/luanfca/MonitorLive/releases/download/latest/update.zip');
          setUpdateAvailable(true);
        }
      } catch (error) {
        console.error('Failed to check for updates', error);
      }
    };
    
    if (typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()) {
        CapacitorUpdater.notifyAppReady();
        checkUpdate();
    }
  }, []);

  // --- Renderização condicional (após todos os hooks) ---

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


  // Listener para notificações em tempo real do Firestore
  useEffect(() => {
    if (!isAuthReady) return;

    const notificationsRef = collection(db, 'notifications');
    const q = query(notificationsRef, orderBy('timestamp', 'desc'), limit(5));

    let isInitialSnapshot = true;
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (isInitialSnapshot) {
        isInitialSnapshot = false;
        return;
      }
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          addLog(data.message, 'info');
          triggerAlert();
          if (Capacitor.isNativePlatform()) {
            LocalNotifications.schedule({
              notifications: [{
                title: 'Alerta de Jogo',
                body: data.message,
                id: Math.floor(Math.random() * 100000),
              }]
            });
          }
        }
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'notifications');
    });

    return () => unsubscribe();
  }, [isAuthReady, addLog]);
  const isWorkerUpdate = useRef(false);

  useEffect(() => {
      addLog('Iniciando LiveMatch v2.1 (Anti-Bloqueio Ativado)', 'info');
      if (Capacitor.isNativePlatform()) {
          addLog('Modo Nativo Detectado: Usando CapacitorHttp com Rotação de UA', 'success');
      } else {
          addLog('Modo Web: Usando Proxy Local', 'info');
      }
  }, []);

  const sendNotification = useCallback(async (title: string, body: string) => {
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
  }, [notifPermission]);


  // Handle updates from worker or main thread
  const handleWorkerResult = useCallback((updates: any[], alerts: { message: string, type: 'addition' | 'removal' | 'substitution' }[], newMonitoredGames?: Game[]) => {
        if (newMonitoredGames) {
            setMonitoredGames(newMonitoredGames);
        }
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setLastSync(`Atualizado hoje às ${timeStr}`);
        setCountdown(intervalTime); // Reset visual countdown on actual sync
        
        // Handle Alerts
        if (alerts && alerts.length > 0) {
            const firstAlert = alerts[0];
            const isRemoval = firstAlert.type === 'removal';
            const isSubstitution = firstAlert.type === 'substitution';
            
            // Som de adição: 1200Hz, 500ms
            // Som de remoção: 400Hz, 800ms
            // Som de substituição (swoosh): sweep de 1000Hz para 100Hz, 800ms
            if (!isMuted) {
                if (isSubstitution) {
                    triggerSwoosh();
                } else {
                    triggerAlert(isRemoval ? 400 : 1200, isRemoval ? 800 : 500);
                }
            }
            
            sendNotification('ALERTA DE JOGO ⚽', firstAlert.message);
            alerts.forEach((alert: { message: string, type: string }) => addLog(alert.message, alert.type === 'removal' ? 'error' : (alert.type === 'substitution' ? 'info' : 'success')));
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
                        
                        // If we have alerts for THIS player, update lastAlertedStats to current stats
                        // This ensures the next check uses these stats as the baseline
                        const hasAlert = update.hasAlert;
                        const newLastAlertedStats = hasAlert ? update.stats : p.lastAlertedStats;

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
  }, [intervalTime, sendNotification, isMuted, addLog]);

  // Foreground Polling Logic (Replaces Worker and Native Check)
  const isCheckingRef = useRef(false);
  
  const runForegroundCheck = useCallback(async () => {
      // Use ref directly to always get latest state without closure issues
      const currentPlayers = playersRef.current;
      
      // CRITICAL: Check isMonitoring AGAIN inside the callback to prevent race conditions
      // where a check starts just as monitoring is stopped.
      if (!isMonitoring || currentPlayers.length === 0 || isCheckingRef.current) return;
      isCheckingRef.current = true;
      setCountdown(intervalTime); // Reset countdown when check starts

      const updates: any[] = [];
      const alerts: { message: string, type: 'addition' | 'removal' | 'substitution' }[] = [];

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
                          alerts.push({ message: `🎯 ${player.name}: CHUTE NO ALVO! (Total: ${stats.shotsOnTarget})`, type: 'addition' });
                      }
                      if (player.alerts.tackles && stats.tackles > prev.tackles) {
                          alerts.push({ message: `🛡️ ${player.name}: NOVO DESARME! (Total: ${stats.tackles})`, type: 'addition' });
                      }
                      if (player.alerts.yellow && stats.yellowCards > prev.yellowCards) {
                          alerts.push({ message: `🟨 ${player.name}: CARTÃO AMARELO! (Total: ${stats.yellowCards})`, type: 'addition' });
                      }
                      if (player.alerts.fouls && stats.fouls > prev.fouls) {
                          alerts.push({ message: `⚠️ ${player.name}: COMETEU FALTA! (Total: ${stats.fouls})`, type: 'addition' });
                      }
                      if (player.alerts.foulsDrawn && stats.foulsDrawn > prev.foulsDrawn) {
                          alerts.push({ message: `🤕 ${player.name}: SOFREU FALTA! (Total: ${stats.foulsDrawn})`, type: 'addition' });
                      }
                      if (player.alerts.shots && stats.shotsTotal > prev.shotsTotal) {
                          const isTarget = stats.shotsOnTarget > prev.shotsOnTarget;
                          if (!isTarget || !player.alerts.shotsOn) {
                               alerts.push({ message: `👟 ${player.name}: CHUTOU! (Total: ${stats.shotsTotal})`, type: 'addition' });
                          }
                      }
                      if (player.alerts.subOut && !prev.isSubstitute && stats.isSubstitute) {
                          alerts.push({ message: `🔄 ${player.name}: SUBSTITUÍDO!`, type: 'addition' });
                      }
                      // Removal checks
                      if (player.alerts.tackles && stats.tackles < prev.tackles) {
                          alerts.push({ message: `❌ ${player.name}: DESARME REMOVIDO! (Total: ${stats.tackles})`, type: 'removal' });
                      }
                      if (player.alerts.shotsOn && stats.shotsOnTarget < prev.shotsOnTarget) {
                          alerts.push({ message: `❌ ${player.name}: CHUTE NO ALVO REMOVIDO! (Total: ${stats.shotsOnTarget})`, type: 'removal' });
                      }
                  }
                  updates.push({ id: player.id, stats });
              }
          } catch (e) {
              console.error('Foreground fetch error', e);
          }
      }

      // FINAL CHECK: If monitoring was stopped while we were fetching, DO NOT ALERT.
      if (!isMonitoring) {
          isCheckingRef.current = false;
          return;
      }

      handleWorkerResult(updates, alerts);
      isCheckingRef.current = false;
  }, [isMonitoring, handleWorkerResult, intervalTime, addLog]);

  // Force update when returning to app
  const forceUpdate = useCallback(async () => {
    if (isMonitoring && document.visibilityState === 'visible') {
        runForegroundCheck();
        addLog('Atualização manual...', 'info');
    }
  }, [isMonitoring, runForegroundCheck]);

  useEffect(() => {
      let timeoutId: any;
      let isActive = true;
      
      const loop = async () => {
          if (!isActive || !isMonitoring || document.visibilityState !== 'visible') return;
          await runForegroundCheck();
          if (isActive && isMonitoring && document.visibilityState === 'visible') {
              timeoutId = setTimeout(loop, intervalTime * 1000);
          }
      };

      const handleVisibilityChange = () => {
          if (document.visibilityState === 'visible' && isMonitoring) {
              // Restart loop when returning to foreground
              clearTimeout(timeoutId);
              loop();
          } else {
              // Pause loop when going to background
              clearTimeout(timeoutId);
          }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      let appStateListener: any;
      if (Capacitor.isNativePlatform()) {
          CapApp.addListener('appStateChange', async ({ isActive }) => {
              if (isActive && isMonitoring) {
                  clearTimeout(timeoutId);
                  loop();
              } else {
                  clearTimeout(timeoutId);
              }
          }).then(listener => {
              appStateListener = listener;
              if (!isActive) {
                  listener.remove();
              }
          });
      }

      if (isMonitoring && document.visibilityState === 'visible') {
          loop();
      }
      
      return () => {
          isActive = false;
          clearTimeout(timeoutId);
          document.removeEventListener('visibilitychange', handleVisibilityChange);
          if (appStateListener && appStateListener.remove) appStateListener.remove();
      };
  }, [isMonitoring, intervalTime, runForegroundCheck]);

  // Worker logic removed - using runForegroundCheck for both Web and Native






  // Sync logic removed as we use refs directly in runForegroundCheck




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

  const handleSendTestNotification = async () => {
    if (!fcmToken) {
        addToast('Token FCM não disponível. Tentando gerar um novo...', 'info');
        try {
            if (!Capacitor.isNativePlatform() && 'Notification' in window && Notification.permission === 'granted') {
                const vapidKey = (import.meta as any).env ? (import.meta as any).env.VITE_VAPID_KEY : process.env.VITE_VAPID_KEY;
                const token = await getToken(messaging, { vapidKey });
                setFcmToken(token);
                addToast('Novo token gerado. Tente novamente.', 'success');
            }
        } catch (e) {
            console.error('Erro ao gerar novo token:', e);
            addToast('Erro ao gerar novo token', 'error');
        }
        return;
    }
    try {
        const response = await fetch(`${API_URL}/api/test-notification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: fcmToken })
        });
        if (response.ok) {
            addToast('Notificação de teste enviada!', 'success');
        } else if (response.status === 404) {
            addToast('Token expirado. Gerando um novo...', 'info');
            setFcmToken(null);
            try {
                if (!Capacitor.isNativePlatform()) {
                    await deleteToken(messaging);
                    const vapidKey = (import.meta as any).env ? (import.meta as any).env.VITE_VAPID_KEY : process.env.VITE_VAPID_KEY;
                    const token = await getToken(messaging, { vapidKey });
                    setFcmToken(token);
                    addToast('Novo token gerado. Tente novamente.', 'success');
                }
            } catch (e) {
                console.error('Erro ao renovar token:', e);
            }
        } else {
            addToast('Erro ao enviar notificação de teste', 'error');
        }
    } catch (e) {
        console.error('Erro ao enviar notificação de teste:', e);
        addToast('Erro ao enviar notificação de teste', 'error');
    }
  };

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
          const vapidPublicKey = (import.meta as any).env ? (import.meta as any).env.VITE_VAPID_KEY : process.env.VITE_VAPID_KEY;
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

  useEffect(() => { localStorage.setItem('is_monitoring', String(isMonitoring)); }, [isMonitoring]);
  useEffect(() => { 
    localStorage.setItem('interval_time', String(intervalTime)); 
  }, [intervalTime, isMonitoring]);
  useEffect(() => { localStorage.setItem('match_logs', JSON.stringify(logs)); }, [logs]);
  useEffect(() => {
    playersRef.current = players;
    localStorage.setItem('monitored_players', JSON.stringify(players));
    
    // Reset flag
    isWorkerUpdate.current = false;

    // Auto-stop if list is empty
    if (players.length === 0 && isMonitoring) {
        setIsMonitoring(false);
        addLog('Monitoramento parado: Lista vazia', 'info');
    }
  }, [players, isMonitoring]);

  useEffect(() => {
    if ('Notification' in window && !Capacitor.isNativePlatform()) {
      setNotifPermission(Notification.permission);
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

  const handleGoogleLogin = async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        const result = await FirebaseAuthentication.signInWithGoogle();
        if (result.credential?.idToken) {
          const credential = GoogleAuthProvider.credential(result.credential.idToken);
          await signInWithCredential(auth, credential);
        } else {
          throw new Error('No ID token returned from Google Sign-In');
        }
      } else {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
      }
      addToast('Login realizado com sucesso!', 'success');
      setIsSettingsOpen(false);
    } catch (error) {
      console.error('Erro no login com Google:', error);
      addToast('Erro ao fazer login', 'error');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setPlayers([]);
      addToast('Desconectado com sucesso', 'success');
      setIsSettingsOpen(false);
    } catch (error) {
      console.error('Erro ao sair:', error);
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
      }
  };

  // Removed monitorCycle as it is now handled by the worker


  const zeroCountRef = useRef(0);

  useEffect(() => {
    if (isMonitoring) {
        setCountdown(intervalTime);
        
        countdownRef.current = setInterval(() => {
            if (document.visibilityState !== 'visible') return; // Pause countdown in background
            setCountdown(prev => {
                if (prev <= 0) {
                    return 0;
                }
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

  const toggleMonitor = async (game: Game) => {
      setMonitoredGames(prev => {
          const exists = prev.find(g => g.id === game.id);
          if (exists) {
              return prev.filter(g => g.id !== game.id);
          } else {
              // Chama o servidor para monitorar
              fetch('/api/monitor-game', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ game })
              }).catch(console.error);
              return [...prev, game];
          }
      });
  };

  const selectGame = async (gameId: number) => {
    if (selectedGameId === gameId) { setSelectedGameId(null); setLineups(null); return; }
    setSelectedGameId(gameId);
    setIsLoadingLineups(true);
    const data = await api.getGamePlayers(gameId);
    setLineups(data);
    setIsLoadingLineups(false);
  };

  const addPlayer = async (gamePlayer: GamePlayer) => {
    if (!user) {
        addToast('Faça login para adicionar jogadores', 'error');
        return;
    }
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
    
    try {
        await setDoc(doc(db, `users/${user.uid}/monitoredPlayers`, newPlayer.id.toString()), newPlayer);
        addLog(`${gamePlayer.name} monitorado`, 'success');
        addToast(`${gamePlayer.name} adicionado!`, 'success');
    } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/monitoredPlayers/${newPlayer.id}`);
    }
  };

  const renderHelpModal = () => (
    <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
        <div className="bg-[#121212] border border-white/10 w-full max-w-sm rounded-[2rem] p-6 relative shadow-2xl overflow-y-auto max-h-[90vh]">
            <button onClick={() => setIsHelpOpen(false)} className="absolute top-4 right-4 p-2 bg-[#1e1e1e] hover:bg-[#2a2a2a] rounded-full text-zinc-400 hover:text-white transition-colors">
                <X size={20} />
            </button>
            <div className="flex flex-col items-center text-center gap-4 mt-2">
                <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-1 border border-blue-500/20"><Bell size={28} className="text-blue-500" /></div>
                <div>
                    <h3 className="text-xl font-bold text-white tracking-tight mb-2">Ajuda & Configuração</h3>
                    <p className="text-xs text-zinc-400 leading-relaxed font-medium mb-4 px-2">Configure seu dispositivo para garantir que o monitoramento funcione em segundo plano.</p>
                </div>
                
                <div className="bg-[#1e1e1e] p-5 rounded-2xl text-left w-full border border-white/5 space-y-4">
                    <div className="flex gap-4">
                        <div className="w-7 h-7 bg-blue-500/10 rounded-lg flex items-center justify-center text-xs font-bold text-blue-400 shrink-0 border border-blue-500/20">1</div>
                        <div className="space-y-1">
                            <p className="text-xs text-zinc-300 font-bold">Bateria & Otimização</p>
                            <p className="text-[10px] text-zinc-500">O sistema pode pausar apps em segundo plano. Para evitar isso:</p>
                            <div className="bg-[#2a2a2a] p-3 rounded-xl border border-white/5 mt-2">
                                <p className="text-[10px] text-zinc-400 leading-relaxed">
                                    1. Abra <strong>Configurações</strong><br/>
                                    2. Vá em <strong>Aplicativos</strong> &gt; <strong>LiveMatch Pro</strong><br/>
                                    3. Toque em <strong>Bateria</strong><br/>
                                    4. Selecione <strong>"Sem Restrições"</strong>
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <div className="w-7 h-7 bg-blue-500/10 rounded-lg flex items-center justify-center text-xs font-bold text-blue-400 shrink-0 border border-blue-500/20">2</div>
                        <div className="space-y-1">
                            <p className="text-xs text-zinc-300 font-bold">Notificações</p>
                            <p className="text-[10px] text-zinc-500">Certifique-se de que as notificações estão permitidas para o aplicativo nas configurações do sistema.</p>
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
                    }} className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-colors text-sm shadow-lg">Solicitar Permissões</button>
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
                <div className="px-2 py-1 bg-[#1e1e1e]/80 backdrop-blur-md rounded-lg border border-white/10 text-[10px] font-medium text-zinc-400">
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
            <div className="bg-[#121212] w-full max-w-md rounded-[2rem] border border-white/10 p-6 relative shadow-2xl overflow-y-auto max-h-[90vh]">
                <div className="flex justify-between items-start mb-8">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 bg-[#1e1e1e] rounded-2xl border border-white/5 overflow-hidden shadow-lg shrink-0">
                            <SofaImage playerId={player.sofaId} alt={player.name} className="w-full h-full object-cover" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white tracking-tight leading-none mb-2">{player.name}</h3>
                            <div className="flex items-center gap-2">
                                <span className={`px-2 py-1 rounded-lg text-xs font-bold shadow-sm ${
                                    !s.rating ? 'bg-[#1e1e1e] text-zinc-400' :
                                    s.rating >= 8.0 ? 'bg-blue-600 text-white' :
                                    s.rating >= 7.5 ? 'bg-blue-500 text-white' :
                                    s.rating >= 7.0 ? 'bg-emerald-500 text-white' :
                                    s.rating >= 6.5 ? 'bg-yellow-500 text-black' :
                                    s.rating >= 6.0 ? 'bg-orange-500 text-white' : 'bg-red-500 text-white'
                                }`}>
                                    {s.rating.toFixed(1)} <span className="opacity-70 ml-1 text-[10px] font-medium">RATING</span>
                                </span>
                                <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider bg-[#1e1e1e] px-2 py-1 rounded-lg border border-white/5">{s.minutes}' JOGADOS</span>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="bg-[#1e1e1e] p-2 rounded-full text-zinc-400 hover:text-white hover:bg-[#2a2a2a] transition-colors shrink-0"><X size={20}/></button>
                </div>

                <div className="space-y-6">
                    {/* Ataque */}
                    <div className="animate-in slide-in-from-bottom-2 duration-300 delay-75">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                                <Target size={14} className="text-blue-400"/>
                            </div>
                            <h4 className="text-xs font-bold uppercase text-zinc-300 tracking-wider">Ataque</h4>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="bg-[#1e1e1e] p-3 rounded-xl border border-white/5 text-center transition-colors">
                                <div className="text-xl font-bold text-white mb-0.5">{s.goals}</div>
                                <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Gols</div>
                            </div>
                            <div className="bg-[#1e1e1e] p-3 rounded-xl border border-white/5 text-center transition-colors">
                                <div className="text-xl font-bold text-white mb-0.5">{s.assists}</div>
                                <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Assists</div>
                            </div>
                            <div className="bg-[#1e1e1e] p-3 rounded-xl border border-white/5 text-center transition-colors col-span-2">
                                <div className="text-xl font-bold text-white mb-0.5">{s.shotsOnTarget}<span className="text-zinc-600 text-sm mx-0.5">/</span>{s.shotsTotal}</div>
                                <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Chutes (Alvo / Total)</div>
                            </div>
                        </div>
                    </div>

                    {/* Construção */}
                    <div className="animate-in slide-in-from-bottom-2 duration-300 delay-150">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                                <Activity size={14} className="text-emerald-400"/>
                            </div>
                            <h4 className="text-xs font-bold uppercase text-zinc-300 tracking-wider">Construção</h4>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="bg-[#1e1e1e] p-3 rounded-xl border border-white/5 text-center transition-colors">
                                <div className="text-xl font-bold text-white mb-0.5">{s.keyPasses}</div>
                                <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Passes Decisivos</div>
                            </div>
                            <div className="bg-[#1e1e1e] p-3 rounded-xl border border-white/5 text-center transition-colors">
                                <div className="text-xl font-bold text-white mb-0.5">{s.totalPasses}</div>
                                <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Passes Totais</div>
                            </div>
                            <div className="bg-[#1e1e1e] p-3 rounded-xl border border-white/5 text-center transition-colors col-span-2">
                                <div className="text-xl font-bold text-white mb-0.5">{s.foulsDrawn}</div>
                                <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Faltas Sofridas</div>
                            </div>
                        </div>
                    </div>

                    {/* Defesa */}
                    <div className="animate-in slide-in-from-bottom-2 duration-300 delay-200">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-7 h-7 rounded-lg bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
                                <Shield size={14} className="text-orange-400"/>
                            </div>
                            <h4 className="text-xs font-bold uppercase text-zinc-300 tracking-wider">Defesa</h4>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="bg-[#1e1e1e] p-3 rounded-xl border border-white/5 text-center transition-colors">
                                <div className="text-xl font-bold text-white mb-0.5">{s.tackles}</div>
                                <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Desarmes</div>
                            </div>
                            <div className="bg-[#1e1e1e] p-3 rounded-xl border border-white/5 text-center transition-colors">
                                <div className="text-xl font-bold text-white mb-0.5">{s.interceptions}</div>
                                <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Interceptações</div>
                            </div>
                            <div className="bg-[#1e1e1e] p-3 rounded-xl border border-white/5 text-center transition-colors col-span-2">
                                <div className="text-xl font-bold text-white mb-0.5">{s.duelsWon}</div>
                                <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Duelos Ganhos</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

  const removePlayer = async (id: number) => {
    if (!user) return;
    try {
        await deleteDoc(doc(db, `users/${user.uid}/monitoredPlayers`, id.toString()));
    } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/monitoredPlayers/${id}`);
    }
  };
  const toggleAlert = async (playerId: number, key: keyof MonitoredPlayer['alerts']) => {
    if (!user) return;
    const player = players.find(p => p.id === playerId);
    if (!player) return;
    
    const updatedPlayer = { ...player, alerts: { ...player.alerts, [key]: !player.alerts[key] } };
    try {
        await setDoc(doc(db, `users/${user.uid}/monitoredPlayers`, playerId.toString()), updatedPlayer);
    } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/monitoredPlayers/${playerId}`);
    }
  };

    const renderPlayerCard = (p: MonitoredPlayer) => {
        const s = p.lastStats || { 
            tackles: 0, fouls: 0, foulsDrawn: 0, shotsTotal: 0, shotsOnTarget: 0, yellowCards: 0, redCards: 0, rating: 0,
            goals: 0, assists: 0, keyPasses: 0, totalPasses: 0, interceptions: 0, duelsWon: 0, minutes: 0,
            isSubstitute: false, displayName: p.name, playerId: p.sofaId
        };
        const isUpdated = updatedPlayersIds.has(p.id);
        
        const game = monitoredGames.find(g => g.id === p.eventId) || liveGames.find(g => g.id === p.eventId);
        const isHalftime = game?.statusCode === 31 || game?.status === 'Halftime' || game?.status === 'HT' || game?.status === 'Intervalo' || game?.status === 'Break' || game?.status === 'Half time';
        const isEnded = game?.statusCode === 100 || game?.statusCode === 106 || game?.statusCode === 120 || game?.status === 'Ended' || game?.status === 'FT' || game?.status === 'Fim' || game?.status === 'Full time';
        const gameStatusText = isHalftime ? 'Intervalo' : isEnded ? 'Fim' : 'Ao Vivo';
        const isLive = !isHalftime && !isEnded;
        
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
        <div key={p.id} className={`bg-[#1e1e1e] rounded-2xl border transition-all duration-500 overflow-hidden relative shadow-lg group ${isUpdated ? 'border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.2)] scale-[1.01]' : 'border-white/5 hover:border-white/10'}`}>
            {isUpdated && <div className="absolute inset-0 bg-blue-500/5 animate-pulse pointer-events-none z-0" />}
            
            {/* Header: Imagem, Nome e Ações */}
            <div className="p-4 flex gap-4 items-center border-b border-white/5 bg-[#1e1e1e]">
                <div className="relative">
                    <div className="w-14 h-14 bg-[#2a2a2a] rounded-full border border-white/10 overflow-hidden relative z-10 shrink-0">
                        <SofaImage playerId={p.sofaId} alt={p.name} className="w-full h-full object-cover" />
                    </div>
                    {/* Indicador de Rating */}
                    {s.rating > 0 && (
                        <div className={`absolute -bottom-1 -right-1 z-20 px-1.5 py-0.5 rounded-md border border-black/50 shadow-md text-[10px] font-bold ${
                            !s.rating ? 'bg-[#1e1e1e] text-zinc-400' :
                            s.rating >= 8.0 ? 'bg-blue-600 text-white' :
                            s.rating >= 7.5 ? 'bg-blue-500 text-white' :
                            s.rating >= 7.0 ? 'bg-emerald-500 text-white' :
                            s.rating >= 6.5 ? 'bg-yellow-500 text-black' :
                            s.rating >= 6.0 ? 'bg-orange-500 text-white' : 'bg-red-500 text-white'
                        }`}>
                            {s.rating.toFixed(1)}
                        </div>
                    )}
                </div>
                
                <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-white text-base leading-tight truncate">{p.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md ${isLive ? 'bg-blue-500/10 text-blue-400' : isHalftime ? 'bg-amber-500/10 text-amber-400' : 'bg-[#2a2a2a] text-zinc-400'}`}>
                            {isLive && <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />}
                            <span className="text-[10px] font-bold uppercase tracking-wide">{gameStatusText}</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-[#2a2a2a] px-2 py-0.5 rounded-md">
                             <span className="text-[10px] text-zinc-300 font-bold">{s.minutes}'</span>
                        </div>
                        <button onClick={() => setSelectedPlayerDetails(p)} className="text-[10px] font-bold text-zinc-400 hover:text-white flex items-center gap-1 bg-[#2a2a2a] px-2 py-0.5 rounded-md transition-colors">
                            <Plus size={10} /> Detalhes
                        </button>
                    </div>
                </div>

                <button onClick={() => removePlayer(p.id)} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#2a2a2a] text-zinc-400 hover:bg-red-500/20 hover:text-red-400 transition-colors shrink-0">
                    <Trash2 size={14} />
                </button>
            </div>

                    {/* Grid de Estatísticas e Controles */}
            <div className="p-4 bg-[#121212]">
                <div className="flex items-center gap-2 mb-3 px-1">
                    <Activity size={12} className="text-zinc-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Alertas</span>
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
                                    relative p-3 rounded-xl border flex flex-col items-start justify-center gap-1 transition-all duration-200 active:scale-95 group/btn overflow-hidden
                                    ${isActive 
                                        ? 'bg-blue-500/10 border-blue-500/30' 
                                        : 'bg-[#1e1e1e] border-white/5 hover:bg-[#2a2a2a]'}
                                `}
                            >
                                <div className="flex w-full justify-between items-center mb-1">
                                    <Icon size={14} className={isActive ? 'text-blue-400' : 'text-zinc-500'} />
                                    <span className={`font-bold text-sm leading-none ${isActive ? 'text-white' : 'text-zinc-400'}`}>
                                        {item.val}
                                    </span>
                                </div>
                                <span className={`text-[10px] font-bold w-full text-left truncate ${isActive ? 'text-blue-400' : 'text-zinc-500'}`}>
                                    {item.label}
                                </span>
                                
                                {/* Indicador visual de status ON/OFF */}
                                <div className={`absolute top-2 right-2 w-1.5 h-1.5 rounded-full transition-colors ${isActive ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'bg-transparent'}`} />
                            </button>
                        )
                    })}
                </div>
            </div>
        </div>
    );
  };

  const renderMonitor = () => (
    <div className="space-y-6 safe-area-top animate-in fade-in duration-500">
      {/* Header Dashboard */}
      <div className="bg-[#0a0a0a]/90 backdrop-blur-xl p-6 border-b border-white/5 sticky top-0 z-30 shadow-lg safe-area-top pt-safe-top">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
            <div className="flex items-center gap-6">
                <div className="flex flex-col">
                    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">Status do Sistema</span>
                    <div className="flex items-center gap-3">
                        <div className={`relative flex h-2.5 w-2.5 ${isMonitoring ? '' : 'opacity-50'}`}>
                          {isMonitoring && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>}
                          <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isMonitoring ? 'bg-blue-500' : 'bg-zinc-600'}`}></span>
                        </div>
                        <div className="flex flex-col">
                            <span className={`text-lg font-bold leading-none ${isMonitoring ? 'text-white' : 'text-zinc-500'}`}>
                                {isMonitoring ? 'MONITORANDO' : 'PAUSADO'}
                            </span>
                            {isMonitoring && (
                                <div className="flex items-center gap-2 mt-1.5">
                                    <span className="text-[10px] font-bold text-zinc-500">{lastSync}</span>
                                    <button onClick={forceUpdate} className="md:hidden text-blue-500 active:scale-90 transition-transform">
                                        <RefreshCw size={12} />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                
                {isMonitoring && (
                    <div className="hidden md:flex flex-col border-l border-white/10 pl-6">
                        <div className="flex items-center gap-3 mb-1">
                            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Próxima Varredura</span>
                            <button onClick={forceUpdate} className="text-blue-500 hover:text-blue-400 transition-colors">
                                <RefreshCw size={12} />
                            </button>
                        </div>
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-xl font-mono text-blue-400 font-bold">{countdown}</span>
                            <span className="text-xs text-zinc-500 font-bold">segundos</span>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex gap-3">
                <button 
                    onClick={handleStartMonitoring} 
                    className={`
                        h-12 px-6 rounded-xl font-bold flex items-center gap-2 transition-all active:scale-95 text-sm shadow-lg
                        ${isMonitoring 
                            ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20 shadow-red-500/10' 
                            : 'bg-blue-600 text-white hover:bg-blue-500 shadow-blue-500/20'}
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
                    className="h-12 w-12 flex items-center justify-center bg-[#1e1e1e] text-zinc-400 border border-white/5 rounded-xl hover:text-white hover:bg-[#2a2a2a] transition-colors active:scale-95 shadow-lg"
                >
                    <Settings size={20} />
                </button>
            </div>
        </div>
      </div>

      <div className="px-6 max-w-7xl mx-auto">
      {players.length === 0 ? (
        <div className="text-center py-32 flex flex-col items-center gap-8 opacity-60 animate-in zoom-in-95 duration-500">
            <div className="w-24 h-24 bg-[#1e1e1e] rounded-3xl flex items-center justify-center border border-white/5 shadow-lg">
                <Activity size={40} className="text-zinc-500" />
            </div>
            <div>
                <h3 className="text-xl font-bold text-white mb-2">Radar Vazio</h3>
                <p className="text-sm text-zinc-400 font-medium max-w-[250px] mx-auto leading-relaxed">Adicione jogadores de partidas ao vivo para começar a receber alertas em tempo real.</p>
            </div>
            <button 
                onClick={() => { setActiveTab('search'); fetchGames(); }} 
                className="group bg-blue-600 text-white px-8 py-3.5 rounded-xl text-sm font-bold active:scale-95 hover:bg-blue-500 transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2"
            >
                <Plus size={18} className="transition-transform duration-300"/>
                Adicionar Jogador
            </button>
        </div>
      ) : (
        <>
            <div className="flex justify-between items-end mb-6 px-2">
                <div>
                    <h2 className="text-2xl font-bold text-white mb-1">Jogadores</h2>
                    <div className="flex items-center gap-2 text-zinc-400">
                        <Activity size={14} className="text-blue-500" />
                        <span className="text-xs font-bold">{players.length} Monitorados</span>
                    </div>
                </div>
                <button 
                    onClick={() => setIsClearConfirmOpen(true)} 
                    className="text-xs font-bold text-red-400 bg-red-500/10 px-4 py-2 rounded-lg hover:bg-red-500/20 transition-colors active:scale-95 flex items-center gap-1.5 border border-red-500/20"
                >
                    <Trash2 size={14} /> Limpar
                </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
               {players.map(p => renderPlayerCard(p))}
            </div>
        </>
      )}
      </div>
    </div>
  );

  const renderSearch = () => (
    <div className="safe-area-top animate-in slide-in-from-bottom-4 duration-500">
        <div className="sticky top-0 bg-[#0a0a0a]/90 backdrop-blur-xl pt-safe-top pb-6 z-30 px-6 border-b border-white/5 mb-6 shadow-lg">
             <div className="max-w-7xl mx-auto pt-4">
                 <h2 className="text-2xl font-bold text-white mb-4 tracking-tight">Buscar Partida</h2>
                 <div className="flex gap-3">
                    <div className="flex-1 bg-[#1e1e1e] border border-white/5 rounded-xl flex items-center px-4 focus-within:border-blue-500/50 transition-all shadow-sm group">
                        <Search size={18} className="text-zinc-500 group-focus-within:text-blue-500 transition-colors" />
                        <input 
                            type="text" 
                            placeholder="Buscar times, campeonatos..." 
                            value={searchTerm} 
                            onChange={(e) => setSearchTerm(e.target.value)} 
                            className="bg-transparent border-none outline-none text-white p-3 w-full text-sm font-bold placeholder:text-zinc-500" 
                        />
                    </div>
                    <button 
                        onClick={fetchGames} 
                        disabled={isLoadingGames} 
                        className="bg-blue-600 text-white w-12 rounded-xl flex items-center justify-center hover:bg-blue-500 transition-all active:scale-95 shadow-lg shadow-blue-500/20"
                    >
                        <RefreshCw size={18} className={isLoadingGames ? 'animate-spin' : ''} />
                    </button>
                 </div>
             </div>
        </div>
        <div className="px-6 max-w-7xl mx-auto">
        {!selectedGameId ? (
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {liveGames.length === 0 && !isLoadingGames && (
                    <div className="text-center py-32 flex flex-col items-center col-span-full opacity-60">
                        <div className="w-20 h-20 bg-[#1e1e1e] rounded-[2rem] flex items-center justify-center mb-6 border border-white/5 shadow-lg">
                            <Search size={32} className="text-zinc-500" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">Nenhum jogo encontrado</h3>
                        <p className="font-medium text-zinc-400 text-sm max-w-[250px] mx-auto leading-relaxed">Tente buscar por outro time ou campeonato.</p>
                    </div>
                )}
                {liveGames.filter(g => api.normalizeString(g.homeTeam.name).includes(api.normalizeString(searchTerm)) || api.normalizeString(g.awayTeam.name).includes(api.normalizeString(searchTerm))).map(game => (<GameCard key={game.id} game={game} onClick={selectGame} isMonitored={monitoredGames.some(g => g.id === game.id)} onToggleMonitor={toggleMonitor} />))}
             </div>
        ) : (
            <div className="animate-in slide-in-from-right duration-500">
                <button 
                    onClick={() => setSelectedGameId(null)} 
                    className="mb-6 text-zinc-400 hover:text-white flex items-center gap-2 text-xs font-bold bg-[#1e1e1e] px-4 py-2.5 rounded-xl border border-white/5 active:scale-95 transition-all hover:bg-[#2a2a2a] shadow-sm"
                >
                    <X size={16}/>
                    Voltar para Lista
                </button>
                
                {isLoadingLineups ? (
                    <div className="text-center py-40 flex flex-col items-center">
                        <div className="relative w-12 h-12 mb-6">
                            <div className="absolute inset-0 border-4 border-[#1e1e1e] rounded-full"></div>
                            <div className="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent animate-spin"></div>
                        </div>
                        <span className="font-bold text-sm text-zinc-400">Carregando Escalações...</span>
                    </div>
                ) : lineups ? (
                    <div className="w-full max-w-full md:max-w-6xl mx-auto">
                        <SoccerField lineups={lineups} onSelectPlayer={addPlayer} />
                    </div>
                ) : (
                    <div className="text-center text-red-400 py-20 font-bold text-sm bg-red-500/10 rounded-2xl border border-red-500/20 shadow-sm">
                        ⚠️ Escalação indisponível
                    </div>
                )}
            </div>
        )}
        </div>
    </div>
  );

  // --- Renderização condicional (após todos os hooks) ---

  if (!isAuthReady) {
    return <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-zinc-100">Carregando...</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a0a] text-zinc-100 p-6">
        <div className="w-20 h-20 bg-blue-500/10 rounded-3xl flex items-center justify-center mb-6 border border-blue-500/20 shadow-lg">
            <svg viewBox="0 0 24 24" width="36" height="36" xmlns="http://www.w3.org/2000/svg">
                <g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)">
                    <path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z"/>
                    <path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z"/>
                    <path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.724 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z"/>
                    <path fill="#EA4335" d="M -14.754 45.859 C -13.064 45.859 -11.534 46.449 -10.344 47.589 L -6.744 43.989 C -8.834 42.039 -11.514 40.859 -14.754 40.859 C -19.444 40.859 -23.494 43.559 -25.464 47.479 L -21.484 50.569 C -20.534 47.719 -17.884 45.859 -14.754 45.859 Z"/>
                </g>
            </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight mb-3 text-white">Bem-vindo ao LiveMatch</h1>
        <p className="text-zinc-400 text-center max-w-sm mb-10 text-sm leading-relaxed font-medium">Faça login com sua conta Google para sincronizar seus jogadores e configurações.</p>
        
        <button 
          onClick={handleGoogleLogin}
          className="w-full max-w-sm py-4 bg-white hover:bg-zinc-200 text-black font-bold rounded-xl transition-all active:scale-95 shadow-lg flex items-center justify-center gap-3 text-sm"
        >
          Entrar com Google
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen font-sans bg-[#0a0a0a] text-zinc-100 selection:bg-blue-600/30 pb-24 md:pb-0">
        
        {updateAvailable && (
            <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-200">
                <div className="bg-[#121212] w-full max-w-sm rounded-[2rem] border border-white/10 p-6 text-center shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-emerald-500"></div>
                    <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-5 mx-auto border border-blue-500/20">
                        <Download size={28} className="text-blue-500" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2 tracking-tight">Nova Atualização!</h3>
                    <p className="text-sm text-zinc-400 mb-6 leading-relaxed px-2 font-medium">Uma nova versão do aplicativo está disponível com melhorias e correções.</p>
                    <div className="flex flex-col gap-3">
                        <button 
                            onClick={handleUpdate}
                            disabled={isUpdating}
                            className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-colors text-sm shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isUpdating ? `Atualizando... ${updateProgress}%` : 'Instalar Atualização'}
                        </button>
                        <button 
                            onClick={() => setUpdateAvailable(false)} 
                            disabled={isUpdating}
                            className="w-full py-3.5 bg-[#1e1e1e] hover:bg-[#2a2a2a] text-zinc-300 font-bold rounded-xl transition-colors text-sm disabled:opacity-50"
                        >
                            Lembrar Mais Tarde
                        </button>
                    </div>
                </div>
            </div>
        )}

        <div className="fixed top-6 right-6 z-[100] pointer-events-none flex flex-col items-end gap-3">
            {toasts.map(t => (<div key={t.id} className="bg-blue-600 text-white px-5 py-3 rounded-xl shadow-lg font-bold text-sm border border-blue-500 flex items-center gap-3 animate-in slide-in-from-right-10 fade-in duration-300"><Activity size={16} strokeWidth={2.5} />{t.msg}</div>))}
        </div>

        {isHelpOpen && renderHelpModal()}
        {selectedPlayerDetails && <PlayerDetailsModal player={selectedPlayerDetails} onClose={() => setSelectedPlayerDetails(null)} />}
        {isSettingsOpen && (
             <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-end md:items-center justify-center p-4 animate-in fade-in duration-300 safe-area-bottom">
                 <div className="bg-[#121212] w-full max-w-sm rounded-[2rem] border border-white/10 p-6 relative shadow-2xl">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-white tracking-tight">Configurações</h3>
                        <button onClick={() => setIsSettingsOpen(false)} className="bg-[#1e1e1e] p-2 rounded-full text-zinc-400 hover:text-white hover:bg-[#2a2a2a] transition-colors"><X size={20}/></button>
                    </div>
                    <div className="space-y-4">
                        <div className="bg-[#1e1e1e] p-5 rounded-2xl border border-white/5">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-sm font-bold text-zinc-300">Intervalo de Varredura</span>
                                <span className="text-lg font-bold text-blue-400 font-mono">{intervalTime}s</span>
                            </div>
                            <div className="text-[10px] text-zinc-500 font-medium mb-4">
                                {intervalTime >= 60 ? '✅ Recomendado para Segundo Plano' : '⚠️ Pode ser pausado pelo sistema'}
                            </div>
                            <input type="range" min="10" max="120" step="5" value={intervalTime} onChange={(e) => setIntervalTime(Number(e.target.value))} className="w-full h-1.5 bg-[#2a2a2a] rounded-lg appearance-none cursor-pointer accent-blue-500" />
                        </div>
                        <button onClick={() => setIsMuted(!isMuted)} className={`w-full p-4 rounded-2xl border flex items-center justify-between transition-all active:scale-[0.98] ${isMuted ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-[#1e1e1e] border-white/5 text-zinc-300 hover:bg-[#2a2a2a]'}`}>
                            <div className="flex items-center gap-3">
                                <div className={`p-2.5 rounded-xl ${isMuted ? 'bg-red-500/20' : 'bg-[#2a2a2a]'}`}>{isMuted ? <VolumeX size={18}/> : <Volume2 size={18}/>}</div>
                                <div className="text-left">
                                    <div className="text-sm font-bold">Sons de Alerta</div>
                                    <div className="text-[10px] opacity-70 font-medium mt-0.5">{isMuted ? 'Desativado' : 'Ativado'}</div>
                                </div>
                            </div>
                            <div className={`w-10 h-6 rounded-full p-1 transition-colors ${isMuted ? 'bg-[#2a2a2a]' : 'bg-blue-500'}`}>
                                <div className={`w-4 h-4 bg-white rounded-full shadow-md transition-transform ${isMuted ? 'translate-x-0' : 'translate-x-4'}`} />
                            </div>
                        </button>
                        <div className="grid grid-cols-2 gap-3">
                             <button onClick={handleSendTestNotification} className="flex-1 p-3.5 rounded-xl bg-[#1e1e1e] border border-white/5 text-zinc-300 flex items-center justify-center gap-2 font-bold text-xs hover:bg-[#2a2a2a] transition-colors"><Bell size={16}/> Testar</button>
                             <button onClick={() => setIsHelpOpen(true)} className="flex-1 p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center gap-2 font-bold text-xs hover:bg-blue-500/20 transition-colors"><BellOff size={16}/> Ajuda</button>
                        </div>
                        
                        <div className="mt-6 pt-6 border-t border-white/10">
                            <div className="text-center mb-4">
                                <h4 className="text-sm font-bold text-white mb-1">Conta e Sincronização</h4>
                                <p className="text-[10px] text-zinc-400">Faça login para sincronizar seus jogadores monitorados entre o celular e o computador.</p>
                            </div>
                            
                            {user && !user.isAnonymous ? (
                                <div className="space-y-3">
                                    <div className="flex items-center gap-3 bg-[#1e1e1e] p-3 rounded-xl border border-white/5">
                                        {user.photoURL ? (
                                            <img src={user.photoURL} alt="Avatar" className="w-10 h-10 rounded-full" referrerPolicy="no-referrer" />
                                        ) : (
                                            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold">
                                                {user.email?.charAt(0).toUpperCase() || 'U'}
                                            </div>
                                        )}
                                        <div className="flex-1 overflow-hidden">
                                            <div className="text-sm font-bold text-white truncate">{user.displayName || 'Usuário'}</div>
                                            <div className="text-[10px] text-zinc-400 truncate">{user.email}</div>
                                        </div>
                                    </div>
                                    <button onClick={handleLogout} className="w-full p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 font-bold text-sm hover:bg-red-500/20 transition-colors">
                                        Sair da Conta
                                    </button>
                                </div>
                            ) : (
                                <button onClick={handleGoogleLogin} className="w-full p-3 rounded-xl bg-white text-black font-bold text-sm hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2">
                                    <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
                                        <g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)">
                                            <path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z"/>
                                            <path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z"/>
                                            <path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.724 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z"/>
                                            <path fill="#EA4335" d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z"/>
                                        </g>
                                    </svg>
                                    Entrar com Google
                                </button>
                            )}
                        </div>
                    </div>
                 </div>
             </div>
        )}
        {isClearConfirmOpen && (
             <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-200">
                <div className="bg-[#121212] w-full max-w-sm rounded-[2rem] border border-white/10 p-6 text-center shadow-2xl">
                    <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mb-5 mx-auto border border-red-500/20">
                        <Trash2 size={28} className="text-red-500" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2 tracking-tight">Limpar Radar?</h3>
                    <p className="text-sm text-zinc-400 mb-6 leading-relaxed px-2 font-medium">Isso removerá todos os jogadores da sua lista de monitoramento atual.</p>
                    <div className="flex gap-3">
                        <button onClick={() => setIsClearConfirmOpen(false)} className="flex-1 py-3.5 bg-[#1e1e1e] hover:bg-[#2a2a2a] text-zinc-300 font-bold rounded-xl transition-colors text-sm">Cancelar</button>
                        <button onClick={async () => { 
                            setIsMonitoring(false); 
                            setIsClearConfirmOpen(false);
                            if (user) {
                                try {
                                    const q = query(collection(db, `users/${user.uid}/monitoredPlayers`));
                                    const snapshot = await getDocs(q);
                                    snapshot.forEach(async (d) => {
                                        await deleteDoc(doc(db, `users/${user.uid}/monitoredPlayers`, d.id));
                                    });
                                } catch (error) {
                                    handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/monitoredPlayers`);
                                }
                            } else {
                                setPlayers([]);
                            }
                        }} className="flex-1 py-3.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition-colors text-sm shadow-lg">Limpar Tudo</button>
                    </div>
                </div>
             </div>
        )}

        <div className="w-full max-w-7xl mx-auto min-h-screen relative bg-[#0a0a0a] md:border-x md:border-zinc-800/50 shadow-2xl flex flex-col">
            <main className="flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))]">
                {activeTab === 'monitor' && renderMonitor()}
                {activeTab === 'search' && renderSearch()}
                {activeTab === 'logs' && (
                    <div className="px-6 pt-24 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="flex items-center justify-between mb-8 max-w-7xl mx-auto">
                            <div className="flex items-center gap-4">
                                <h2 className="text-2xl font-bold text-white tracking-tight">Live Log</h2>
                                {logs.length > 0 && (
                                    <button 
                                        onClick={() => { setLogs([]); addToast('Logs limpos', 'success'); }} 
                                        className="p-2 bg-[#1e1e1e] rounded-xl text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors active:scale-95 shadow-sm" 
                                        title="Limpar Logs"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                )}
                            </div>
                            <span className="text-xs font-bold text-zinc-400 bg-[#1e1e1e] px-3 py-1 rounded-lg border border-white/5 shadow-sm">{logs.length} Eventos</span>
                        </div>
                        <div className="space-y-3 max-w-7xl mx-auto">
                            {logs.map(log => (
                                <div key={log.id} className={`p-4 rounded-xl border flex items-start gap-3 transition-all hover:scale-[1.01] shadow-sm ${log.type === 'success' ? 'bg-blue-500/10 border-blue-500/20 text-blue-100' : 'bg-[#1e1e1e] border-white/5 text-zinc-300'}`}>
                                    <div className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${log.type === 'success' ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'bg-zinc-500'}`} />
                                    <div className="flex-1">
                                        <div className="text-[10px] font-mono font-bold text-zinc-500 mb-1">{log.time}</div>
                                        <div className="text-sm font-medium leading-snug">{log.message}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </main>
            
            {/* Premium Bottom Navigation Bar */}
            <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
                <div className="max-w-7xl mx-auto px-4 pb-[env(safe-area-inset-bottom)] pt-4">
                    <nav className="pointer-events-auto bg-[#1a1a1a]/80 backdrop-blur-2xl border border-white/10 shadow-2xl rounded-2xl mb-4 mx-auto max-w-md overflow-hidden">
                        <div className="flex justify-around items-center h-16 px-2">
                            {['monitor', 'search', 'logs'].map((id) => (
                                <button 
                                    key={id} 
                                    onClick={() => setActiveTab(id as any)} 
                                    className={`relative flex flex-col items-center justify-center w-full h-full gap-1 transition-all duration-300 ${activeTab === id ? 'text-blue-400' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'}`}
                                >
                                    {activeTab === id && (
                                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-blue-500 rounded-b-full shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>
                                    )}
                                    <div className={`transition-transform duration-300 ${activeTab === id ? '-translate-y-0.5' : ''}`}>
                                        {id === 'monitor' ? <LayoutDashboard size={22} strokeWidth={activeTab === id ? 2.5 : 2} /> : 
                                         id === 'search' ? <Search size={22} strokeWidth={activeTab === id ? 2.5 : 2} /> : 
                                         <List size={22} strokeWidth={activeTab === id ? 2.5 : 2} />}
                                    </div>
                                    <span className={`text-[10px] font-bold tracking-wide transition-all duration-300 ${activeTab === id ? 'opacity-100' : 'opacity-70'}`}>
                                        {id === 'monitor' ? 'Radar' : id === 'search' ? 'Buscar' : 'Logs'}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </nav>
                </div>
            </div>
        </div>

    </div>
  );
};

export default App;
