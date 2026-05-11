import { useState, useEffect, useCallback } from 'react';
import { wsService } from '../services/websocket';

export function useWebSocket(circleId: string | undefined) {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!circleId) return;

    wsService.connect(circleId);

    const handleConnection = (connected: boolean) => {
      setIsConnected(connected);
    };

    wsService.onConnectionChange(handleConnection);
    setIsConnected(wsService.isConnected);

    return () => {
      wsService.offConnectionChange(handleConnection);
      wsService.disconnect();
    };
  }, [circleId]);

  const subscribe = useCallback((type: string, handler: (data: any) => void) => {
    wsService.onMessage(type, handler);
    return () => wsService.offMessage(type, handler);
  }, []);

  return { isConnected, subscribe };
}
