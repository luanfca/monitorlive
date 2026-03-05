
type LogEntry = {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  data?: any;
};

let logs: LogEntry[] = [];
const MAX_LOGS = 100;

export const logService = {
  addLog: (level: 'info' | 'warn' | 'error', message: string, data?: any) => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data
    };
    logs.unshift(entry); // Add to beginning
    if (logs.length > MAX_LOGS) {
      logs.pop();
    }
    console.log(`[${level.toUpperCase()}] ${message}`, data || '');
  },
  getLogs: () => logs,
  clearLogs: () => { logs = []; }
};
