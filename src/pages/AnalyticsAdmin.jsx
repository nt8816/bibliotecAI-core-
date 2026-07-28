import { useCallback, useEffect, useRef, useState } from 'react';
import { BarChart3, Clock, Eye, MousePointerClick, Scroll, Users, Activity } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fetchAnalyticsSummary } from '@/services/analyticsService';

const PIE_COLORS = [
  'hsl(122, 46%, 34%)',
  'hsl(43, 96%, 56%)',
  'hsl(199, 89%, 48%)',
  'hsl(346, 77%, 50%)',
  'hsl(262, 83%, 58%)',
  'hsl(32, 95%, 54%)',
];

function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function getEventTypeBadgeColor(type) {
  if (type?.includes('page_view')) return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
  if (type?.includes('click')) return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
  if (type?.includes('scroll')) return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
  if (type?.includes('form')) return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300';
  if (type?.includes('section')) return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300';
  if (type?.includes('time')) return 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300';
  return 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300';
}

export default function AnalyticsAdmin() {
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchAnalyticsSummary({ days });
      setSummary(data);
    } catch (err) {
      setError(err?.message || 'Erro ao carregar analytics');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    const interval = setInterval(() => {
      if (mountedRef.current) load();
    }, 30000);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [load]);

  const kpis = summary
    ? [
        { label: 'Eventos totais', value: summary.totalEvents, icon: Activity, color: 'text-blue-500' },
        { label: 'Sessoes unicas', value: summary.totalSessions, icon: Users, color: 'text-green-500' },
        { label: 'Page views', value: summary.totalPageViews, icon: Eye, color: 'text-purple-500' },
        { label: 'Scroll medio', value: `${summary.avgScrollDepth}%`, icon: Scroll, color: 'text-orange-500' },
      ]
    : [];

  const chartData = summary?.recentEvents
    ? (() => {
        const byDate = {};
        summary.recentEvents.forEach((e) => {
          if (e.event_type !== 'page_view') return;
          const date = (e.created_at || '').slice(0, 10);
          if (!date) return;
          byDate[date] = (byDate[date] || 0) + 1;
        });
        return Object.entries(byDate)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, views]) => ({ date: date.slice(5), views }));
      })()
    : [];

  const eventTypeData = summary?.eventTypes?.map((e) => ({
    name: e.type,
    value: e.count,
  })) || [];

  return (
    <MainLayout>
      <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
            <p className="text-sm text-muted-foreground">
              Dados da landing page e interacoes dos visitantes
            </p>
          </div>
          <div className="flex gap-2">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  days === d
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {/* Loading skeleton */}
        {loading && !summary && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="h-4 bg-muted rounded w-20 mb-3" />
                  <div className="h-8 bg-muted rounded w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* KPI Cards */}
        {kpis.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {kpis.map((kpi) => (
              <Card key={kpi.label}>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {kpi.label}
                    </p>
                    <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                  </div>
                  <p className="text-2xl font-bold">{kpi.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Charts row */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Page views line chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Page views por dia
              </CardTitle>
            </CardHeader>
            <CardContent>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="views"
                      stroke="hsl(122, 46%, 34%)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">
                  Sem dados de page view
                </div>
              )}
            </CardContent>
          </Card>

          {/* Event type distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MousePointerClick className="h-4 w-4" />
                Distribuicao de eventos
              </CardTitle>
            </CardHeader>
            <CardContent>
              {eventTypeData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={eventTypeData}
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      dataKey="value"
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      labelLine={false}
                    >
                      {eventTypeData.map((_, index) => (
                        <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">
                  Sem eventos registrados
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Pages table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Paginas mais visitadas</CardTitle>
          </CardHeader>
          <CardContent>
            {summary?.pageViews?.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>URL</TableHead>
                      <TableHead className="text-right">Views</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.pageViews.map((pv) => (
                      <TableRow key={pv.url}>
                        <TableCell className="font-mono text-xs max-w-[400px] truncate">
                          {pv.url}
                        </TableCell>
                        <TableCell className="text-right font-medium">{pv.views}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">Sem dados</p>
            )}
          </CardContent>
        </Card>

        {/* Recent events timeline */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Eventos recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {summary?.recentEvents?.length > 0 ? (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {summary.recentEvents.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors"
                  >
                    <Badge
                      variant="secondary"
                      className={`text-[10px] font-mono shrink-0 ${getEventTypeBadgeColor(event.event_type)}`}
                    >
                      {event.event_type}
                    </Badge>
                    <span className="text-xs text-muted-foreground truncate flex-1 font-mono">
                      {event.page_url}
                    </span>
                    {event.element_id && (
                      <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                        #{event.element_id}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {formatRelativeTime(event.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">Sem eventos</p>
            )}
          </CardContent>
        </Card>

        {/* Recent sessions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sessoes recentes</CardTitle>
          </CardHeader>
          <CardContent>
            {summary?.recentSessions?.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sessao</TableHead>
                      <TableHead>Views</TableHead>
                      <TableHead>Scroll max</TableHead>
                      <TableHead>Plataforma</TableHead>
                      <TableHead className="text-right">Inicio</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.recentSessions.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-xs max-w-[140px] truncate">
                          {s.session_id}
                        </TableCell>
                        <TableCell>{s.page_views}</TableCell>
                        <TableCell>{s.max_scroll_depth}%</TableCell>
                        <TableCell className="text-xs">{s.platform}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {formatRelativeTime(s.started_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">Sem sessoes</p>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
