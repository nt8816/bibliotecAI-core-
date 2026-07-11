# Estimativa de Custo Mensal - BibliotecAI

**Cenário:** 500 alunos | 5 imagens/dia | Tudo via Cloudflare Workers AI | Banco Supabase

---

## Premissas

| Parâmetro | Valor |
|-----------|-------|
| Alunos ativos | 500 |
| Imagens geradas/dia (por aluno) | 5 |
| Total imagens/dia | 2.500 |
| Total imagens/mês (30 dias) | 75.000 |
| Requisições de texto IA/aluno/mês | ~40 |
| Total requests de texto/mês | 20.000 |
| Modelo de imagem | FLUX-1-schnell (CF Workers AI) |
| Modelo de texto | Llama 3.1 8B (CF Workers AI) |

---

## 1. Cloudflare Workers AI - Geração de Imagens

Usando `@cf/black-forest-labs/flux-1-schnell`:

| Parâmetro | Valor |
|-----------|-------|
| Custo por tile 512x512 | 4,80 neurons |
| Custo por step | 9,60 neurons |
| Steps por imagem (padrão 20) | 20 |
| **Neurons por imagem** | **~200 neurons** |
| **Custo por imagem** | **$0,0022** |

| Volume | Cálculo | Custo Mensal |
|--------|---------|--------------|
| 75.000 imagens/mês | 75.000 × 200 neurons = 15M neurons | **$165** |

---

## 2. Cloudflare Workers AI - Geração de Texto

Usando `@cf/meta/llama-3.1-8b-instruct` para sinopses, quizzes, resumos e desafios:

| Parâmetro | Valor |
|-----------|-------|
| Custo input | 25.608 neurons/M tokens |
| Custo output | 75.147 neurons/M tokens |

### Volume de requests por tarefa

| Tarefa | Requests/mês | Input tokens | Output tokens |
|--------|-------------|-------------|---------------|
| Sinopse de livro | 5.000 | ~400 | ~600 |
| Quiz de leitura | 2.500 | ~500 | ~800 |
| Resumo de estudo | 4.000 | ~450 | ~500 |
| Desafio gamificado | 500 | ~600 | ~400 |
| Sugestão/recomendação | 5.000 | ~350 | ~300 |
| Outros | 3.000 | ~400 | ~400 |
| **Total** | **20.000** | — | — |

### Cálculo de neurons

```
Input total:  20.000 × 450 tokens = 9.000.000 tokens
Output total: 20.000 × 500 tokens = 10.000.000 tokens

Neurons input:  9M × 25.608 / 1.000.000 = 230.472
Neurons output: 10M × 75.147 / 1.000.000 = 751.470

Total neurons: 981.942
```

### Custo

```
981.942 neurons × $0,011 / 1.000 = $10,80/mês
```

---

## 3. Cloudflare Workers (API Gateway)

| Item | Detalhe | Custo |
|------|---------|-------|
| Plano | Pay-as-you-go | $5/mês |
| Requests incluídas | 10M/mês | — |
| Uso estimado | ~3-5M requests/mês | dentro do free |

---

## 4. Cloudflare R2 (Armazenamento de Imagens)

| Item | Detalhe | Custo Mensal |
|------|---------|--------------|
| Storage (mês 1) | 75.000 × 500KB = ~37 GB | $0,41 |
| Storage (mês 6, acumulado) | ~220 GB médio | $3,15 |
| Class A (uploads) | 75K/mês (dentro do free 1M) | $0 |
| Class B (leituras) | ~225K/mês (3 views/image) | $0,08 |
| Egress | ~11 GB/mês | $0,05 |

**Subtotal R2: $0,50 – $3,25/mês**

---

## 5. Supabase (Banco + Auth + Edge Functions)

| Componente | Plano | Custo |
|------------|-------|-------|
| Database | Pro (8 GB) | $25/mês |
| Auth (500 MAU) | Pro (100K incluídos) | $0 extra |
| Edge Functions | Pro (500K invocações) | $0 extra |
| Bandwidth | Pro (250 GB) | $0 extra |

---

## 6. Firebase Cloud Messaging (Push)

| Item | Detalhe | Custo |
|------|---------|-------|
| Plano Spark (gratuito) | Mensagens ilimitadas | $0 |

---

## Resumo Total

| Serviço | Custo Mensal |
|---------|-------------|
| Workers AI - Imagens (FLUX-1-schnell) | $165,00 |
| Workers AI - Texto (Llama 3.1 8B) | $10,80 |
| Cloudflare Workers (API Gateway) | $5,00 |
| Cloudflare R2 (storage) | $0,50 – $3,25 |
| Supabase Pro | $25,00 |
| Firebase FCM | $0,00 |
| **TOTAL** | **$206 – $209/mês** |

---

## Custo por Aluno

| Métrica | Valor |
|---------|-------|
| Custo mensal total | ~$207 |
| Custo por aluno/mês | **$0,41** |
| Custo por aluno/dia | **$0,014** |

---

## Comparação: CF Workers AI vs Gemini vs HF

| Provedor | Custo/mês (75K imagens) | Economia vs CF |
|----------|-------------------------|----------------|
| Google Gemini | $1.500 – $6.000 | 87-97% mais caro |
| Hugging Face FLUX | $1.875 – $3.750 | 91-95% mais caro |
| **Cloudflare Workers AI** | **$165** | **基准** |

---

## Otimizações Adicionais

1. **Cache de respostas de texto** — sinopses e resumos podem ser cacheados por título de livro (reduz 30-50% do custo de texto)
2. **Batch de imagens** — gerar múltiplas imagens em paralelo reduz cold starts
3. **Retenção de imagens** — deletar imagens >90 dias do R2
4. **Modelo de texto menor** — usar Llama 3.2 3B para tarefas simples (40% mais barato, ~$6/mês)
5. **Compression WebP** — reduzir tamanho médio de 500KB para ~200KB
