# Spec: OpenAI Provider

**Versão:** 1.2
**Status:** Aprovada
**Autor:** SeparadorAudioBot Agent
**Data:** 2026-10-17
**Reviewers:** Danillo

---

## 1. Resumo

Adicionar a OpenAI como quarto "cérebro" do SeparadorAudioBot, ao lado de Gemini, DeepSeek e Groq, e torná-la o **provedor padrão do sistema** (no lugar do Gemini), com o modelo `gpt-5-nano`. Os demais provedores continuam disponíveis via `LLM_PROVIDER` no `.env`, sem alterar código, reaproveitando a camada `OpenAICompatibleProvider` já existente.

---

## 2. Contexto e Motivação

**Problema:**
Hoje o `ProviderFactory` só reconhece `gemini`, `deepseek` e `groq` (`ProviderName` em `src/config/Config.ts`). Qualquer outro valor em `LLM_PROVIDER` é ignorado e o sistema cai silenciosamente para `gemini`. Não há como usar modelos da OpenAI, mesmo com chave válida.

**Evidências:**
- `Config.parseProvider()` aceita apenas os três nomes atuais.
- Os modelos de raciocínio da OpenAI rejeitam parâmetros que o `SkillRouter` envia hoje (ex.: `temperature: 0`), o que causaria HTTP 400 se a OpenAI fosse simplesmente plugada sem ajustes.

**Por que agora:**
A arquitetura já usa o SDK `openai` para todos os provedores (decisão registrada no README). Adicionar a OpenAI nativa é de baixo custo e amplia as opções de fallback (PRD, Fluxo Alternativo A).

---

## 3. Goals (Objetivos)

- [x] G-01: Aceitar `openai` como valor válido em `LLM_PROVIDER`, `LLM_FALLBACK_PROVIDER` e `ROUTER_PROVIDER`.
- [x] G-02: Criar `OpenAIProvider` herdando de `OpenAICompatibleProvider`, configurado por `OPENAI_API_KEY` e `OPENAI_MODEL` (padrão `gpt-5-nano`).
- [x] G-03: Suportar modelos de raciocínio da OpenAI, que não aceitam `temperature`, sem quebrar o `SkillRouter` nem o `AgentLoop`, controlado por flag explícita.
- [x] G-04: Permitir `OPENAI_BASE_URL` opcional para proxy corporativo ou Azure OpenAI. Servidores locais (Ollama, LM Studio) ficam na spec [openai-compatible-provider.md](openai-compatible-provider.md).
- [x] G-05: Tornar `openai` o provedor padrão: sem `LLM_PROVIDER` definido, o sistema usa OpenAI com `gpt-5-nano`.

**Métricas de sucesso:**
| Métrica | Baseline atual | Target | Prazo |
|---------|---------------|--------|-------|
| Provedores suportados | 3 | 4 | MVP |
| Linhas de código alteradas fora de `src/llm/` e `src/config/` | N/A | 0 | MVP |
| Erros HTTP 400 por parâmetro não suportado em modelos de raciocínio | Não medido | 0 | MVP |

---

## 4. Non-Goals (Fora do Escopo)

- NG-01: Usar a Responses API, Assistants API ou ferramentas hospedadas da OpenAI (web search, file search, code interpreter). O agente continua em Chat Completions + function calling, como os demais provedores.
- NG-02: Usar Whisper ou TTS da nuvem OpenAI. STT e TTS seguem locais (telegram-input §12).
- NG-03: Entrada multimodal (imagens). Continua fora do escopo (telegram-input NG-01).
- NG-04: Controle de custo ou orçamento por token.

---

## 5. Usuários e Personas

**Usuário primário:** Danillo, que quer trocar o cérebro do agente para um modelo OpenAI (ou usá-lo como fallback) editando apenas o `.env`.

**Módulos clientes:** `ProviderFactory`, `AgentLoop` (via `ILlmProvider`) e `SkillRouter`.

---

## 6. Requisitos Funcionais

### 6.1 Requisitos Principais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|-----------|-------------------|
| RF-01 | `ProviderName` e `Config.parseProvider()` devem aceitar `openai`. | Must | `new Config({ LLM_PROVIDER: 'openai' }).llmProvider === 'openai'`. |
| RF-02 | `Config.providers.openai` deve ler `OPENAI_API_KEY`, `OPENAI_MODEL` (padrão `gpt-5-nano`) e `OPENAI_BASE_URL` (padrão `https://api.openai.com/v1`). | Must | Teste de Config valida os três campos e os padrões. |
| RF-03 | Criar `src/llm/OpenAIProvider.ts` estendendo `OpenAICompatibleProvider` com `name = 'openai'`. | Must | `ProviderFactory.create('openai')` retorna instância de `OpenAIProvider`. |
| RF-04 | `Config.validate()` deve acusar `OPENAI_API_KEY` ausente quando `LLM_PROVIDER=openai`. | Must | Com a chave vazia, o start loga `API key do provider primário "openai" não definida.` e encerra com exit code 1. |
| RF-05 | `OpenAICompatibleProvider` deve omitir `temperature` quando o provedor declarar `supportsTemperature: false`. | Must | Com a flag desligada, a requisição do `SkillRouter` não contém `temperature` (verificado em teste com cliente mockado). |
| RF-06 | O suporte a `temperature` é definido exclusivamente pela flag `OPENAI_SUPPORTS_TEMPERATURE` (`true`/`false`), sem inferência pelo nome do modelo. Padrão `false`, coerente com o modelo padrão `gpt-5-nano`, que é de raciocínio. | Must | Sem a variável, `temperature` é omitido; com `OPENAI_SUPPORTS_TEMPERATURE=true`, é enviado. |
| RF-07 | `OPENAI_ORG_ID` opcional repassado ao cliente como `organization`. | Could | Sem a variável, nenhum header de organização é enviado. |
| RF-08 | Atualizar `.env.example` e `README.md` com as novas variáveis e o valor `openai` nas opções de provedor. | Must | Variáveis documentadas e comentadas. |
| RF-09 | O padrão de `LLM_PROVIDER` em `Config` passa de `gemini` para `openai`. Consequentemente, `ROUTER_PROVIDER` vazio também resolve para `openai`. | Must | `new Config({}).llmProvider === 'openai'` e `new Config({}).routerProvider === 'openai'`; o teste atual que espera `gemini` é atualizado. |
| RF-10 | `.env.example` passa a vir com `LLM_PROVIDER=openai` e `OPENAI_API_KEY` no topo da seção de LLM; `LLM_FALLBACK_PROVIDER` de exemplo passa a ser `gemini`. | Must | Copiar o `.env.example` e preencher só `OPENAI_API_KEY` (mais token e IDs do Telegram) basta para subir o bot. |
| RF-11 | Ao iniciar sem `LLM_PROVIDER` explícito, o startup loga `LLM_PROVIDER não definido; usando padrão "openai"`. | Should | Mensagem aparece uma vez no terminal, como INFO. |

### 6.2 Fluxo Principal (Happy Path)

1. Usuário copia o `.env.example` e preenche apenas `OPENAI_API_KEY=sk-...` (além do token e dos IDs do Telegram). Provedor (`openai`) e modelo (`gpt-5-nano`) já são os padrões.
2. `npm run dev` inicia e o log mostra `provider: openai`.
3. Usuário envia "que horas são?" pelo Telegram.
4. `SkillRouter` chama `OpenAIProvider.chat()` com `jsonMode` e recebe `{"skillName": null}`.
5. `AgentLoop` envia as tool definitions, a OpenAI retorna um tool call `data_hora_atual`, a observação volta e o modelo produz a resposta final.
6. A resposta é persistida pelo `MemoryManager` e entregue pelo `TelegramOutputHandler`.

### 6.3 Fluxos Alternativos

**Fluxo Alternativo A — Fallback a partir da OpenAI:**
1. `LLM_PROVIDER=openai` (padrão) e `LLM_FALLBACK_PROVIDER=gemini`, com as duas chaves preenchidas.
2. A OpenAI retorna 503 ou 429 e o `FallbackProvider` repete a mesma chamada no `GeminiProvider`.
3. O usuário recebe a resposta normalmente; o terminal registra o warning de fallback.

**Fluxo Alternativo D — Usuário existente que usava Gemini pelo padrão antigo:**
1. O `.env` tem `GEMINI_API_KEY` preenchida, mas não define `LLM_PROVIDER`.
2. Após a atualização, o padrão vira `openai` e `Config.validate()` acusa `OPENAI_API_KEY` ausente.
3. O startup encerra com a mensagem de configuração inválida, sugerindo definir `LLM_PROVIDER=gemini` para manter o comportamento anterior.

**Fluxo Alternativo B — Proxy ou Azure OpenAI:**
1. `OPENAI_BASE_URL` aponta para um proxy corporativo ou para o Azure OpenAI.
2. O provedor usa essa URL sem nenhuma outra mudança de código.

**Fluxo Alternativo C — Modelo não-raciocínio:**
1. Usuário define `OPENAI_MODEL` com um modelo que aceita `temperature` e `OPENAI_SUPPORTS_TEMPERATURE=true`.
2. O `SkillRouter` volta a enviar `temperature: 0`.

---

## 7. Requisitos Não-Funcionais

| ID | Requisito | Valor alvo | Observação |
|----|-----------|-----------|------------|
| RNF-01 | Timeout por chamada | `LLM_TIMEOUT_MS` (120 s) | Mesmo valor dos demais provedores (agent-loop RNF-01). |
| RNF-02 | Retries do SDK | 1 | Herdado de `OpenAICompatibleProvider`; falhas seguintes ficam com o `FallbackProvider`. |
| RNF-03 | Segredos | 0 vazamentos | `OPENAI_API_KEY` nunca aparece em logs nem em mensagens ao usuário (telegram-output §12). |

---

## 8. Design e Interface

Sem impacto visual. Mudanças restritas a:

```
src/config/Config.ts                 # ProviderName += 'openai'; providers.openai; validate
src/llm/OpenAIProvider.ts            # novo
src/llm/OpenAICompatibleProvider.ts  # flag supportsTemperature; organization opcional
src/llm/ProviderFactory.ts           # case 'openai'
.env.example / README.md             # documentação
tests/config.test.ts, tests/llm.test.ts
```

`OpenAICompatibleSettings` ganha dois campos opcionais: `supportsTemperature?: boolean` (padrão `true`, preservando Gemini, DeepSeek e Groq) e `organization?: string`. O `OpenAIProvider` passa `supportsTemperature` a partir de `OPENAI_SUPPORTS_TEMPERATURE` (padrão `false`).

Seção de LLM do `.env.example` após a mudança:

```env
# Provedor primário: openai | gemini | deepseek | groq (padrão: openai)
LLM_PROVIDER=openai
LLM_FALLBACK_PROVIDER=gemini

OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-nano
# gpt-5-nano é modelo de raciocínio e não aceita temperature
OPENAI_SUPPORTS_TEMPERATURE=false
# Opcional: proxy corporativo ou Azure OpenAI
OPENAI_BASE_URL=
OPENAI_ORG_ID=

GEMINI_API_KEY=
# ... demais provedores inalterados
```

---

## 9. Modelo de Dados

Sem alterações de schema. A coluna `conversations.provider` passa a poder conter `'openai'`.

---

## 10. Integrações e Dependências

| Dependência | Tipo | Impacto se indisponível |
|-------------|------|------------------------|
| SDK `openai` (já instalado) | Obrigatória | Nenhuma nova dependência. |
| API OpenAI (Chat Completions) | Obrigatória quando selecionada | Erro tratado como `LlmProviderError`; aciona o fallback, se configurado. |

---

## 11. Edge Cases e Tratamento de Erros

| Cenário | Trigger | Comportamento esperado |
|---------|---------|----------------------|
| EC-01: Chave inválida ou revogada | HTTP 401 | `LlmProviderError('openai', ..., 401)`; usuário recebe "⚠️ Erro: API Provider openai falhou (HTTP 401)..." sem detalhes da chave. |
| EC-02: Rate limit ou quota esgotada | HTTP 429 | Uma retentativa do SDK; depois, fallback ou erro amigável. |
| EC-03: Modelo inexistente ou sem acesso | HTTP 404 | Erro amigável; terminal loga o nome do modelo para correção no `.env`. |
| EC-04: Modelo de raciocínio recebe `temperature` | `OPENAI_SUPPORTS_TEMPERATURE=true` com um modelo de raciocínio | A API retorna 400; o erro vira `LlmProviderError` e o terminal loga a dica "verifique OPENAI_SUPPORTS_TEMPERATURE". Com o padrão (`false`) o cenário não ocorre. |
| EC-05: `jsonMode` sem a palavra "JSON" no prompt | Exigência da OpenAI para `response_format: json_object` | O prompt do `SkillRouter` já contém "JSON"; teste garante que continue contendo. |
| EC-06: `LLM_PROVIDER` com valor desconhecido | Ex.: `LLM_PROVIDER=gpt` | Cai para o padrão `openai` e o startup loga um warning com os valores aceitos. |
| EC-07: Upgrade sem `LLM_PROVIDER` explícito | `.env` antigo só com `GEMINI_API_KEY` | Erro fatal claro no startup: `API key do provider primário "openai" não definida. Defina OPENAI_API_KEY ou LLM_PROVIDER=gemini para manter o provedor anterior.` |

---

## 12. Segurança e Privacidade

- `OPENAI_API_KEY` fica apenas no `.env`, que já está no `.gitignore`.
- Mensagens ao usuário expõem só o nome do provedor (`API Provider openai falhou`).
- Os prompts saem da máquina local para a OpenAI, como já acontece com os demais provedores. O usuário escolhe conscientemente ao configurar `LLM_PROVIDER`.

---

## 13. Plano de Rollout

1. Implementar RF-01 a RF-06 e RF-08 a RF-10 com testes unitários (cliente OpenAI mockado; sem chamadas reais no CI).
2. Validação manual: `.env` sem `LLM_PROVIDER`, confirmando que o padrão `openai`/`gpt-5-nano` atende o happy path, o `SkillRouter` e um tool call.
3. Validação do fallback: `LLM_FALLBACK_PROVIDER=gemini` com a OpenAI forçada a falhar (chave inválida).
4. Validação do upgrade (EC-07): `.env` antigo só com `GEMINI_API_KEY` deve falhar no startup com a mensagem orientando a escolha.
5. Implementar RF-07 e RF-11 na sequência.
6. Registrar no README a mudança de padrão (Gemini → OpenAI) na seção "Decisões e desvios das specs", e atualizar `architecture.md` §2.6 e PRD G-02, que citam Gemini/DeepSeek como provedores de referência.

---

## 14. Open Questions

Resolvidas na revisão de 2026-10-17:

- ~~Modelo padrão~~ → `gpt-5-nano`.
- ~~Detecção de modelo de raciocínio~~ → apenas a flag explícita `OPENAI_SUPPORTS_TEMPERATURE` (padrão `false`), sem regex.
- ~~Provedor genérico compatível~~ → sim, em spec separada: [openai-compatible-provider.md](openai-compatible-provider.md).
- ~~Provedor padrão do sistema~~ → `openai` (antes `gemini`), conforme RF-09 a RF-11.
