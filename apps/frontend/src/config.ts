const isDevelopment = import.meta.env.DEV;

export const API_URL = import.meta.env.VITE_API_URL || (
  isDevelopment ? 'http://localhost:3001' : window.location.origin
);

export const WS_URL = import.meta.env.VITE_WS_URL || (
  isDevelopment
    ? 'ws://localhost:3001'
    : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`
);
