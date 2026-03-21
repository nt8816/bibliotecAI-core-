import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { supabase } from '@/integrations/supabase/client';

const PAGE_SIZE = 50;

function formatDateBR(value) {
  if (!value) return '-';
  try {
    return format(new Date(value), 'dd/MM/yyyy HH:mm', { locale: ptBR });
  } catch {
    return '-';
  }
}

function escapeIlike(value) {
  return String(value || '').replace(/%/g, '\\%').replace(/_/g, '\\_');
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
  const [total, setTotal] = useState(0);

  const [escolas, setEscolas] = useState([]);
  const [escolaFilter, setEscolaFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');
  const [rangeFilter, setRangeFilter] = useState('7');
  const [search, setSearch] = useState('');

  const [selectedLog, setSelectedLog] = useState(null);

  const escolaById = useMemo(
    () => new Map(escolas.map((item) => [item.id, item.nome])),
    [escolas],
  );

  const fetchEscolas = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('escolas')
        .select('id, nome')
        .order('nome');
      if (error) throw error;
      setEscolas(data || []);
    } catch (error) {
      console.error(error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar escolas.',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('system_logs')
        .select('id, created_at, escola_id, user_id, level, event, message, path, ip, user_agent, input, output, context', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (escolaFilter !== 'all') query = query.eq('escola_id', escolaFilter);
      if (levelFilter !== 'all') query = query.eq('level', levelFilter);
      if (rangeFilter !== 'all') {
        const days = Number(rangeFilter);
        if (!Number.isNaN(days) && days > 0) {
          const from = new Date();
          from.setDate(from.getDate() - days);
          query = query.gte('created_at', from.toISOString());
        }
      }
      if (search.trim()) {
        const term = escapeIlike(search.trim());
        query = query.or(
          `event.ilike.%${term}%,message.ilike.%${term}%,path.ilike.%${term}%,ip.ilike.%${term}%`,
        );
      }

      const { data, error, count } = await query;
      if (error) throw error;
      setLogs(data || []);
      setTotal(count || 0);
    } catch (error) {
      console.error(error);
      toast({
        title: 'Erro',
        description: 'Nao foi possivel carregar logs.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [escolaFilter, levelFilter, page, rangeFilter, search, toast]);

  useEffect(() => {
    fetchEscolas();
  }, [fetchEscolas]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <MainLayout title="Logs do Sistema">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filtros</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="space-y-1">
              <Label htmlFor="logs-search">Busca</Label>
              <Input
                id="logs-search"
                placeholder="Evento, mensagem, path ou IP"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="logs-escola">Escola</Label>
              <select
                id="logs-escola"
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={escolaFilter}
                onChange={(e) => {
                  setEscolaFilter(e.target.value);
                  setPage(0);
                }}
              >
                <option value="all">Todas as escolas</option>
                {escolas.map((escola) => (
                  <option key={escola.id} value={escola.id}>{escola.nome}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="logs-nivel">Nível</Label>
              <select
                id="logs-nivel"
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={levelFilter}
                onChange={(e) => {
                  setLevelFilter(e.target.value);
                  setPage(0);
                }}
              >
                <option value="all">Todos os níveis</option>
                <option value="error">Error</option>
                <option value="warn">Warn</option>
                <option value="info">Info</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="logs-periodo">Período</Label>
              <select
                id="logs-periodo"
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={rangeFilter}
                onChange={(e) => {
                  setRangeFilter(e.target.value);
                  setPage(0);
                }}
              >
                <option value="1">Últimas 24h</option>
                <option value="7">Últimos 7 dias</option>
                <option value="30">Últimos 30 dias</option>
                <option value="all">Tudo</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button type="button" variant="outline" onClick={fetchLogs} disabled={loading} className="w-full">
                Atualizar
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Eventos ({total})</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Carregando logs...</p>
            ) : logs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum log encontrado.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Escola</TableHead>
                      <TableHead>Nível</TableHead>
                      <TableHead>Evento</TableHead>
                      <TableHead>Mensagem</TableHead>
                      <TableHead>IP</TableHead>
                      <TableHead>Cidade</TableHead>
                      <TableHead className="text-right">Detalhes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap">{formatDateBR(log.created_at)}</TableCell>
                        <TableCell>{escolaById.get(log.escola_id) || log.escola_id || '-'}</TableCell>
                        <TableCell>
                          <Badge variant={log.level === 'error' ? 'destructive' : log.level === 'warn' ? 'secondary' : 'outline'}>
                            {log.level}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{log.event}</TableCell>
                        <TableCell className="max-w-[260px] truncate">{log.message || '-'}</TableCell>
                        <TableCell>{log.ip || '-'}</TableCell>
                        <TableCell>{resolveCity(log)}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => setSelectedLog(log)}>
                            <Eye className="w-4 h-4 mr-1" /> Ver
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4">
                <p className="text-xs text-muted-foreground">Página {page + 1} de {totalPages}</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((prev) => Math.max(0, prev - 1))}
                    disabled={page === 0}
                  >
                    Anterior
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((prev) => Math.min(totalPages - 1, prev + 1))}
                    disabled={page >= totalPages - 1}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Detalhes do log</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div><span className="font-medium">Data:</span> {formatDateBR(selectedLog.created_at)}</div>
                <div><span className="font-medium">Nível:</span> {selectedLog.level}</div>
                <div><span className="font-medium">Evento:</span> {selectedLog.event}</div>
                <div><span className="font-medium">IP:</span> {selectedLog.ip || '-'}</div>
                <div><span className="font-medium">Cidade:</span> {resolveCity(selectedLog)}</div>
                <div><span className="font-medium">Coordenadas:</span> {resolveCoordinates(selectedLog)}</div>
                <div><span className="font-medium">Path:</span> {selectedLog.path || '-'}</div>
                <div><span className="font-medium">User ID:</span> {selectedLog.user_id || '-'}</div>
                <div><span className="font-medium">Escola:</span> {escolaById.get(selectedLog.escola_id) || selectedLog.escola_id || '-'}</div>
                <div><span className="font-medium">User Agent:</span> {selectedLog.user_agent || '-'}</div>
              </div>
              {selectedLog.message && (
                <div>
                  <p className="font-medium">Mensagem</p>
                  <p className="text-muted-foreground">{selectedLog.message}</p>
                </div>
              )}
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <p className="font-medium">Input</p>
                  <pre className="rounded-md border bg-muted/20 p-3 text-xs overflow-auto max-h-64">
                    {JSON.stringify(selectedLog.input, null, 2) || '-'}
                  </pre>
                </div>
                <div>
                  <p className="font-medium">Output</p>
                  <pre className="rounded-md border bg-muted/20 p-3 text-xs overflow-auto max-h-64">
                    {JSON.stringify(selectedLog.output, null, 2) || '-'}
                  </pre>
                </div>
                <div>
                  <p className="font-medium">Contexto</p>
                  <pre className="rounded-md border bg-muted/20 p-3 text-xs overflow-auto max-h-64">
                    {JSON.stringify(selectedLog.context, null, 2) || '-'}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
