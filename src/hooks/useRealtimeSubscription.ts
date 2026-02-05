 import { useEffect } from 'react';
 import { supabase } from '@/integrations/supabase/client';
 import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
 
 type TableName = 'livros' | 'emprestimos' | 'usuarios_biblioteca' | 'sugestoes_livros' | 'atividades_leitura';
 
 interface UseRealtimeSubscriptionOptions {
   table: TableName;
   onInsert?: (payload: RealtimePostgresChangesPayload<any>) => void;
   onUpdate?: (payload: RealtimePostgresChangesPayload<any>) => void;
   onDelete?: (payload: RealtimePostgresChangesPayload<any>) => void;
   onChange?: (payload: RealtimePostgresChangesPayload<any>) => void;
 }
 
 export function useRealtimeSubscription({
   table,
   onInsert,
   onUpdate,
   onDelete,
   onChange,
 }: UseRealtimeSubscriptionOptions) {
   useEffect(() => {
     const channel = supabase
       .channel(`realtime-${table}`)
       .on(
         'postgres_changes',
         {
           event: '*',
           schema: 'public',
           table,
         },
         (payload) => {
           console.log(`[Realtime] ${table} change:`, payload.eventType);
           
           // Call general onChange handler
           if (onChange) {
             onChange(payload);
           }
           
           // Call specific event handlers
           switch (payload.eventType) {
             case 'INSERT':
               if (onInsert) onInsert(payload);
               break;
             case 'UPDATE':
               if (onUpdate) onUpdate(payload);
               break;
             case 'DELETE':
               if (onDelete) onDelete(payload);
               break;
           }
         }
       )
       .subscribe();
 
     return () => {
       supabase.removeChannel(channel);
     };
   }, [table, onInsert, onUpdate, onDelete, onChange]);
 }