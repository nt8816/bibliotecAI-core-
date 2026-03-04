import { useEffect, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function ConnectivityStatus() {
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const { toast } = useToast();

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast({
        title: 'Conexão restabelecida',
        description: 'Seu dispositivo voltou a ficar online.',
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast({
        variant: 'destructive',
        title: 'Sem conexão',
        description: 'Algumas ações podem falhar enquanto você estiver offline.',
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [toast]);

  if (isOnline) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-50 border-b border-destructive/30 bg-destructive/15 backdrop-blur">
      <div className="mx-auto flex h-10 max-w-screen-2xl items-center justify-center gap-2 px-4 text-sm text-destructive">
        <WifiOff className="h-4 w-4" />
        <span>Você está offline. Tentaremos sincronizar quando a conexão voltar.</span>
        <Wifi className="h-4 w-4 opacity-60" />
      </div>
    </div>
  );
}

