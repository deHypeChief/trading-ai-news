const isDev = process.env.NODE_ENV !== 'production';

interface DebugLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  service: string;
  message: string;
  data?: any;
}

const logs: DebugLog[] = [];
const MAX_LOGS = 500; // Keep last 500 logs in memory

export const debugConsole = {
  info: (service: string, message: string, data?: any) => {
    if (!isDev) return;
    const log: DebugLog = {
      timestamp: new Date().toISOString(),
      level: 'info',
      service,
      message,
      data,
    };
    logs.push(log);
    if (logs.length > MAX_LOGS) logs.shift();
    console.log(`[${service}] ℹ️ ${message}`, data || '');
  },

  warn: (service: string, message: string, data?: any) => {
    if (!isDev) return;
    const log: DebugLog = {
      timestamp: new Date().toISOString(),
      level: 'warn',
      service,
      message,
      data,
    };
    logs.push(log);
    if (logs.length > MAX_LOGS) logs.shift();
    console.warn(`[${service}] ⚠️ ${message}`, data || '');
  },

  error: (service: string, message: string, data?: any) => {
    if (!isDev) return;
    const log: DebugLog = {
      timestamp: new Date().toISOString(),
      level: 'error',
      service,
      message,
      data,
    };
    logs.push(log);
    if (logs.length > MAX_LOGS) logs.shift();
    console.error(`[${service}] ❌ ${message}`, data || '');
  },

  debug: (service: string, message: string, data?: any) => {
    if (!isDev) return;
    const log: DebugLog = {
      timestamp: new Date().toISOString(),
      level: 'debug',
      service,
      message,
      data,
    };
    logs.push(log);
    if (logs.length > MAX_LOGS) logs.shift();
    console.debug(`[${service}] 🐛 ${message}`, data || '');
  },

  getLogs: (filter?: { service?: string; level?: string; limit?: number }) => {
    let filtered = [...logs];
    if (filter?.service) {
      filtered = filtered.filter((log) => log.service === filter.service);
    }
    if (filter?.level) {
      filtered = filtered.filter((log) => log.level === filter.level);
    }
    if (filter?.limit) {
      filtered = filtered.slice(-filter.limit);
    }
    return filtered;
  },

  clear: () => {
    logs.length = 0;
  },

  getStats: () => {
    return {
      totalLogs: logs.length,
      byLevel: {
        info: logs.filter((l) => l.level === 'info').length,
        warn: logs.filter((l) => l.level === 'warn').length,
        error: logs.filter((l) => l.level === 'error').length,
        debug: logs.filter((l) => l.level === 'debug').length,
      },
      byService: logs.reduce(
        (acc, log) => {
          acc[log.service] = (acc[log.service] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
    };
  },
};

export type { DebugLog };
