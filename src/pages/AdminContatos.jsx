import { useCallback, useEffect, useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requestPlatformApi } from '@/lib/platformApi';

export default function AdminContatos() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await requestPlatformApi('/v1/admin/contatos', { auth: true });
      setItems(payload.data || []);
    } catch (err) {
      setError(err?.message || 'Não foi possível carregar os contatos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <MainLayout title="Contatos">
      <Card>
        <CardHeader><CardTitle>Contatos recebidos</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {loading ? <p>Carregando contatos...</p> : error ? (
            <div role="alert" className="space-y-2 text-destructive">
              <p>{error}</p>
              <Button variant="outline" onClick={load}>Tentar novamente</Button>
            </div>
          ) : items.length === 0 ? <p>Nenhum contato recebido.</p> : items.map((item) => (
            <article key={item.id} className="rounded-lg border p-4 space-y-2">
              <h2 className="font-semibold">{item.nome}</h2>
              <p><strong>E-mail:</strong> {item.email}</p>
              <p><strong>Escola:</strong> {item.escola || '—'}</p>
              <p><strong>Assunto:</strong> {item.assunto}</p>
              <p className="whitespace-pre-wrap break-words"><strong>Mensagem:</strong> {item.mensagem}</p>
              <p><strong>Data:</strong> {item.created_at ? new Date(item.created_at).toLocaleString('pt-BR') : '—'}</p>
              <p><strong>Status do e-mail:</strong> {item.email_status || '—'}</p>
            </article>
          ))}
        </CardContent>
      </Card>
    </MainLayout>
  );
}
