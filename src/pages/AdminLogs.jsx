import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Eye } from 'lucide-react';

import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { fetchAdminLogs } from '@/services/adminLogsService';

const PAGE_SIZE = 50;

function formatDateBR(value) {
  if (!value) return '-';
  try {
    return format(new Date(value), 'dd/MM/yyyy HH:mm', { locale: ptBR });
  } catch {
    return '-';
  }
}

function resolveCity(log) {
  return log?.context?.city || log?.context?.locality || '-';
}

function resolveCoordinates(log) {
  const latitude = log?.context?.coordinates?.latitude;
  const longitude = log?.context?.coordinates?.longitude;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return '-';
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

export default function AdminLogs() {
  const { toast } = useToast();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [levelFilter, setLevelFilter] = useState('all');
  const [rangeFilter, setRangeFilter] = useState('7');
  const [search, setSearch] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const nextLogs = await fetchAdminLogs({
        page,
        pageSize: PAGE_SIZE,
        level: levelFilter,
        range: rangeFilter,
        search,
      });
      setLogs(nextLogs);
    } catch (error) {
      toast({ title: 'Erro', description: error?.message || 'Não foi possível carregar os acessos do Super Admin.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [levelFilter, page, rangeFilter, search, toast]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const total = logs.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <MainLayout title="Logs do Super Admin">
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Filtros</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1"><Label htmlFor="logs-search">Busca</Label><Input id="logs-search" placeholder="Evento, mensagem, path ou IP" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} /></div>
            <div className="space-y-1"><Label htmlFor="logs-nivel">Nivel</Label><select id="logs-nivel" className="h-10 rounded-md border bg-background px-3 text-sm" value={levelFilter} onChange={(e) => { setLevelFilter(e.target.value); setPage(0); }}><option value="all">Todos os niveis</option><option value="error">Error</option><option value="warn">Warn</option><option value="info">Info</option></select></div>
            <div className="space-y-1"><Label htmlFor="logs-periodo">Periodo</Label><select id="logs-periodo" className="h-10 rounded-md border bg-background px-3 text-sm" value={rangeFilter} onChange={(e) => { setRangeFilter(e.target.value); setPage(0); }}><option value="1">Ultimas 24h</option><option value="7">Ultimos 7 dias</option><option value="30">Ultimos 30 dias</option><option value="all">Tudo</option></select></div>
            <div className="flex items-end"><Button type="button" variant="outline" onClick={fetchLogs} disabled={loading} className="w-full">Atualizar</Button></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Acessos registrados ({total})</CardTitle></CardHeader>
          <CardContent>
            {loading ? <p className="text-sm text-muted-foreground">Carregando acessos do Super Admin...</p> : logs.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum acesso do Super Admin encontrado.</p> : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Nivel</TableHead><TableHead>Evento</TableHead><TableHead>Mensagem</TableHead><TableHead>IP</TableHead><TableHead>Cidade</TableHead><TableHead className="text-right">Detalhes</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap">{formatDateBR(log.created_at)}</TableCell>
                        <TableCell><Badge variant={log.level === 'error' ? 'destructive' : log.level === 'warn' ? 'secondary' : 'outline'}>{log.level}</Badge></TableCell>
                        <TableCell className="font-medium">{log.event}</TableCell>
                        <TableCell className="max-w-[260px] truncate">{log.message || '-'}</TableCell>
                        <TableCell>{log.ip || '-'}</TableCell>
                        <TableCell>{resolveCity(log)}</TableCell>
                        <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => setSelectedLog(log)}><Eye className="mr-1 h-4 w-4" /> Ver</Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4">
                <p className="text-xs text-muted-foreground">Pagina {page + 1} de {totalPages}</p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setPage((prev) => Math.max(0, prev - 1))} disabled={page === 0}>Anterior</Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setPage((prev) => Math.min(totalPages - 1, prev + 1))} disabled={page >= totalPages - 1}>Proxima</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Detalhes do acesso</DialogTitle></DialogHeader>
          {selectedLog && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div><span className="font-medium">Data:</span> {formatDateBR(selectedLog.created_at)}</div>
                <div><span className="font-medium">Nivel:</span> {selectedLog.level}</div>
                <div><span className="font-medium">Evento:</span> {selectedLog.event}</div>
                <div><span className="font-medium">IP:</span> {selectedLog.ip || '-'}</div>
                <div><span className="font-medium">Cidade:</span> {resolveCity(selectedLog)}</div>
                <div><span className="font-medium">Coordenadas:</span> {resolveCoordinates(selectedLog)}</div>
                <div className="sm:col-span-2"><span className="font-medium">Path:</span> {selectedLog.path || '-'}</div>
                <div className="sm:col-span-2"><span className="font-medium">User agent:</span> {selectedLog.user_agent || '-'}</div>
              </div>
              <div><span className="font-medium">Mensagem:</span> {selectedLog.message || '-'}</div>
              <div className="space-y-2">
                <p className="font-medium">Contexto</p>
                <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(selectedLog.context || {}, null, 2)}</pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}

