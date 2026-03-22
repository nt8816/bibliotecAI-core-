import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MessageSquareWarning, Send, ShieldAlert, X } from 'lucide-react';

import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

function formatDateTime(value) {
  if (!value) return '-';
  try {
    return format(new Date(value), 'dd/MM/yyyy HH:mm', { locale: ptBR });
  } catch {
    return '-';
  }
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Falha ao ler arquivo.'));
    reader.readAsDataURL(file);
  });
}

function statusLabel(status) {
  if (status === 'respondida') return 'Respondida';
  if (status === 'em_analise') return 'Em analise';
  if (status === 'arquivada') return 'Arquivada';
  return 'Nova';
}

function statusVariant(status) {
  if (status === 'respondida') return 'default';
  if (status === 'em_analise') return 'secondary';
  if (status === 'arquivada') return 'outline';
  return 'destructive';
}

const emptyForm = { assunto: '', mensagem: '', imageUrls: [] };

export default function Reclamacoes() {
  const { user, userRole, isSuperAdmin } = useAuth();
  const { toast } = useToast();
  const imageInputRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [responseDraft, setResponseDraft] = useState('');
  const [updatingItem, setUpdatingItem] = useState(false);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) || null,
    [items, selectedItemId],
  );

  const filteredItems = useMemo(() => {
    if (statusFilter === 'all') return items;
    return items.filter((item) => item.status === statusFilter);
  }, [items, statusFilter]);

  const fetchItems = useCallback(async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      let query = supabase
        .from('reclamacoes_super_admin')
        .select('id, sender_user_id, sender_profile_id, sender_nome, sender_email, sender_role, escola_id, assunto, mensagem, image_urls, status, resposta, created_at, updated_at, respondida_em, escolas!left(nome)')
        .order('created_at', { ascending: false });

      if (!isSuperAdmin) {
        query = query.eq('sender_user_id', user.id);
      }

      const { data, error } = await query;
      if (error) throw error;

      const baseItems = data || [];
      const missingSchoolSenderIds = Array.from(
        new Set(
          baseItems
            .filter((item) => !item?.escolas?.nome && item?.sender_user_id)
            .map((item) => item.sender_user_id),
        ),
      );
      const missingSchoolProfileIds = Array.from(
        new Set(
          baseItems
            .filter((item) => !item?.escolas?.nome && item?.sender_profile_id)
            .map((item) => item.sender_profile_id),
        ),
      );
      const missingEscolaIds = Array.from(
        new Set(
          baseItems
            .filter((item) => !item?.escolas?.nome && item?.escola_id)
            .map((item) => item.escola_id),
        ),
      );

      let escolaNameBySenderId = new Map();
      let escolaNameByProfileId = new Map();
      let escolaNameByEscolaId = new Map();

      if (missingSchoolSenderIds.length > 0) {
        const { data: senderProfiles, error: senderProfilesError } = await supabase
          .from('usuarios_biblioteca')
          .select('user_id, escola_id, escolas!left(nome)')
          .in('user_id', missingSchoolSenderIds);

        if (!senderProfilesError) {
          escolaNameBySenderId = new Map(
            (senderProfiles || [])
              .filter((profile) => profile?.user_id && profile?.escolas?.nome)
              .map((profile) => [profile.user_id, profile.escolas.nome]),
          );
        }
      }

      if (missingSchoolProfileIds.length > 0) {
        const { data: senderProfilesById, error: senderProfilesByIdError } = await supabase
          .from('usuarios_biblioteca')
          .select('id, escola_id, escolas!left(nome)')
          .in('id', missingSchoolProfileIds);

        if (!senderProfilesByIdError) {
          escolaNameByProfileId = new Map(
            (senderProfilesById || [])
              .filter((profile) => profile?.id && profile?.escolas?.nome)
              .map((profile) => [profile.id, profile.escolas.nome]),
          );
        }
      }

      if (missingEscolaIds.length > 0) {
        const { data: escolasData, error: escolasError } = await supabase
          .from('escolas')
          .select('id, nome')
          .in('id', missingEscolaIds);

        if (!escolasError) {
          escolaNameByEscolaId = new Map(
            (escolasData || [])
              .filter((escola) => escola?.id && escola?.nome)
              .map((escola) => [escola.id, escola.nome]),
          );
        }
      }

      const nextItems = baseItems.map((item) => {
        const escolaNomeResolvida = item?.escolas?.nome
          || escolaNameByEscolaId.get(item?.escola_id)
          || escolaNameByProfileId.get(item?.sender_profile_id)
          || escolaNameBySenderId.get(item?.sender_user_id)
          || null;
        return {
          ...item,
          escolas: escolaNomeResolvida ? { ...(item.escolas || {}), nome: escolaNomeResolvida } : item.escolas,
          escola_nome_resolvida: escolaNomeResolvida,
        };
      });
      setItems(nextItems);

      if (nextItems.length === 0) {
        setSelectedItemId('');
        setResponseDraft('');
        return;
      }

      const nextSelectedId = nextItems.some((item) => item.id === selectedItemId) ? selectedItemId : nextItems[0].id;
      setSelectedItemId(nextSelectedId);
      const nextSelected = nextItems.find((item) => item.id === nextSelectedId);
      setResponseDraft(nextSelected?.resposta || '');
    } catch (error) {
      toast({
        title: 'Erro ao carregar reclamacoes',
        description: error?.message || 'Nao foi possivel carregar as reclamacoes.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, selectedItemId, toast, user?.id]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleSubmit = async () => {
    const assunto = form.assunto.trim();
    const mensagem = form.mensagem.trim();
    const imageUrls = ensureArray(form.imageUrls);

    if (assunto.length < 3) {
      toast({
        title: 'Assunto invalido',
        description: 'Informe um assunto com pelo menos 3 caracteres.',
        variant: 'destructive',
      });
      return;
    }

    if (mensagem.length < 10) {
      toast({
        title: 'Mensagem invalida',
        description: 'Descreva a reclamacao com pelo menos 10 caracteres.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('reclamacoes_super_admin').insert({
        sender_role: userRole,
        assunto,
        mensagem,
        image_urls: imageUrls,
      });

      if (error) throw error;

      setForm(emptyForm);
      toast({
        title: 'Reclamacao enviada',
        description: 'Sua mensagem foi enviada para todos os super admins cadastrados.',
      });
      await fetchItems();
    } catch (error) {
      toast({
        title: 'Erro ao enviar reclamacao',
        description: error?.message || 'Nao foi possivel enviar a reclamacao.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAdminUpdate = async () => {
    if (!selectedItem?.id) return;

    setUpdatingItem(true);
    try {
      const payload = {
        status: selectedItem.status,
        resposta: responseDraft.trim() || null,
      };

      const { error } = await supabase
        .from('reclamacoes_super_admin')
        .update(payload)
        .eq('id', selectedItem.id);

      if (error) throw error;

      toast({
        title: 'Reclamacao atualizada',
        description: 'O status e a resposta foram salvos.',
      });
      await fetchItems();
    } catch (error) {
      toast({
        title: 'Erro ao atualizar reclamacao',
        description: error?.message || 'Nao foi possivel salvar as alteracoes.',
        variant: 'destructive',
      });
    } finally {
      setUpdatingItem(false);
    }
  };

  const handleStatusChange = (id, value) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, status: value } : item)));
  };

  const handleSelectImages = async (files) => {
    const selectedFiles = Array.from(files || []);
    if (selectedFiles.length === 0) return;

    const invalidFiles = selectedFiles.filter((file) => !file.type.startsWith('image/'));
    if (invalidFiles.length > 0) {
      toast({
        title: 'Arquivo invalido',
        description: 'Essa area aceita apenas imagens.',
        variant: 'destructive',
      });
      return;
    }

    const selected = selectedFiles.slice(0, 4);

    try {
      const converted = await Promise.all(selected.map(fileToDataUrl));
      setForm((prev) => ({
        ...prev,
        imageUrls: [...ensureArray(prev.imageUrls), ...converted].slice(0, 4),
      }));
    } catch {
      toast({
        title: 'Erro ao processar imagens',
        description: 'Nao foi possivel carregar uma ou mais imagens.',
        variant: 'destructive',
      });
    }
  };

  const handleRemoveImage = (index) => {
    setForm((prev) => ({
      ...prev,
      imageUrls: ensureArray(prev.imageUrls).filter((_, currentIndex) => currentIndex !== index),
    }));
  };

  return (
    <MainLayout title="Reclamacoes">
      <div className="space-y-4">
        {!isSuperAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquareWarning className="h-5 w-5" />
                Enviar reclamacao
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reclamacao-assunto">Assunto</Label>
                <Input
                  id="reclamacao-assunto"
                  value={form.assunto}
                  onChange={(e) => setForm((prev) => ({ ...prev, assunto: e.target.value }))}
                  placeholder="Resuma o problema"
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reclamacao-mensagem">Mensagem</Label>
                <Textarea
                  id="reclamacao-mensagem"
                  value={form.mensagem}
                  onChange={(e) => setForm((prev) => ({ ...prev, mensagem: e.target.value }))}
                  placeholder="Explique sua reclamacao com o maximo de contexto possivel"
                  disabled={saving}
                  rows={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reclamacao-imagens">Imagens (opcional, ate 4)</Label>
                <input
                  id="reclamacao-imagens"
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  disabled={saving}
                  onChange={(e) => {
                    handleSelectImages(e.target.files);
                    e.target.value = '';
                  }}
                />
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving || ensureArray(form.imageUrls).length >= 4}
                    onClick={() => imageInputRef.current?.click()}
                  >
                    Escolher imagens
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    Apenas imagens. Maximo de 4 anexos.
                  </p>
                </div>
                {ensureArray(form.imageUrls).length > 0 && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {ensureArray(form.imageUrls).map((url, index) => (
                      <div key={`${index}-${url.slice(0, 24)}`} className="relative overflow-hidden rounded-md border">
                        <img src={url} alt={`Anexo ${index + 1}`} className="h-24 w-full object-cover" />
                        <Button
                          type="button"
                          size="icon"
                          variant="secondary"
                          className="absolute right-1 top-1 h-7 w-7"
                          onClick={() => handleRemoveImage(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex justify-end">
                <Button type="button" onClick={handleSubmit} disabled={saving}>
                  <Send className="mr-2 h-4 w-4" />
                  {saving ? 'Enviando...' : 'Enviar reclamacao'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className={`grid gap-4 ${isSuperAdmin ? 'lg:grid-cols-[minmax(0,1.4fr)_minmax(340px,0.9fr)]' : 'grid-cols-1'}`}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {isSuperAdmin ? <ShieldAlert className="h-5 w-5" /> : <MessageSquareWarning className="h-5 w-5" />}
                {isSuperAdmin ? 'Caixa de reclamacoes' : 'Minhas reclamacoes'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isSuperAdmin && (
                <div className="flex flex-wrap gap-2">
                  <select
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="all">Todos os status</option>
                    <option value="nova">Novas</option>
                    <option value="em_analise">Em analise</option>
                    <option value="respondida">Respondidas</option>
                    <option value="arquivada">Arquivadas</option>
                  </select>
                </div>
              )}

              {loading ? (
                <p className="text-sm text-muted-foreground">Carregando reclamacoes...</p>
              ) : filteredItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {isSuperAdmin ? 'Nenhuma reclamacao recebida.' : 'Voce ainda nao enviou reclamacoes.'}
                </p>
              ) : isSuperAdmin ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Remetente</TableHead>
                        <TableHead>Escola</TableHead>
                        <TableHead>Assunto</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Abrir</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{formatDateTime(item.created_at)}</TableCell>
                          <TableCell>
                            <div className="min-w-[180px]">
                              <p className="font-medium">{item.sender_nome || item.sender_email || '-'}</p>
                              <p className="text-xs text-muted-foreground">{item.sender_role || '-'}</p>
                            </div>
                          </TableCell>
                          <TableCell>{item.escola_nome_resolvida || '-'}</TableCell>
                          <TableCell className="max-w-[280px] truncate">{item.assunto}</TableCell>
                          <TableCell>
                            <Badge variant={statusVariant(item.status)}>{statusLabel(item.status)}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              variant={selectedItemId === item.id ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => {
                                setSelectedItemId(item.id);
                                setResponseDraft(item.resposta || '');
                              }}
                            >
                              Ver
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredItems.map((item) => (
                    <div key={item.id} className="rounded-lg border p-4 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{item.assunto}</p>
                        <Badge variant={statusVariant(item.status)}>{statusLabel(item.status)}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.mensagem}</p>
                      {ensureArray(item.image_urls).length > 0 && (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {ensureArray(item.image_urls).map((url, index) => (
                            <img
                              key={`${item.id}-img-${index}`}
                              src={url}
                              alt={`Imagem da reclamacao ${index + 1}`}
                              className="h-24 w-full rounded-md border object-cover"
                            />
                          ))}
                        </div>
                      )}
                      {item.resposta && (
                        <div className="rounded-md border bg-muted/30 p-3">
                          <p className="text-xs font-medium text-muted-foreground">Resposta do super admin</p>
                          <p className="text-sm whitespace-pre-wrap">{item.resposta}</p>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Enviada em {formatDateTime(item.created_at)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {isSuperAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Detalhes da reclamacao</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!selectedItem ? (
                  <p className="text-sm text-muted-foreground">Selecione uma reclamacao para visualizar os detalhes.</p>
                ) : (
                  <>
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{selectedItem.assunto}</p>
                      <p className="text-xs text-muted-foreground">
                        {selectedItem.sender_nome || selectedItem.sender_email || '-'} • {selectedItem.sender_role || '-'} • {selectedItem.escolas?.nome || 'Sem escola'}
                      </p>
                      <p className="text-xs text-muted-foreground">Recebida em {formatDateTime(selectedItem.created_at)}</p>
                    </div>

                    <div className="rounded-md border p-3 text-sm whitespace-pre-wrap">
                      {selectedItem.mensagem}
                    </div>

                    {ensureArray(selectedItem.image_urls).length > 0 && (
                      <div className="space-y-2">
                        <Label>Anexos</Label>
                        <div className="grid grid-cols-2 gap-2">
                          {ensureArray(selectedItem.image_urls).map((url, index) => (
                            <img
                              key={`${selectedItem.id}-detail-${index}`}
                              src={url}
                              alt={`Anexo ${index + 1}`}
                              className="h-32 w-full rounded-md border object-cover"
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="reclamacao-status">Status</Label>
                      <select
                        id="reclamacao-status"
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        value={selectedItem.status}
                        onChange={(e) => handleStatusChange(selectedItem.id, e.target.value)}
                        disabled={updatingItem}
                      >
                        <option value="nova">Nova</option>
                        <option value="em_analise">Em analise</option>
                        <option value="respondida">Respondida</option>
                        <option value="arquivada">Arquivada</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="reclamacao-resposta">Resposta</Label>
                      <Textarea
                        id="reclamacao-resposta"
                        rows={6}
                        value={responseDraft}
                        onChange={(e) => setResponseDraft(e.target.value)}
                        placeholder="Escreva uma resposta ou observacao interna"
                        disabled={updatingItem}
                      />
                    </div>

                    <div className="flex justify-end">
                      <Button type="button" onClick={handleAdminUpdate} disabled={updatingItem}>
                        {updatingItem ? 'Salvando...' : 'Salvar atualizacao'}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
