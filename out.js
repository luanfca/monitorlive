"use strict";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Play, Square, Activity, Search, List, Volume2, VolumeX, Trash2, Settings, Plus, RefreshCw, Bell, BellOff, X, LayoutDashboard, Download, Target, AlertTriangle, Footprints, Shield, Flag, BadgeAlert, LogOut } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { PushNotifications } from "@capacitor/push-notifications";
import { App as CapApp } from "@capacitor/app";
import { CapacitorUpdater } from "@capgo/capacitor-updater";
import * as api from "./services/sofaService";
import { getMessaging, getToken, deleteToken } from "firebase/messaging";
import { auth, db } from "./services/firebase";
import { collection, onSnapshot, query, orderBy, limit } from "firebase/firestore";
import SoccerField from "./components/SoccerField";
var OperationType = /* @__PURE__ */ ((OperationType2) => {
  OperationType2["CREATE"] = "create";
  OperationType2["UPDATE"] = "update";
  OperationType2["DELETE"] = "delete";
  OperationType2["LIST"] = "list";
  OperationType2["GET"] = "get";
  OperationType2["WRITE"] = "write";
  return OperationType2;
})(OperationType || {});
function handleFirestoreError(error, operationType, path) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map((provider) => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
}
import SofaImage from "./components/SofaImage";
import SofaHeatmap from "./components/SofaHeatmap";
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}
let audioCtx = null;
const initAudio = () => {
  try {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        audioCtx = new AudioContext();
      }
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch((e) => console.warn("Audio resume failed", e));
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
      osc.type = "sine";
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration / 1e3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration / 1e3);
    }
    if ("vibrate" in navigator && !Capacitor.isNativePlatform()) {
      try {
        navigator.vibrate([200, 100, 200]);
      } catch (e) {
      }
    }
  } catch (e) {
    console.error("Alert trigger error", e);
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
      osc.frequency.setValueAtTime(1e3, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.8);
      osc.type = "sine";
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.8);
    }
  } catch (e) {
    console.error("Swoosh trigger error", e);
  }
};
const GameCard = React.memo(({ game, onClick, isMonitored, onToggleMonitor }) => {
  return /* @__PURE__ */ jsxs(
    "div",
    {
      onClick: () => onClick(game.id),
      role: "button",
      tabIndex: 0,
      onKeyDown: (e) => {
        if (e.key === "Enter" || e.key === " ") onClick(game.id);
      },
      className: "w-full bg-zinc-900/60 backdrop-blur-md border border-zinc-800/80 p-5 rounded-[1.5rem] hover:border-emerald-500/40 transition-all active:scale-[0.98] text-left group shadow-lg relative overflow-hidden flex flex-col h-full cursor-pointer",
      children: [
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: (e) => {
              e.stopPropagation();
              onToggleMonitor(game);
            },
            className: `absolute top-4 right-4 z-20 p-2 rounded-full ${isMonitored ? "bg-emerald-500" : "bg-zinc-800"}`,
            children: /* @__PURE__ */ jsx(Bell, { size: 16, className: isMonitored ? "text-white" : "text-zinc-400" })
          }
        ),
        /* @__PURE__ */ jsxs("div", { className: "flex-1 z-10 relative w-full", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-start mb-4", children: [
            /* @__PURE__ */ jsx("span", { className: "text-[10px] uppercase text-zinc-400 font-black bg-black/40 px-2 py-1 rounded-md border border-white/5 max-w-[70%] truncate tracking-wider", children: game.tournament }),
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1.5 bg-emerald-500/10 px-2 py-1 rounded-md border border-emerald-500/10", children: [
              (typeof game.minute === "number" || game.status === "Live") && /* @__PURE__ */ jsx("span", { className: "w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" }),
              /* @__PURE__ */ jsx("span", { className: "text-[10px] text-emerald-400 font-mono font-black uppercase tracking-tight leading-none", children: (() => {
                const isHalftime = game.statusCode === 31 || game.status === "Halftime" || game.status === "HT" || game.status === "Intervalo" || game.status === "Break" || game.status === "Half time";
                const isEnded = game.statusCode === 100 || game.statusCode === 106 || game.statusCode === 120 || game.status === "Ended" || game.status === "FT" || game.status === "Fim" || game.status === "Full time";
                const statusText = isHalftime ? "Intervalo" : isEnded ? "Fim" : "";
                if (typeof game.minute === "number") {
                  return statusText ? `${game.minute}' - ${statusText}` : `${game.minute}'`;
                }
                return statusText || game.status;
              })() })
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "flex items-center justify-between gap-4", children: /* @__PURE__ */ jsxs("div", { className: "flex-1 space-y-3 w-full", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center", children: [
              /* @__PURE__ */ jsx("div", { className: "font-bold text-zinc-100 truncate text-sm uppercase tracking-tight max-w-[70%]", children: game.homeTeam.name }),
              /* @__PURE__ */ jsx("div", { className: "font-mono text-xl font-black text-white", children: game.homeTeam.score ?? 0 })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center", children: [
              /* @__PURE__ */ jsx("div", { className: "font-bold text-zinc-100 truncate text-sm uppercase tracking-tight max-w-[70%]", children: game.awayTeam.name }),
              /* @__PURE__ */ jsx("div", { className: "font-mono text-xl font-black text-white", children: game.awayTeam.score ?? 0 })
            ] })
          ] }) })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "absolute -top-10 -right-10 w-32 h-32 bg-emerald-500/5 blur-[50px] rounded-full pointer-events-none" })
      ]
    }
  );
}, (prevProps, nextProps) => {
  return prevProps.game.id === nextProps.game.id && prevProps.game.minute === nextProps.game.minute && prevProps.game.status === nextProps.game.status && prevProps.game.homeTeam.score === nextProps.game.homeTeam.score && prevProps.game.awayTeam.score === nextProps.game.awayTeam.score && prevProps.isMonitored === nextProps.isMonitored;
});
const App = () => {
  let messaging = null;
  try {
    if (!Capacitor.isNativePlatform()) {
      messaging = getMessaging();
    }
  } catch (e) {
    console.warn("Firebase messaging not supported", e);
  }
  const [fcmToken, setFcmToken] = useState(null);
  useEffect(() => {
    const requestPermission = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          let permStatus = await PushNotifications.checkPermissions();
          if (permStatus.receive === "prompt") {
            permStatus = await PushNotifications.requestPermissions();
          }
          if (permStatus.receive !== "granted") {
            throw new Error("User denied permissions!");
          }
          await PushNotifications.register();
          PushNotifications.addListener("registration", (token) => {
            console.log("Push registration success, token: " + token.value);
            setFcmToken(token.value);
          });
          PushNotifications.addListener("registrationError", (error) => {
            console.error("Error on registration: " + JSON.stringify(error));
          });
          PushNotifications.addListener("pushNotificationReceived", (notification) => {
            console.log("Push received: ", notification);
            addToast(notification.title + ": " + notification.body, "info");
            addLog("Notifica\xE7\xE3o recebida: " + notification.body, "info");
          });
          PushNotifications.addListener("pushNotificationActionPerformed", (notification) => {
            console.log("Push action performed: ", notification);
          });
        } catch (e) {
          console.error("Erro ao configurar Push Nativo:", e);
        }
      } else {
        try {
          if ("serviceWorker" in navigator) {
            await navigator.serviceWorker.register("/firebase-messaging-sw.js");
          }
          const permission = await Notification.requestPermission();
          if (permission === "granted") {
            const vapidKey = import.meta.env ? import.meta.env.VITE_VAPID_KEY : process.env.VITE_VAPID_KEY;
            const token = await getToken(messaging, { vapidKey });
            console.log("FCM Token:", token);
            setFcmToken(token);
          }
        } catch (e) {
          console.error("Erro ao solicitar permiss\xE3o de notifica\xE7\xE3o (Web):", e);
        }
      }
    };
    requestPermission();
  }, []);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [latestCommitUrl, setLatestCommitUrl] = useState("");
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [logs, setLogs] = useState(() => {
    try {
      const saved = localStorage.getItem("match_logs");
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [toasts, setToasts] = useState([]);
  const addToast = useCallback((msg, type) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4e3);
  }, []);
  const addLog = useCallback((message, type = "info") => {
    const entry = {
      id: Math.random().toString(36).substr(2, 9),
      time: (/* @__PURE__ */ new Date()).toLocaleTimeString("pt-BR"),
      message,
      type
    };
    setLogs((prev) => [entry, ...prev].slice(0, 50));
  }, []);
  const [updatedPlayersIds, setUpdatedPlayersIds] = useState(/* @__PURE__ */ new Set());
  const [liveGames, setLiveGames] = useState([]);
  const [monitoredGames, setMonitoredGames] = useState(() => {
    try {
      const saved = localStorage.getItem("monitored_games");
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [selectedGameId, setSelectedGameId] = useState(null);
  const [lineups, setLineups] = useState(null);
  const [isLoadingGames, setIsLoadingGames] = useState(false);
  const [isLoadingLineups, setIsLoadingLineups] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [lastSync, setLastSync] = useState("Aguardando primeira varredura...");
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [selectedPlayerDetails, setSelectedPlayerDetails] = useState(null);
  const countdownRef = useRef(null);
  const [activeTab, setActiveTab] = useState("monitor");
  const [isMonitoring, setIsMonitoring] = useState(() => localStorage.getItem("is_monitoring") === "true");
  const [intervalTime, setIntervalTime] = useState(() => {
    const saved = localStorage.getItem("interval_time");
    return saved ? Number(saved) : 60;
  });
  const [countdown, setCountdown] = useState(60);
  const [isMuted, setIsMuted] = useState(false);
  const [notifPermission, setNotifPermission] = useState(
    "Notification" in window ? Notification.permission : "denied"
  );
  const [players, setPlayers] = useState(() => {
    try {
      const saved = localStorage.getItem("monitored_players");
      return saved && saved !== "" ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const playersRef = useRef(players);
  useEffect(() => {
    if (fcmToken) {
      fetch("/api/update-monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: fcmToken, players: isMonitoring ? players : [] })
      }).catch((e) => console.error("Erro ao sincronizar com backend:", e));
    }
  }, [fcmToken, players, isMonitoring]);
  useEffect(() => {
    setIsAuthReady(true);
  }, []);
  useEffect(() => {
    playersRef.current = players;
  }, [players]);
  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const response = await fetch("https://api.github.com/repos/luanfca/MonitorLive/commits");
        const data = await response.json();
        const latestCommit = data[0]?.sha;
        const currentCommit = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
        if (latestCommit && currentCommit && currentCommit !== "dev" && latestCommit !== currentCommit) {
          setLatestCommitUrl("https://github.com/luanfca/MonitorLive/releases/download/latest/update.zip");
          setUpdateAvailable(true);
        }
      } catch (error) {
        console.error("Failed to check for updates", error);
      }
    };
    if (typeof Capacitor !== "undefined" && Capacitor.isNativePlatform()) {
      CapacitorUpdater.notifyAppReady();
      checkUpdate();
    }
  }, []);
  const handleUpdate = async () => {
    if (!latestCommitUrl) return;
    setIsUpdating(true);
    try {
      CapacitorUpdater.addListener("download", (info) => {
        setUpdateProgress(Math.round((info.percent || 0) * 100));
      });
      const version = await CapacitorUpdater.download({
        url: latestCommitUrl,
        version: Date.now().toString()
        // Um ID único para a versão
      });
      await CapacitorUpdater.set({ id: version.id });
    } catch (error) {
      console.error("Erro ao atualizar:", error);
      alert("Falha ao baixar a atualiza\xE7\xE3o. Tente novamente mais tarde.");
      setIsUpdating(false);
    }
  };
  useEffect(() => {
    if (!isAuthReady) return;
    const notificationsRef = collection(db, "notifications");
    const q = query(notificationsRef, orderBy("timestamp", "desc"), limit(5));
    let isInitialSnapshot = true;
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (isInitialSnapshot) {
        isInitialSnapshot = false;
        return;
      }
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const data = change.doc.data();
          addLog(data.message, "info");
          triggerAlert();
          if (Capacitor.isNativePlatform()) {
            LocalNotifications.schedule({
              notifications: [{
                title: "Alerta de Jogo",
                body: data.message,
                id: Math.floor(Math.random() * 1e5)
              }]
            });
          }
        }
      });
    }, (error) => {
      handleFirestoreError(error, "list" /* LIST */, "notifications");
    });
    return () => unsubscribe();
  }, [isAuthReady, addLog]);
  const isWorkerUpdate = useRef(false);
  useEffect(() => {
    addLog("Iniciando LiveMatch v2.1 (Anti-Bloqueio Ativado)", "info");
    if (Capacitor.isNativePlatform()) {
      addLog("Modo Nativo Detectado: Usando CapacitorHttp com Rota\xE7\xE3o de UA", "success");
    } else {
      addLog("Modo Web: Usando Proxy Local", "info");
    }
  }, []);
  const sendNotification = useCallback(async (title, body) => {
    if (Capacitor.isNativePlatform()) {
      try {
        const perm = await LocalNotifications.checkPermissions();
        if (perm.display !== "granted") return;
        await LocalNotifications.schedule({
          notifications: [{
            title,
            body,
            id: (/* @__PURE__ */ new Date()).getTime() % 2147483647,
            // Garante Inteiro válido 32-bit
            schedule: { at: new Date(Date.now() + 100) },
            // 100ms delay para garantir execução
            sound: void 0,
            // Som padrão
            attachments: [],
            actionTypeId: "",
            extra: null,
            channelId: "live_match_alerts_v3"
            // FUNDAMENTAL para popup no Android 8+
          }]
        });
      } catch (e) {
        console.error("Erro ao enviar notifica\xE7\xE3o nativa", e);
      }
      return;
    }
    if (notifPermission !== "granted") return;
    const options = {
      body,
      icon: "https://cdn-icons-png.flaticon.com/512/53/53283.png",
      badge: "https://cdn-icons-png.flaticon.com/512/53/53283.png",
      vibrate: [200, 100, 200, 100, 200],
      tag: "live-alert",
      renotify: true,
      requireInteraction: true
    };
    if ("serviceWorker" in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(title, options);
        return;
      } catch (e) {
      }
    }
    try {
      const n = new Notification(title, options);
      n.onclick = () => window.focus();
    } catch (e) {
    }
  }, [notifPermission]);
  const handleWorkerResult = useCallback((updates, alerts, newMonitoredGames) => {
    if (newMonitoredGames) {
      setMonitoredGames(newMonitoredGames);
    }
    const now = /* @__PURE__ */ new Date();
    const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setLastSync(`Atualizado hoje \xE0s ${timeStr}`);
    setCountdown(intervalTime);
    if (alerts && alerts.length > 0) {
      const firstAlert = alerts[0];
      const isRemoval = firstAlert.type === "removal";
      const isSubstitution = firstAlert.type === "substitution";
      if (!isMuted) {
        if (isSubstitution) {
          triggerSwoosh();
        } else {
          triggerAlert(isRemoval ? 400 : 1200, isRemoval ? 800 : 500);
        }
      }
      sendNotification("ALERTA DE JOGO \u26BD", firstAlert.message);
      alerts.forEach((alert2) => addLog(alert2.message, alert2.type === "removal" ? "error" : alert2.type === "substitution" ? "info" : "success"));
    }
    if (updates && updates.length > 0) {
      isWorkerUpdate.current = true;
      const changedIds = /* @__PURE__ */ new Set();
      setPlayers((prevPlayers) => {
        return prevPlayers.map((p) => {
          const update = updates.find((u) => u.id === p.id);
          if (update) {
            const prev = p.lastStats;
            const curr = update.stats;
            let hasChanged = false;
            if (!prev) {
              hasChanged = true;
            } else {
              if (prev.minutes !== curr.minutes || prev.goals !== curr.goals || prev.assists !== curr.assists || prev.shotsTotal !== curr.shotsTotal || prev.shotsOnTarget !== curr.shotsOnTarget || prev.tackles !== curr.tackles || prev.interceptions !== curr.interceptions || prev.duelsWon !== curr.duelsWon || prev.fouls !== curr.fouls || prev.foulsDrawn !== curr.foulsDrawn || prev.yellowCards !== curr.yellowCards || prev.redCards !== curr.redCards || prev.totalPasses !== curr.totalPasses || prev.rating !== curr.rating) {
                hasChanged = true;
              }
            }
            if (hasChanged) {
              changedIds.add(p.id);
            }
            const currentMinutes = p.lastStats?.minutes || 0;
            const newMinutes = update.stats.minutes || 0;
            if (newMinutes < currentMinutes && newMinutes === 0 && currentMinutes > 0) {
              return p;
            }
            const hasAlert = update.hasAlert;
            const newLastAlertedStats = hasAlert ? update.stats : p.lastAlertedStats;
            return { ...p, lastStats: update.stats, lastAlertedStats: newLastAlertedStats };
          }
          return p;
        });
      });
      if (changedIds.size > 0 || alerts && alerts.length > 0) {
        setUpdatedPlayersIds(changedIds);
        setTimeout(() => setUpdatedPlayersIds(/* @__PURE__ */ new Set()), 4e3);
      }
      setTimeout(() => {
        isWorkerUpdate.current = false;
      }, 100);
    }
  }, [intervalTime, sendNotification, isMuted, addLog]);
  const isCheckingRef = useRef(false);
  const runForegroundCheck = useCallback(async () => {
    const currentPlayers = playersRef.current;
    if (!isMonitoring || currentPlayers.length === 0 || isCheckingRef.current) return;
    isCheckingRef.current = true;
    setCountdown(intervalTime);
    const updates = [];
    const alerts = [];
    const playersByEvent = {};
    for (const p of currentPlayers) {
      if (!playersByEvent[p.eventId]) playersByEvent[p.eventId] = [];
      playersByEvent[p.eventId].push(p);
    }
    for (const eventIdStr of Object.keys(playersByEvent)) {
      const eventId = Number(eventIdStr);
      const playersInEvent = playersByEvent[eventId];
      try {
        const lineups2 = await api.getGamePlayers(eventId);
        if (!lineups2) continue;
        const allPlayers = [
          ...lineups2.home.starters,
          ...lineups2.home.substitutes,
          ...lineups2.away.starters,
          ...lineups2.away.substitutes
        ];
        for (const player of playersInEvent) {
          const gamePlayer = allPlayers.find((p) => p.id === player.sofaId);
          if (!gamePlayer || !gamePlayer.statistics) continue;
          const s = gamePlayer.statistics;
          const stats = {
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
              alerts.push({ message: `\u{1F3AF} ${player.name}: CHUTE NO ALVO! (Total: ${stats.shotsOnTarget})`, type: "addition" });
            }
            if (player.alerts.tackles && stats.tackles > prev.tackles) {
              alerts.push({ message: `\u{1F6E1}\uFE0F ${player.name}: NOVO DESARME! (Total: ${stats.tackles})`, type: "addition" });
            }
            if (player.alerts.yellow && stats.yellowCards > prev.yellowCards) {
              alerts.push({ message: `\u{1F7E8} ${player.name}: CART\xC3O AMARELO! (Total: ${stats.yellowCards})`, type: "addition" });
            }
            if (player.alerts.fouls && stats.fouls > prev.fouls) {
              alerts.push({ message: `\u26A0\uFE0F ${player.name}: COMETEU FALTA! (Total: ${stats.fouls})`, type: "addition" });
            }
            if (player.alerts.foulsDrawn && stats.foulsDrawn > prev.foulsDrawn) {
              alerts.push({ message: `\u{1F915} ${player.name}: SOFREU FALTA! (Total: ${stats.foulsDrawn})`, type: "addition" });
            }
            if (player.alerts.shots && stats.shotsTotal > prev.shotsTotal) {
              const isTarget = stats.shotsOnTarget > prev.shotsOnTarget;
              if (!isTarget || !player.alerts.shotsOn) {
                alerts.push({ message: `\u{1F45F} ${player.name}: CHUTOU! (Total: ${stats.shotsTotal})`, type: "addition" });
              }
            }
            if (player.alerts.subOut && !prev.isSubstitute && stats.isSubstitute) {
              alerts.push({ message: `\u{1F504} ${player.name}: SUBSTITU\xCDDO!`, type: "addition" });
            }
            if (player.alerts.tackles && stats.tackles < prev.tackles) {
              alerts.push({ message: `\u274C ${player.name}: DESARME REMOVIDO! (Total: ${stats.tackles})`, type: "removal" });
            }
            if (player.alerts.shotsOn && stats.shotsOnTarget < prev.shotsOnTarget) {
              alerts.push({ message: `\u274C ${player.name}: CHUTE NO ALVO REMOVIDO! (Total: ${stats.shotsOnTarget})`, type: "removal" });
            }
          }
          updates.push({ id: player.id, stats });
        }
      } catch (e) {
        console.error("Foreground fetch error", e);
      }
    }
    if (!isMonitoring) {
      isCheckingRef.current = false;
      return;
    }
    handleWorkerResult(updates, alerts);
    isCheckingRef.current = false;
  }, [isMonitoring, handleWorkerResult, intervalTime, addLog]);
  const forceUpdate = useCallback(async () => {
    if (isMonitoring && document.visibilityState === "visible") {
      runForegroundCheck();
      addLog("Atualiza\xE7\xE3o manual...", "info");
    }
  }, [isMonitoring, runForegroundCheck]);
  useEffect(() => {
    let timeoutId;
    let isActive = true;
    const loop = async () => {
      if (!isActive || !isMonitoring || document.visibilityState !== "visible") return;
      await runForegroundCheck();
      if (isActive && isMonitoring && document.visibilityState === "visible") {
        timeoutId = setTimeout(loop, intervalTime * 1e3);
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && isMonitoring) {
        clearTimeout(timeoutId);
        loop();
      } else {
        clearTimeout(timeoutId);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    let appStateListener;
    if (Capacitor.isNativePlatform()) {
      CapApp.addListener("appStateChange", async ({ isActive: isActive2 }) => {
        if (isActive2 && isMonitoring) {
          clearTimeout(timeoutId);
          loop();
        } else {
          clearTimeout(timeoutId);
        }
      }).then((listener) => {
        appStateListener = listener;
        if (!isActive) {
          listener.remove();
        }
      });
    }
    if (isMonitoring && document.visibilityState === "visible") {
      loop();
    }
    return () => {
      isActive = false;
      clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (appStateListener && appStateListener.remove) appStateListener.remove();
    };
  }, [isMonitoring, intervalTime, runForegroundCheck]);
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      LocalNotifications.createChannel({
        id: "live_match_alerts_v3",
        // ID novo para forçar atualização
        name: "Alertas ao Vivo (Prioridade)",
        description: "Notifica\xE7\xF5es de eventos em tempo real",
        importance: 5,
        // 5 = HIGH (Força o popup/banner)
        visibility: 1,
        // 1 = PUBLIC (Mostra conteúdo na tela de bloqueio)
        vibration: true,
        sound: void 0,
        // Usa som padrão do sistema
        lights: true,
        lightColor: "#10B981"
        // Emerald color
      }).catch((err) => console.error("Erro criando channel", err));
    }
  }, []);
  const handleSendTestNotification = async () => {
    if (!fcmToken) {
      addToast("Token FCM n\xE3o dispon\xEDvel. Tentando gerar um novo...", "info");
      try {
        if (!Capacitor.isNativePlatform() && "Notification" in window && Notification.permission === "granted") {
          const vapidKey = import.meta.env ? import.meta.env.VITE_VAPID_KEY : process.env.VITE_VAPID_KEY;
          const token = await getToken(messaging, { vapidKey });
          setFcmToken(token);
          addToast("Novo token gerado. Tente novamente.", "success");
        }
      } catch (e) {
        console.error("Erro ao gerar novo token:", e);
        addToast("Erro ao gerar novo token", "error");
      }
      return;
    }
    try {
      const response = await fetch("/api/test-notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: fcmToken })
      });
      if (response.ok) {
        addToast("Notifica\xE7\xE3o de teste enviada!", "success");
      } else if (response.status === 404) {
        addToast("Token expirado. Gerando um novo...", "info");
        setFcmToken(null);
        try {
          if (!Capacitor.isNativePlatform()) {
            await deleteToken(messaging);
            const vapidKey = import.meta.env ? import.meta.env.VITE_VAPID_KEY : process.env.VITE_VAPID_KEY;
            const token = await getToken(messaging, { vapidKey });
            setFcmToken(token);
            addToast("Novo token gerado. Tente novamente.", "success");
          }
        } catch (e) {
          console.error("Erro ao renovar token:", e);
        }
      } else {
        addToast("Erro ao enviar notifica\xE7\xE3o de teste", "error");
      }
    } catch (e) {
      console.error("Erro ao enviar notifica\xE7\xE3o de teste:", e);
      addToast("Erro ao enviar notifica\xE7\xE3o de teste", "error");
    }
  };
  const subscribePush = async () => {
    if (!("serviceWorker" in navigator) || Capacitor.isNativePlatform()) return;
    if (!("PushManager" in window)) return;
    try {
      const swReadyPromise = navigator.serviceWorker.ready;
      const timeoutPromise = new Promise(
        (_, reject) => setTimeout(() => reject(new Error("Timeout SW")), 4e3)
      );
      const reg = await Promise.race([swReadyPromise, timeoutPromise]);
      const existingSub = await reg.pushManager.getSubscription();
      if (existingSub) return;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;
      const vapidPublicKey = import.meta.env ? import.meta.env.VITE_VAPID_KEY : process.env.VITE_VAPID_KEY;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
      });
      await fetch("/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub)
      });
      addToast("Notifica\xE7\xF5es Push Conectadas", "success");
    } catch (e) {
      console.warn("Push error", e);
    }
  };
  useEffect(() => {
    localStorage.setItem("is_monitoring", String(isMonitoring));
  }, [isMonitoring]);
  useEffect(() => {
    localStorage.setItem("interval_time", String(intervalTime));
  }, [intervalTime, isMonitoring]);
  useEffect(() => {
    localStorage.setItem("match_logs", JSON.stringify(logs));
  }, [logs]);
  useEffect(() => {
    playersRef.current = players;
    localStorage.setItem("monitored_players", JSON.stringify(players));
    isWorkerUpdate.current = false;
    if (players.length === 0 && isMonitoring) {
      setIsMonitoring(false);
      addLog("Monitoramento parado: Lista vazia", "info");
    }
  }, [players, isMonitoring]);
  useEffect(() => {
    if ("Notification" in window && !Capacitor.isNativePlatform()) {
      setNotifPermission(Notification.permission);
    }
  }, []);
  const testNotification = () => {
    sendNotification("\u26BD Teste do LiveMatch", "As notifica\xE7\xF5es est\xE3o ativas! Se voc\xEA recebeu isso, o radar est\xE1 pronto.");
  };
  const requestNativePermissions = async () => {
    try {
      const result = await LocalNotifications.requestPermissions();
      if (result.display === "granted") {
        addToast("Permiss\xF5es Nativas Concedidas", "success");
        setNotifPermission("granted");
      } else {
        setNotifPermission("denied");
        setIsHelpOpen(true);
      }
    } catch (e) {
      console.error("Erro pedindo permiss\xE3o nativa", e);
    }
  };
  const handleStartMonitoring = async () => {
    if (players.length === 0 && !isMonitoring) {
      addToast("Adicione jogadores para monitorar", "error");
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
            if (notifPermission === "default" && "Notification" in window) {
              const p = await Notification.requestPermission();
              setNotifPermission(p);
            }
            if (notifPermission === "granted") await subscribePush();
            else if (notifPermission === "denied") setIsHelpOpen(true);
          }
        } catch (err) {
        }
      })();
    }
  };
  const zeroCountRef = useRef(0);
  useEffect(() => {
    if (isMonitoring) {
      setCountdown(intervalTime);
      countdownRef.current = setInterval(() => {
        if (document.visibilityState !== "visible") return;
        setCountdown((prev) => {
          if (prev <= 0) {
            return 0;
          }
          return prev - 1;
        });
      }, 1e3);
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
  const toggleMonitor = async (game) => {
    setMonitoredGames((prev) => {
      const exists = prev.find((g) => g.id === game.id);
      if (exists) {
        return prev.filter((g) => g.id !== game.id);
      } else {
        fetch("/api/monitor-game", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ game })
        }).catch(console.error);
        return [...prev, game];
      }
    });
  };
  const selectGame = async (gameId) => {
    if (selectedGameId === gameId) {
      setSelectedGameId(null);
      setLineups(null);
      return;
    }
    setSelectedGameId(gameId);
    setIsLoadingLineups(true);
    const data = await api.getGamePlayers(gameId);
    setLineups(data);
    setIsLoadingLineups(false);
  };
  const addPlayer = (gamePlayer) => {
    if (players.some((p) => p.sofaId === gamePlayer.id)) {
      addLog(`${gamePlayer.name} j\xE1 est\xE1 no radar`, "alert");
      return;
    }
    if (!selectedGameId) return;
    const initialStats = gamePlayer.statistics ? {
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
    const newPlayer = {
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
    setPlayers((prev) => [...prev, newPlayer]);
    addLog(`${gamePlayer.name} monitorado`, "success");
    addToast(`${gamePlayer.name} adicionado!`, "success");
  };
  const renderHelpModal = () => /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300", children: /* @__PURE__ */ jsxs("div", { className: "bg-zinc-900 border border-emerald-500/30 w-full max-w-sm rounded-[2rem] p-6 relative shadow-[0_0_50px_rgba(16,185,129,0.15)] overflow-y-auto max-h-[90vh]", children: [
    /* @__PURE__ */ jsx("button", { onClick: () => setIsHelpOpen(false), className: "absolute top-4 right-4 p-2 bg-black/20 rounded-full text-zinc-400 hover:text-white transition-colors", children: /* @__PURE__ */ jsx(X, { size: 20 }) }),
    /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center text-center gap-4 mt-2", children: [
      /* @__PURE__ */ jsx("div", { className: "w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mb-1 animate-pulse", children: /* @__PURE__ */ jsx(Bell, { size: 32, className: "text-emerald-500" }) }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h3", { className: "text-xl font-black uppercase text-white tracking-tight mb-2", children: "Ajuda & Configura\xE7\xE3o" }),
        /* @__PURE__ */ jsx("p", { className: "text-[11px] text-zinc-400 leading-relaxed font-medium mb-4 px-2 italic", children: "Configure seu Android para garantir que o monitoramento funcione em segundo plano." })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "bg-black/40 p-5 rounded-2xl text-left w-full border border-white/5 space-y-4", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex gap-4", children: [
          /* @__PURE__ */ jsx("div", { className: "w-7 h-7 bg-emerald-500/20 rounded-lg flex items-center justify-center text-xs font-bold text-emerald-400 shrink-0", children: "1" }),
          /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
            /* @__PURE__ */ jsx("p", { className: "text-[11px] text-zinc-300 font-bold uppercase", children: "Bateria & Otimiza\xE7\xE3o" }),
            /* @__PURE__ */ jsx("p", { className: "text-[10px] text-zinc-500", children: "O Android mata apps em segundo plano. Para evitar isso:" }),
            /* @__PURE__ */ jsx("div", { className: "bg-zinc-800/50 p-2 rounded-lg border border-white/5 mt-1", children: /* @__PURE__ */ jsxs("p", { className: "text-[9px] text-zinc-400", children: [
              "1. Abra ",
              /* @__PURE__ */ jsx("strong", { children: "Configura\xE7\xF5es" }),
              " do Android",
              /* @__PURE__ */ jsx("br", {}),
              "2. V\xE1 em ",
              /* @__PURE__ */ jsx("strong", { children: "Aplicativos" }),
              " > ",
              /* @__PURE__ */ jsx("strong", { children: "LiveMatch Tracker" }),
              /* @__PURE__ */ jsx("br", {}),
              "3. Toque em ",
              /* @__PURE__ */ jsx("strong", { children: "Bateria" }),
              /* @__PURE__ */ jsx("br", {}),
              "4. Selecione ",
              /* @__PURE__ */ jsx("strong", { children: '"Sem Restri\xE7\xF5es"' }),
              ' (ou "N\xE3o Otimizar")'
            ] }) })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex gap-4", children: [
          /* @__PURE__ */ jsx("div", { className: "w-7 h-7 bg-emerald-500/20 rounded-lg flex items-center justify-center text-xs font-bold text-emerald-400 shrink-0", children: "2" }),
          /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
            /* @__PURE__ */ jsx("p", { className: "text-[11px] text-zinc-300 font-bold uppercase", children: "Notifica\xE7\xF5es Bloqueadas?" }),
            /* @__PURE__ */ jsx("p", { className: "text-[10px] text-zinc-500", children: "Se o bot\xE3o de notifica\xE7\xE3o estiver cinza nas configura\xE7\xF5es:" }),
            /* @__PURE__ */ jsxs("ul", { className: "list-disc pl-4 text-[9px] text-zinc-500 space-y-1 mt-1", children: [
              /* @__PURE__ */ jsx("li", { children: "Toque nos 3 pontinhos (canto superior)" }),
              /* @__PURE__ */ jsx("li", { children: '"Permitir configura\xE7\xF5es restritas"' })
            ] })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "flex flex-col w-full gap-3 mt-4", children: /* @__PURE__ */ jsx("button", { onClick: async () => {
        if (Capacitor.isNativePlatform()) {
          await requestNativePermissions();
        } else if ("Notification" in window) {
          await Notification.requestPermission();
        }
        setIsHelpOpen(false);
      }, className: "w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase tracking-widest rounded-xl transition-all active:scale-95 shadow-lg shadow-emerald-900/20", children: "Solicitar Permiss\xF5es" }) })
    ] })
  ] }) });
  const Heatmap = ({ eventId, playerId }) => {
    return /* @__PURE__ */ jsxs("div", { className: "relative w-full h-full flex items-center justify-center", children: [
      /* @__PURE__ */ jsx(
        SofaHeatmap,
        {
          eventId,
          playerId,
          className: "w-full h-full object-contain relative z-10"
        }
      ),
      /* @__PURE__ */ jsx("div", { className: "absolute bottom-3 right-3 z-20", children: /* @__PURE__ */ jsx("div", { className: "px-2 py-1 bg-black/60 backdrop-blur-md rounded-lg border border-white/10 text-[7px] font-black text-zinc-400 uppercase tracking-widest", children: "Atualizado em tempo real" }) })
    ] });
  };
  const PlayerDetailsModal = ({ player, onClose }) => {
    if (!player || !player.lastStats) return null;
    const s = player.lastStats;
    return /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300", children: /* @__PURE__ */ jsxs("div", { className: "bg-zinc-900/95 backdrop-blur-xl w-full max-w-md rounded-[2.5rem] border border-white/10 p-8 relative shadow-2xl overflow-y-auto max-h-[90vh] ring-1 ring-white/5", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-start mb-8", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-5", children: [
          /* @__PURE__ */ jsx("div", { className: "w-20 h-20 bg-black rounded-3xl border border-white/10 overflow-hidden shadow-2xl ring-1 ring-black/50", children: /* @__PURE__ */ jsx(SofaImage, { playerId: player.sofaId, alt: player.name, className: "w-full h-full object-cover" }) }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("h3", { className: "text-2xl font-black uppercase text-white tracking-tighter leading-none mb-2", children: player.name }),
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
              /* @__PURE__ */ jsxs("span", { className: `px-3 py-1 rounded-xl text-xs font-black font-mono shadow-lg ${s.rating >= 7 ? "bg-emerald-500 text-black" : "bg-zinc-800 text-white"}`, children: [
                s.rating.toFixed(1),
                " ",
                /* @__PURE__ */ jsx("span", { className: "opacity-60 ml-1 text-[10px]", children: "RATING" })
              ] }),
              /* @__PURE__ */ jsxs("span", { className: "text-[10px] text-zinc-500 font-black uppercase tracking-widest bg-white/5 px-3 py-1 rounded-lg border border-white/5", children: [
                s.minutes,
                "' JOGADOS"
              ] })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsx("button", { onClick: onClose, className: "bg-white/5 p-2.5 rounded-full text-zinc-400 hover:text-white transition-colors", children: /* @__PURE__ */ jsx(X, { size: 24 }) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-8", children: [
        /* @__PURE__ */ jsxs("div", { className: "animate-in slide-in-from-bottom-2 duration-300 delay-75", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 mb-4", children: [
            /* @__PURE__ */ jsx("div", { className: "w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20", children: /* @__PURE__ */ jsx(Target, { size: 16, className: "text-blue-400" }) }),
            /* @__PURE__ */ jsx("h4", { className: "text-xs font-black uppercase text-white tracking-[0.2em]", children: "Ataque" })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-3 gap-3", children: [
            /* @__PURE__ */ jsxs("div", { className: "bg-black/30 p-4 rounded-2xl border border-white/5 text-center group hover:bg-black/40 transition-colors", children: [
              /* @__PURE__ */ jsx("div", { className: "text-2xl font-black text-white font-mono mb-0.5", children: s.goals }),
              /* @__PURE__ */ jsx("div", { className: "text-[9px] font-black text-zinc-500 uppercase tracking-widest", children: "Gols" })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "bg-black/30 p-4 rounded-2xl border border-white/5 text-center group hover:bg-black/40 transition-colors", children: [
              /* @__PURE__ */ jsx("div", { className: "text-2xl font-black text-white font-mono mb-0.5", children: s.assists }),
              /* @__PURE__ */ jsx("div", { className: "text-[9px] font-black text-zinc-500 uppercase tracking-widest", children: "Assists" })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "bg-black/30 p-4 rounded-2xl border border-white/5 text-center group hover:bg-black/40 transition-colors", children: [
              /* @__PURE__ */ jsxs("div", { className: "text-2xl font-black text-white font-mono mb-0.5", children: [
                s.shotsOnTarget,
                /* @__PURE__ */ jsx("span", { className: "text-zinc-600 text-sm mx-0.5", children: "/" }),
                s.shotsTotal
              ] }),
              /* @__PURE__ */ jsx("div", { className: "text-[9px] font-black text-zinc-500 uppercase tracking-widest", children: "Chutes (Alvo)" })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "animate-in slide-in-from-bottom-2 duration-300 delay-150", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 mb-4", children: [
            /* @__PURE__ */ jsx("div", { className: "w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20", children: /* @__PURE__ */ jsx(Activity, { size: 16, className: "text-emerald-400" }) }),
            /* @__PURE__ */ jsx("h4", { className: "text-xs font-black uppercase text-white tracking-[0.2em]", children: "Constru\xE7\xE3o" })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-3 gap-3", children: [
            /* @__PURE__ */ jsxs("div", { className: "bg-black/30 p-4 rounded-2xl border border-white/5 text-center group hover:bg-black/40 transition-colors", children: [
              /* @__PURE__ */ jsx("div", { className: "text-2xl font-black text-white font-mono mb-0.5", children: s.keyPasses }),
              /* @__PURE__ */ jsx("div", { className: "text-[9px] font-black text-zinc-500 uppercase tracking-widest", children: "Passes Dec." })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "bg-black/30 p-4 rounded-2xl border border-white/5 text-center group hover:bg-black/40 transition-colors", children: [
              /* @__PURE__ */ jsx("div", { className: "text-2xl font-black text-white font-mono mb-0.5", children: s.totalPasses }),
              /* @__PURE__ */ jsx("div", { className: "text-[9px] font-black text-zinc-500 uppercase tracking-widest", children: "Passes Tot." })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "bg-black/30 p-4 rounded-2xl border border-white/5 text-center group hover:bg-black/40 transition-colors", children: [
              /* @__PURE__ */ jsx("div", { className: "text-2xl font-black text-white font-mono mb-0.5", children: s.foulsDrawn }),
              /* @__PURE__ */ jsx("div", { className: "text-[9px] font-black text-zinc-500 uppercase tracking-widest", children: "Sofridas" })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "animate-in slide-in-from-bottom-2 duration-300 delay-200", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 mb-4", children: [
            /* @__PURE__ */ jsx("div", { className: "w-8 h-8 rounded-xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20", children: /* @__PURE__ */ jsx(Shield, { size: 16, className: "text-orange-400" }) }),
            /* @__PURE__ */ jsx("h4", { className: "text-xs font-black uppercase text-white tracking-[0.2em]", children: "Defesa" })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-3 gap-3", children: [
            /* @__PURE__ */ jsxs("div", { className: "bg-black/30 p-4 rounded-2xl border border-white/5 text-center group hover:bg-black/40 transition-colors", children: [
              /* @__PURE__ */ jsx("div", { className: "text-2xl font-black text-white font-mono mb-0.5", children: s.tackles }),
              /* @__PURE__ */ jsx("div", { className: "text-[9px] font-black text-zinc-500 uppercase tracking-widest", children: "Desarmes" })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "bg-black/30 p-4 rounded-2xl border border-white/5 text-center group hover:bg-black/40 transition-colors", children: [
              /* @__PURE__ */ jsx("div", { className: "text-2xl font-black text-white font-mono mb-0.5", children: s.interceptions }),
              /* @__PURE__ */ jsx("div", { className: "text-[9px] font-black text-zinc-500 uppercase tracking-widest", children: "Intercep." })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "bg-black/30 p-4 rounded-2xl border border-white/5 text-center group hover:bg-black/40 transition-colors", children: [
              /* @__PURE__ */ jsx("div", { className: "text-2xl font-black text-white font-mono mb-0.5", children: s.duelsWon }),
              /* @__PURE__ */ jsx("div", { className: "text-[9px] font-black text-zinc-500 uppercase tracking-widest", children: "Duelos" })
            ] })
          ] })
        ] })
      ] })
    ] }) });
  };
  const removePlayer = (id) => setPlayers((prev) => prev.filter((p) => p.id !== id));
  const toggleAlert = (playerId, key) => {
    setPlayers((prev) => prev.map((p) => {
      if (p.id !== playerId) return p;
      return { ...p, alerts: { ...p.alerts, [key]: !p.alerts[key] } };
    }));
  };
  const renderPlayerCard = (p) => {
    const s = p.lastStats || {
      tackles: 0,
      fouls: 0,
      foulsDrawn: 0,
      shotsTotal: 0,
      shotsOnTarget: 0,
      yellowCards: 0,
      redCards: 0,
      rating: 0,
      goals: 0,
      assists: 0,
      keyPasses: 0,
      totalPasses: 0,
      interceptions: 0,
      duelsWon: 0,
      minutes: 0,
      isSubstitute: false,
      displayName: p.name,
      playerId: p.sofaId
    };
    const isUpdated = updatedPlayersIds.has(p.id);
    const game = monitoredGames.find((g) => g.id === p.eventId) || liveGames.find((g) => g.id === p.eventId);
    const isHalftime = game?.statusCode === 31 || game?.status === "Halftime" || game?.status === "HT" || game?.status === "Intervalo" || game?.status === "Break" || game?.status === "Half time";
    const isEnded = game?.statusCode === 100 || game?.statusCode === 106 || game?.statusCode === 120 || game?.status === "Ended" || game?.status === "FT" || game?.status === "Fim" || game?.status === "Full time";
    const gameStatusText = isHalftime ? "Intervalo" : isEnded ? "Fim" : "Ao Vivo";
    const isLive = !isHalftime && !isEnded;
    const monitorItems = [
      { key: "tackles", label: "Desarmes", val: s.tackles, icon: Shield },
      { key: "fouls", label: "Cometidas", val: s.fouls, icon: AlertTriangle },
      { key: "foulsDrawn", label: "Sofridas", val: s.foulsDrawn, icon: Flag },
      { key: "shots", label: "Chutes", val: s.shotsTotal, icon: Footprints },
      { key: "shotsOn", label: "No Alvo", val: s.shotsOnTarget, icon: Target },
      { key: "yellow", label: "Cart\xF5es", val: s.yellowCards + s.redCards, icon: BadgeAlert, isCard: true },
      { key: "subOut", label: "Sa\xEDda", val: s.minutes > 0 ? "ON" : "OFF", icon: LogOut }
    ];
    return /* @__PURE__ */ jsxs("div", { className: `bg-gradient-to-br from-zinc-900 to-black rounded-[2rem] border transition-all duration-500 overflow-hidden relative shadow-2xl group ${isUpdated ? "border-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.3)] scale-[1.02] ring-1 ring-emerald-500/50" : "border-zinc-800 hover:border-zinc-700"}`, children: [
      isUpdated && /* @__PURE__ */ jsx("div", { className: "absolute inset-0 bg-emerald-500/10 animate-pulse pointer-events-none z-0" }),
      /* @__PURE__ */ jsxs("div", { className: "p-5 flex gap-4 items-center border-b border-white/5 bg-white/[0.02]", children: [
        /* @__PURE__ */ jsxs("div", { className: "relative", children: [
          /* @__PURE__ */ jsx("div", { className: "w-14 h-14 bg-black rounded-2xl border border-zinc-700 overflow-hidden shadow-lg relative z-10", children: /* @__PURE__ */ jsx(SofaImage, { playerId: p.sofaId, alt: p.name, className: "w-full h-full object-cover" }) }),
          s.rating > 0 && /* @__PURE__ */ jsx("div", { className: `absolute -bottom-2 -right-2 z-20 px-1.5 py-0.5 rounded-lg border border-black/50 shadow-md text-[10px] font-black font-mono ${s.rating >= 7 ? "bg-emerald-500 text-black" : "bg-zinc-800 text-white"}`, children: s.rating.toFixed(1) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex-1 min-w-0", children: [
          /* @__PURE__ */ jsx("h3", { className: "font-black text-white text-lg leading-tight uppercase tracking-tight truncate", children: p.name }),
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 mt-1", children: [
            /* @__PURE__ */ jsxs("div", { className: `flex items-center gap-1.5 px-2 py-0.5 rounded-md border ${isLive ? "bg-emerald-500/10 border-emerald-500/10" : isHalftime ? "bg-amber-500/10 border-amber-500/10" : "bg-zinc-800/50 border-white/5"}`, children: [
              isLive && /* @__PURE__ */ jsx("div", { className: "w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" }),
              /* @__PURE__ */ jsx("span", { className: `text-[9px] font-black tracking-widest uppercase ${isLive ? "text-emerald-400" : isHalftime ? "text-amber-400" : "text-zinc-400"}`, children: gameStatusText })
            ] }),
            /* @__PURE__ */ jsx("div", { className: "flex items-center gap-1.5 bg-zinc-800/50 px-2 py-0.5 rounded-md border border-white/5", children: /* @__PURE__ */ jsxs("span", { className: "text-[9px] text-zinc-300 font-black tracking-widest uppercase", children: [
              s.minutes,
              "'"
            ] }) }),
            /* @__PURE__ */ jsxs("button", { onClick: () => setSelectedPlayerDetails(p), className: "text-[9px] font-bold uppercase text-zinc-500 hover:text-white flex items-center gap-1 bg-zinc-800/50 px-2 py-0.5 rounded-md transition-colors", children: [
              /* @__PURE__ */ jsx(Plus, { size: 10 }),
              " Detalhes"
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsx("button", { onClick: () => removePlayer(p.id), className: "w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-800/50 text-zinc-500 hover:bg-red-500/20 hover:text-red-400 transition-colors", children: /* @__PURE__ */ jsx(Trash2, { size: 16 }) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "p-4 bg-black/20", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 mb-3 px-1", children: [
          /* @__PURE__ */ jsx(Activity, { size: 12, className: "text-zinc-600" }),
          /* @__PURE__ */ jsx("span", { className: "text-[9px] font-black uppercase tracking-[0.2em] text-zinc-600", children: "Painel de Alertas" })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "grid grid-cols-3 gap-2", children: monitorItems.map((item) => {
          const isActive = p.alerts[item.key];
          const Icon = item.icon;
          return /* @__PURE__ */ jsxs(
            "button",
            {
              onClick: () => toggleAlert(p.id, item.key),
              className: `
                                    relative p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all duration-200 active:scale-95 group/btn
                                    ${isActive ? "bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.05)]" : "bg-zinc-900/50 border-white/5 opacity-60 hover:opacity-100 hover:bg-zinc-800"}
                                `,
              children: [
                /* @__PURE__ */ jsxs("div", { className: "flex w-full justify-between items-start", children: [
                  /* @__PURE__ */ jsx(Icon, { size: 12, className: isActive ? "text-emerald-400" : "text-zinc-600" }),
                  /* @__PURE__ */ jsx("span", { className: `font-mono font-black text-lg leading-none ${isActive ? "text-white" : "text-zinc-500"}`, children: item.val })
                ] }),
                /* @__PURE__ */ jsx("span", { className: `text-[9px] font-black uppercase tracking-tight w-full text-left truncate ${isActive ? "text-emerald-400" : "text-zinc-600"}`, children: item.label }),
                /* @__PURE__ */ jsx("div", { className: `absolute top-2 right-2 w-1.5 h-1.5 rounded-full transition-colors ${isActive ? "bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,1)]" : "bg-zinc-800"}` })
              ]
            },
            item.key
          );
        }) })
      ] })
    ] }, p.id);
  };
  const renderMonitor = () => /* @__PURE__ */ jsxs("div", { className: "space-y-6 pb-32 safe-area-top animate-in fade-in duration-500", children: [
    /* @__PURE__ */ jsx("div", { className: "bg-zinc-950/80 backdrop-blur-xl p-6 border-b border-white/5 sticky top-0 z-30 shadow-2xl safe-area-top pt-safe-top", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between max-w-7xl mx-auto", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-6", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex flex-col", children: [
          /* @__PURE__ */ jsx("span", { className: "text-[9px] text-zinc-500 font-black uppercase tracking-[0.2em] leading-none mb-1.5", children: "Status do Sistema" }),
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
            /* @__PURE__ */ jsxs("div", { className: `relative flex h-3 w-3 ${isMonitoring ? "" : "opacity-50"}`, children: [
              isMonitoring && /* @__PURE__ */ jsx("span", { className: "animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" }),
              /* @__PURE__ */ jsx("span", { className: `relative inline-flex rounded-full h-3 w-3 ${isMonitoring ? "bg-emerald-500" : "bg-zinc-600"}` })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "flex flex-col", children: [
              /* @__PURE__ */ jsx("span", { className: `text-lg font-black tracking-tight leading-none ${isMonitoring ? "text-white" : "text-zinc-500"}`, children: isMonitoring ? "MONITORANDO" : "PAUSADO" }),
              isMonitoring && /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 mt-1", children: [
                /* @__PURE__ */ jsx("span", { className: "text-[8px] font-bold text-zinc-500 uppercase tracking-tighter", children: lastSync }),
                /* @__PURE__ */ jsx("button", { onClick: forceUpdate, className: "md:hidden text-emerald-500 active:scale-90 transition-transform", children: /* @__PURE__ */ jsx(RefreshCw, { size: 10 }) })
              ] })
            ] })
          ] })
        ] }),
        isMonitoring && /* @__PURE__ */ jsxs("div", { className: "hidden md:flex flex-col border-l border-white/10 pl-6", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 mb-1.5", children: [
            /* @__PURE__ */ jsx("span", { className: "text-[9px] text-zinc-500 font-black uppercase tracking-[0.2em] leading-none", children: "Pr\xF3xima Varredura" }),
            /* @__PURE__ */ jsx("button", { onClick: forceUpdate, className: "text-emerald-500 hover:text-emerald-400 transition-colors", children: /* @__PURE__ */ jsx(RefreshCw, { size: 10 }) })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex items-baseline gap-1", children: [
            /* @__PURE__ */ jsx("span", { className: "text-lg font-mono text-emerald-400 font-black", children: countdown }),
            /* @__PURE__ */ jsx("span", { className: "text-[10px] text-zinc-600 font-bold uppercase", children: "segundos" })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex gap-3", children: [
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: handleStartMonitoring,
            className: `
                        h-12 px-6 rounded-2xl font-black flex items-center gap-3 transition-all active:scale-95 shadow-lg uppercase text-xs tracking-widest ring-1 ring-inset
                        ${isMonitoring ? "bg-red-500/10 text-red-500 ring-red-500/20 hover:bg-red-500/20" : "bg-emerald-500 text-black ring-emerald-400 hover:bg-emerald-400 shadow-emerald-500/20"}
                    `,
            children: isMonitoring ? /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx(Square, { size: 16, fill: "currentColor" }),
              /* @__PURE__ */ jsx("span", { className: "hidden md:inline", children: "Parar" })
            ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx(Play, { size: 16, fill: "currentColor" }),
              /* @__PURE__ */ jsx("span", { className: "hidden md:inline", children: "Iniciar" })
            ] })
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => setIsSettingsOpen(true),
            className: "h-12 w-12 flex items-center justify-center bg-zinc-900 text-zinc-400 border border-zinc-800 rounded-2xl hover:text-white hover:border-zinc-700 transition-colors active:scale-95",
            children: /* @__PURE__ */ jsx(Settings, { size: 20 })
          }
        )
      ] })
    ] }) }),
    /* @__PURE__ */ jsx("div", { className: "px-6 max-w-7xl mx-auto", children: players.length === 0 ? /* @__PURE__ */ jsxs("div", { className: "text-center py-32 flex flex-col items-center gap-8 opacity-60 animate-in zoom-in-95 duration-500", children: [
      /* @__PURE__ */ jsx("div", { className: "w-24 h-24 bg-zinc-900 rounded-[2.5rem] flex items-center justify-center border border-zinc-800 shadow-2xl rotate-3", children: /* @__PURE__ */ jsx(Activity, { size: 40, className: "text-zinc-600" }) }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h3", { className: "text-xl font-black uppercase text-white tracking-tight mb-2", children: "Radar Vazio" }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-zinc-500 font-medium max-w-[250px] mx-auto leading-relaxed", children: "Adicione jogadores de partidas ao vivo para come\xE7ar a receber alertas em tempo real." })
      ] }),
      /* @__PURE__ */ jsxs(
        "button",
        {
          onClick: () => {
            setActiveTab("search");
            fetchGames();
          },
          className: "group bg-white text-black px-8 py-4 rounded-full text-xs font-black uppercase tracking-widest active:scale-95 hover:bg-zinc-200 transition-colors shadow-xl shadow-white/10 flex items-center gap-3",
          children: [
            /* @__PURE__ */ jsx(Plus, { size: 16, className: "group-hover:rotate-90 transition-transform duration-300" }),
            "Adicionar Jogador"
          ]
        }
      )
    ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-end mb-8 px-2", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("h2", { className: "text-3xl font-black uppercase text-white tracking-tighter mb-1", children: "Jogadores" }),
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-zinc-500", children: [
            /* @__PURE__ */ jsx(Activity, { size: 14, className: "text-emerald-500" }),
            /* @__PURE__ */ jsxs("span", { className: "text-xs font-bold uppercase tracking-widest", children: [
              players.length,
              " Monitorados"
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs(
          "button",
          {
            onClick: () => setIsClearConfirmOpen(true),
            className: "text-[10px] font-black uppercase text-red-400 bg-red-500/5 px-4 py-2 rounded-xl border border-red-500/10 flex items-center gap-2 hover:bg-red-500/10 transition-colors active:scale-95",
            children: [
              /* @__PURE__ */ jsx(Trash2, { size: 14 }),
              " Limpar Lista"
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6", children: players.map((p) => renderPlayerCard(p)) })
    ] }) })
  ] });
  const renderSearch = () => /* @__PURE__ */ jsxs("div", { className: "pb-32 safe-area-top animate-in slide-in-from-bottom-4 duration-500", children: [
    /* @__PURE__ */ jsx("div", { className: "sticky top-0 bg-zinc-950/90 backdrop-blur-xl pt-safe-top pb-6 z-30 px-6 border-b border-white/5 mb-6 shadow-2xl", children: /* @__PURE__ */ jsxs("div", { className: "max-w-7xl mx-auto pt-4", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-3xl font-black uppercase text-white tracking-tighter mb-4", children: "Buscar Partida" }),
      /* @__PURE__ */ jsxs("div", { className: "flex gap-3", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center px-5 focus-within:border-emerald-500/50 focus-within:bg-zinc-900/80 transition-all shadow-inner ring-1 ring-white/5 group", children: [
          /* @__PURE__ */ jsx(Search, { size: 20, className: "text-zinc-600 group-focus-within:text-emerald-500 transition-colors" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "text",
              placeholder: "Buscar times, campeonatos...",
              value: searchTerm,
              onChange: (e) => setSearchTerm(e.target.value),
              className: "bg-transparent border-none outline-none text-white p-4 w-full text-base font-bold placeholder:text-zinc-700"
            }
          )
        ] }),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: fetchGames,
            disabled: isLoadingGames,
            className: "bg-emerald-500 text-black w-16 rounded-2xl font-black active:scale-90 flex items-center justify-center hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-900/20",
            children: /* @__PURE__ */ jsx(RefreshCw, { size: 24, className: isLoadingGames ? "animate-spin" : "" })
          }
        )
      ] })
    ] }) }),
    /* @__PURE__ */ jsx("div", { className: "px-6 max-w-7xl mx-auto", children: !selectedGameId ? /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5", children: [
      liveGames.length === 0 && !isLoadingGames && /* @__PURE__ */ jsxs("div", { className: "text-center py-32 flex flex-col items-center col-span-full opacity-50", children: [
        /* @__PURE__ */ jsx("div", { className: "w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center mb-4", children: /* @__PURE__ */ jsx(Search, { size: 32, className: "text-zinc-700" }) }),
        /* @__PURE__ */ jsx("p", { className: "font-black text-zinc-500 uppercase text-xs tracking-[0.2em]", children: "Nenhum jogo encontrado" })
      ] }),
      liveGames.filter((g) => api.normalizeString(g.homeTeam.name).includes(api.normalizeString(searchTerm)) || api.normalizeString(g.awayTeam.name).includes(api.normalizeString(searchTerm))).map((game) => /* @__PURE__ */ jsx(GameCard, { game, onClick: selectGame, isMonitored: monitoredGames.some((g) => g.id === game.id), onToggleMonitor: toggleMonitor }, game.id))
    ] }) : /* @__PURE__ */ jsxs("div", { className: "animate-in slide-in-from-right duration-500", children: [
      /* @__PURE__ */ jsxs(
        "button",
        {
          onClick: () => setSelectedGameId(null),
          className: "mb-8 text-zinc-400 hover:text-white flex items-center gap-3 text-[10px] font-black uppercase tracking-widest bg-zinc-900 px-6 py-4 rounded-2xl border border-zinc-800 active:scale-95 transition-all hover:bg-zinc-800",
          children: [
            /* @__PURE__ */ jsx("div", { className: "bg-zinc-800 p-1 rounded-md", children: /* @__PURE__ */ jsx(X, { size: 12 }) }),
            "Voltar para Lista"
          ]
        }
      ),
      isLoadingLineups ? /* @__PURE__ */ jsxs("div", { className: "text-center py-40 flex flex-col items-center", children: [
        /* @__PURE__ */ jsxs("div", { className: "relative w-16 h-16 mb-8", children: [
          /* @__PURE__ */ jsx("div", { className: "absolute inset-0 border-4 border-zinc-800 rounded-full" }),
          /* @__PURE__ */ jsx("div", { className: "absolute inset-0 border-4 border-emerald-500 rounded-full border-t-transparent animate-spin" })
        ] }),
        /* @__PURE__ */ jsx("span", { className: "font-black uppercase tracking-[0.3em] text-[10px] text-zinc-500", children: "Carregando Escala\xE7\xF5es..." })
      ] }) : lineups ? /* @__PURE__ */ jsx("div", { className: "w-full max-w-full md:max-w-6xl mx-auto", children: /* @__PURE__ */ jsx(SoccerField, { lineups, onSelectPlayer: addPlayer }) }) : /* @__PURE__ */ jsx("div", { className: "text-center text-red-400 py-20 font-black uppercase text-xs tracking-widest bg-red-500/5 rounded-3xl border border-red-500/10", children: "\u26A0\uFE0F Escala\xE7\xE3o indispon\xEDvel" })
    ] }) })
  ] });
  if (!isAuthReady) {
    return /* @__PURE__ */ jsx("div", { className: "min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100", children: "Carregando..." });
  }
  return /* @__PURE__ */ jsxs("div", { className: "min-h-screen font-sans bg-zinc-950 text-zinc-100 selection:bg-emerald-500/30 pb-24 md:pb-0", children: [
    updateAvailable && /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-[300] bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-200", children: /* @__PURE__ */ jsxs("div", { className: "bg-zinc-900 w-full max-w-sm rounded-[2.5rem] border border-emerald-500/30 p-8 text-center shadow-2xl ring-1 ring-emerald-500/20 relative overflow-hidden", children: [
      /* @__PURE__ */ jsx("div", { className: "absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-emerald-600" }),
      /* @__PURE__ */ jsx("div", { className: "w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6 mx-auto ring-1 ring-emerald-500/20", children: /* @__PURE__ */ jsx(Download, { size: 32, className: "text-emerald-500" }) }),
      /* @__PURE__ */ jsx("h3", { className: "text-2xl font-black uppercase text-white mb-3 tracking-tight", children: "Nova Atualiza\xE7\xE3o!" }),
      /* @__PURE__ */ jsx("p", { className: "text-sm text-zinc-400 mb-8 leading-relaxed px-4", children: "Uma nova vers\xE3o do aplicativo est\xE1 dispon\xEDvel com melhorias e corre\xE7\xF5es." }),
      /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-3", children: [
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: handleUpdate,
            disabled: isUpdating,
            className: "w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase rounded-2xl transition-colors text-xs tracking-widest shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed",
            children: isUpdating ? `Atualizando... ${updateProgress}%` : "Instalar Atualiza\xE7\xE3o"
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => setUpdateAvailable(false),
            disabled: isUpdating,
            className: "w-full py-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-black uppercase rounded-2xl transition-colors text-xs tracking-widest disabled:opacity-50",
            children: "Lembrar Mais Tarde"
          }
        )
      ] })
    ] }) }),
    /* @__PURE__ */ jsx("div", { className: "fixed top-6 right-6 z-[100] pointer-events-none flex flex-col items-end gap-3", children: toasts.map((t) => /* @__PURE__ */ jsxs("div", { className: "bg-emerald-500 text-black px-6 py-3 rounded-2xl shadow-2xl font-black text-xs uppercase tracking-wide border border-white/20 flex items-center gap-3 animate-in slide-in-from-right-10 fade-in duration-300", children: [
      /* @__PURE__ */ jsx(Activity, { size: 16, strokeWidth: 3 }),
      t.msg
    ] }, t.id)) }),
    isHelpOpen && renderHelpModal(),
    selectedPlayerDetails && /* @__PURE__ */ jsx(PlayerDetailsModal, { player: selectedPlayerDetails, onClose: () => setSelectedPlayerDetails(null) }),
    isSettingsOpen && /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-[200] bg-black/60 backdrop-blur-xl flex items-end md:items-center justify-center p-4 animate-in fade-in duration-300 safe-area-bottom", children: /* @__PURE__ */ jsxs("div", { className: "bg-zinc-900/90 w-full max-w-sm rounded-[2.5rem] border border-white/10 p-8 relative shadow-2xl ring-1 ring-white/5", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center mb-8", children: [
        /* @__PURE__ */ jsx("h3", { className: "text-xl font-black uppercase text-white tracking-tight", children: "Configura\xE7\xF5es" }),
        /* @__PURE__ */ jsx("button", { onClick: () => setIsSettingsOpen(false), className: "bg-white/5 p-2 rounded-full text-zinc-400 hover:text-white transition-colors", children: /* @__PURE__ */ jsx(X, { size: 20 }) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-6", children: [
        /* @__PURE__ */ jsxs("div", { className: "bg-black/20 p-5 rounded-3xl border border-white/5", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center mb-2", children: [
            /* @__PURE__ */ jsx("span", { className: "text-xs font-bold text-zinc-400 uppercase tracking-wider", children: "Intervalo de Varredura" }),
            /* @__PURE__ */ jsxs("span", { className: "text-xl font-black text-emerald-400 font-mono", children: [
              intervalTime,
              "s"
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "text-[9px] text-zinc-600 font-bold uppercase mb-4 tracking-tighter", children: intervalTime >= 60 ? "\u2705 Recomendado para Segundo Plano" : "\u26A0\uFE0F Pode ser pausado pelo sistema" }),
          /* @__PURE__ */ jsx("input", { type: "range", min: "10", max: "120", step: "5", value: intervalTime, onChange: (e) => setIntervalTime(Number(e.target.value)), className: "w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500" })
        ] }),
        /* @__PURE__ */ jsxs("button", { onClick: () => setIsMuted(!isMuted), className: `w-full p-5 rounded-3xl border flex items-center justify-between transition-all active:scale-[0.98] ${isMuted ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-zinc-800/50 border-white/5 text-zinc-300 hover:bg-zinc-800"}`, children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4", children: [
            /* @__PURE__ */ jsx("div", { className: `p-3 rounded-2xl ${isMuted ? "bg-red-500/20" : "bg-zinc-700/50"}`, children: isMuted ? /* @__PURE__ */ jsx(VolumeX, { size: 20 }) : /* @__PURE__ */ jsx(Volume2, { size: 20 }) }),
            /* @__PURE__ */ jsxs("div", { className: "text-left", children: [
              /* @__PURE__ */ jsx("div", { className: "text-sm font-bold uppercase tracking-wide", children: "Sons de Alerta" }),
              /* @__PURE__ */ jsx("div", { className: "text-[10px] opacity-60 font-medium mt-0.5", children: isMuted ? "Desativado" : "Ativado" })
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", { className: `w-12 h-7 rounded-full p-1 transition-colors ${isMuted ? "bg-zinc-700" : "bg-emerald-500"}`, children: /* @__PURE__ */ jsx("div", { className: `w-5 h-5 bg-white rounded-full shadow-md transition-transform ${isMuted ? "translate-x-0" : "translate-x-5"}` }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
          /* @__PURE__ */ jsxs("button", { onClick: handleSendTestNotification, className: "flex-1 p-4 rounded-2xl bg-zinc-800/50 border border-white/5 text-zinc-300 flex items-center justify-center gap-2 font-bold uppercase text-[10px] tracking-widest hover:bg-zinc-800 transition-colors", children: [
            /* @__PURE__ */ jsx(Bell, { size: 16 }),
            " Testar"
          ] }),
          /* @__PURE__ */ jsxs("button", { onClick: () => setIsHelpOpen(true), className: "flex-1 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center gap-2 font-bold uppercase text-[10px] tracking-widest hover:bg-emerald-500/20 transition-colors", children: [
            /* @__PURE__ */ jsx(BellOff, { size: 16 }),
            " Ajuda"
          ] })
        ] })
      ] })
    ] }) }),
    isClearConfirmOpen && /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-200", children: /* @__PURE__ */ jsxs("div", { className: "bg-zinc-900 w-full max-w-sm rounded-[2.5rem] border border-zinc-800 p-8 text-center shadow-2xl", children: [
      /* @__PURE__ */ jsx("div", { className: "w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6 mx-auto ring-1 ring-red-500/20", children: /* @__PURE__ */ jsx(Trash2, { size: 32, className: "text-red-500" }) }),
      /* @__PURE__ */ jsx("h3", { className: "text-2xl font-black uppercase text-white mb-3 tracking-tight", children: "Limpar Radar?" }),
      /* @__PURE__ */ jsx("p", { className: "text-sm text-zinc-400 mb-8 leading-relaxed px-4", children: "Isso remover\xE1 todos os jogadores da sua lista de monitoramento atual." }),
      /* @__PURE__ */ jsxs("div", { className: "flex gap-3", children: [
        /* @__PURE__ */ jsx("button", { onClick: () => setIsClearConfirmOpen(false), className: "flex-1 py-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-black uppercase rounded-2xl transition-colors text-xs tracking-widest", children: "Cancelar" }),
        /* @__PURE__ */ jsx("button", { onClick: () => {
          setIsMonitoring(false);
          setPlayers([]);
          setIsClearConfirmOpen(false);
        }, className: "flex-1 py-4 bg-red-500 hover:bg-red-600 text-white font-black uppercase rounded-2xl transition-colors text-xs tracking-widest shadow-lg shadow-red-900/20", children: "Limpar Tudo" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs("div", { className: "w-full max-w-7xl mx-auto min-h-screen relative bg-zinc-950 md:border-x md:border-zinc-800/50 shadow-2xl", children: [
      /* @__PURE__ */ jsxs("main", { className: "min-h-screen pb-safe-bottom", children: [
        activeTab === "monitor" && renderMonitor(),
        activeTab === "search" && renderSearch(),
        activeTab === "logs" && /* @__PURE__ */ jsxs("div", { className: "pb-32 px-6 pt-24 animate-in fade-in slide-in-from-bottom-4 duration-500", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-8", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4", children: [
              /* @__PURE__ */ jsx("h2", { className: "font-black text-3xl uppercase text-white tracking-tighter", children: "Live Log" }),
              logs.length > 0 && /* @__PURE__ */ jsx(
                "button",
                {
                  onClick: () => {
                    setLogs([]);
                    addToast("Logs limpos", "success");
                  },
                  className: "p-2 bg-zinc-800 rounded-xl text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors active:scale-95",
                  title: "Limpar Logs",
                  children: /* @__PURE__ */ jsx(Trash2, { size: 18 })
                }
              )
            ] }),
            /* @__PURE__ */ jsxs("span", { className: "text-xs font-bold text-zinc-500 bg-zinc-900 px-3 py-1 rounded-full border border-zinc-800", children: [
              logs.length,
              " Eventos"
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "space-y-3", children: logs.map((log) => /* @__PURE__ */ jsxs("div", { className: `p-4 rounded-2xl border flex items-start gap-3 transition-all hover:scale-[1.01] ${log.type === "success" ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-100" : "bg-zinc-900/50 border-zinc-800 text-zinc-400"}`, children: [
            /* @__PURE__ */ jsx("div", { className: `mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${log.type === "success" ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-zinc-600"}` }),
            /* @__PURE__ */ jsxs("div", { className: "flex-1", children: [
              /* @__PURE__ */ jsx("div", { className: "text-[10px] font-mono opacity-50 mb-1 tracking-wider", children: log.time }),
              /* @__PURE__ */ jsx("div", { className: "text-sm font-medium leading-snug", children: log.message })
            ] })
          ] }, log.id)) })
        ] })
      ] }),
      /* @__PURE__ */ jsx("nav", { className: "fixed bottom-8 left-0 right-0 z-50 safe-area-bottom pointer-events-none flex justify-center px-6", children: /* @__PURE__ */ jsx("div", { className: "bg-zinc-900/80 backdrop-blur-2xl border border-white/10 p-2 rounded-[2.5rem] shadow-2xl shadow-black/50 flex justify-between w-full max-w-[360px] pointer-events-auto ring-1 ring-white/5", children: ["monitor", "search", "logs"].map((id) => /* @__PURE__ */ jsxs(
        "button",
        {
          onClick: () => setActiveTab(id),
          className: `flex items-center justify-center gap-2 py-4 px-6 rounded-[2rem] transition-all duration-300 relative overflow-hidden group ${activeTab === id ? "flex-[1.5]" : "flex-1"}`,
          children: [
            activeTab === id && /* @__PURE__ */ jsx("div", { className: "absolute inset-0 bg-emerald-500 opacity-10" }),
            /* @__PURE__ */ jsx("div", { className: `relative z-10 transition-colors duration-300 ${activeTab === id ? "text-emerald-400" : "text-zinc-500 group-hover:text-zinc-300"}`, children: id === "monitor" ? /* @__PURE__ */ jsx(LayoutDashboard, { size: 24, strokeWidth: activeTab === id ? 2.5 : 2 }) : id === "search" ? /* @__PURE__ */ jsx(Search, { size: 24, strokeWidth: activeTab === id ? 2.5 : 2 }) : /* @__PURE__ */ jsx(List, { size: 24, strokeWidth: activeTab === id ? 2.5 : 2 }) }),
            activeTab === id && /* @__PURE__ */ jsx("span", { className: "text-[10px] font-black uppercase tracking-widest text-emerald-400 animate-in fade-in slide-in-from-left-2 duration-300 whitespace-nowrap", children: id === "monitor" ? "Radar" : id === "search" ? "Buscar" : "Logs" })
          ]
        },
        id
      )) }) })
    ] })
  ] });
};
export default App;
