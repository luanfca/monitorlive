
import React, { useState, useEffect } from 'react';
import { logService } from '../services/logService';

export const LogViewer: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [logs, setLogs] = useState(logService.getLogs());

  useEffect(() => {
    const interval = setInterval(() => {
      setLogs(logService.getLogs());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 z-50 p-4 overflow-auto text-xs font-mono text-white">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold">App Logs</h2>
        <button onClick={onClose} className="bg-red-500 px-4 py-2 rounded">Close</button>
      </div>
      {logs.map((log, index) => (
        <div key={index} className={`mb-1 p-1 ${log.level === 'error' ? 'text-red-400' : log.level === 'warn' ? 'text-yellow-400' : 'text-green-400'}`}>
          [{log.timestamp}] {log.message} {log.data ? JSON.stringify(log.data) : ''}
        </div>
      ))}
    </div>
  );
};
