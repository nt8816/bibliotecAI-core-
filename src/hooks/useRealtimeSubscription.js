import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
export function useRealtimeSubscription({ table, onInsert, onUpdate, onDelete, onChange, }) {
    const handlersRef = useRef({
        onInsert,
        onUpdate,
        onDelete,
        onChange,
    });
    useEffect(() => {
        handlersRef.current = {
            onInsert,
            onUpdate,
            onDelete,
            onChange,
        };
    }, [onInsert, onUpdate, onDelete, onChange]);
    useEffect(() => {
        if (!table)
            return;
        let disposed = false;
        const channelId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const channel = supabase
            .channel(`realtime-${table}-${channelId}`)
            .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table,
        }, (payload) => {
            if (disposed)
                return;
            const handlers = handlersRef.current;
            // Call general onChange handler
            if (handlers.onChange) {
                handlers.onChange(payload);
            }
            // Call specific event handlers
            switch (payload.eventType) {
                case 'INSERT':
                    if (handlers.onInsert)
                        handlers.onInsert(payload);
                    break;
                case 'UPDATE':
                    if (handlers.onUpdate)
                        handlers.onUpdate(payload);
                    break;
                case 'DELETE':
                    if (handlers.onDelete)
                        handlers.onDelete(payload);
                    break;
            }
        })
            .subscribe((status) => {
            if (status === 'CHANNEL_ERROR') {
                console.warn(`Realtime indisponivel para tabela ${table}.`);
            }
        });
        return () => {
            disposed = true;
            supabase.removeChannel(channel);
        };
    }, [table]);
}
