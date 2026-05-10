import { useState, useEffect, useCallback } from 'react';
import { wsService } from '../services/websocket';
import { useAuth } from '../context/AuthContext';

export function useWebSocket(circleId: string | undefined) {
  const [isConnected, setIsConnected] = useState(false);
  const { token } = useAuth();

  useEffect(() => {
    if (!circleId || !token) return;

    wsService.connect(circleId, token);

    const handleConnection = (connected: boolean) => {
      setIsConnected(connected);
    };

    wsService.onConnectionChange(handleConnection);
    setIsConnected(wsService.isConnected);

    return () => {
      wsService.offConnectionChange(handleConnection);
      wsService.disconnect();
    };
  }, [circleId, token]);

  const subscribe = useCallback((type: string, handler: (data: any) => void) => {
    wsService.onMessage(type, handler);
    return () => wsService.offMessage(type, handler);
  }, []);

  return { isConnected, subscribe };
}
