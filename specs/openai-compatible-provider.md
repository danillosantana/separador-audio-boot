# Spec: OpenAI-Compatible Provider (LLMs Locais)

**Versão:** 1.1
**Status:** Aprovada
**Autor:** SeparadorAudioBot Agent
**Data:** 2026-10-17
**Reviewers:** Danillo
**Depende de:** [openai-provider.md](openai-provider.md) (flag `supportsTemperature` em `OpenAICompatibleProvider`)

---

## 1. Resumo

Adicionar um provedor genérico `openai-compatible` que aponta para qualquer servidor com API Chat Completions compatível com OpenAI, em especial servidores locais como Ollama, LM Studio, llama.cpp server e vLLM. Assim o SeparadorAudioBot pode raciocinar com um modelo rodando na própria máquina, sem enviar prompts para a nuvem.

---

## 2. Contexto e Motivação

**Problema:**
O PRD define o SeparadorAudioBot como agente 100% local, mas a inferência ainda depende de APIs na nuvem (Gemini, DeepSeek, Groq e, em breve, OpenAI). Não há como usar um modelo local, mesmo que o usuário já tenha Ollama ou LM Studio instalado.

**Evidências:**
- Ollama (`http://localhost:11434/v1`), LM Studio (`http://localhost:1234/v1`) e llama.cpp server expõem endpoints compatíveis com OpenAI.
- O `OpenAICompatibleProvider` já encapsula toda a lógica; só falta um provedor configurável por URL.
- Servidores locais variam muito no que suportam: muitos modelos não fazem function calling nem `response_format: json_object`.

**Por que agora:**
A spec [openai-provider.md](openai-provider.md) introduz a flag `supportsTemperature`. Este é o momento de generalizar as flags de capacidade, já que modelos locais precisam delas ainda mais.

---

## 3. Goals (Objetivos)

- [ ] G-01: Aceitar `openai-compatible` em `LLM_PROVIDER`, `LLM_FALLBACK_PROVIDER` e `ROUTER_PROVIDER`.
- [ ] G-02: Configurar URL, modelo e chave (opcional) exclusivamente pelo `.env`.
- [ ] G-03: Declarar capacidades do servidor por flags explícitas (temperature, tools e JSON mode), degradando com segurança quando um recurso não existe.
- [ ] G-04: Permitir uma configuração 100% local: agente e router rodando no modelo local, com um provedor de nuvem só como fallback opcional.

**Métricas de sucesso:**
| Métrica | Baseline atual | Target | Prazo |
|---------|---------------|--------|-------|
| Inferência possível sem internet | Não | Sim (texto e skills) | MVP |
| Servidores validados manualmente | 0 | Ollama (servidor de referência) | MVP |
| Erros 400 por recurso não suportado | Não medido | 0 com flags corretas | MVP |

---

## 4. Non-Goals (Fora do Escopo)

- NG-01: Instalar, iniciar ou gerenciar o servidor local ou baixar modelos. O usuário cuida disso.
- NG-02: Vários provedores compatíveis simultâneos (ex.: Ollama e LM Studio ao mesmo tempo). Um único `openai-compatible` por instância.
- NG-03: Emular function calling via prompt (ReAct textual) para modelos sem suporte nativo. Sem tools, o modelo só conversa e usa skills (ver RF-05).
- NG-04: Descobrir capacidades automaticamente consultando o servidor.

---

## 5. Usuários e Personas

**Usuário primário:** Danillo, que roda Ollama ou LM Studio no desktop e quer o agente funcionando offline ou sem custo de API.

**Módulos clientes:** `ProviderFactory`, `AgentLoop`, `SkillRouter` e `Config`.

---

## 6. Requisitos Funcionais

### 6.1 Requisitos Principais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|-----------|-------------------|
| RF-01 | `ProviderName` e `Config.parseProvider()` devem aceitar `openai-compatible`. | Must | `new Config({ LLM_PROVIDER: 'openai-compatible' }).llmProvider === 'openai-compatible'`. |
| RF-02 | Criar `src/llm/OpenAICompatibleGenericProvider.ts` estendendo `OpenAICompatibleProvider`, com `name = 'openai-compatible'`, lendo `COMPATIBLE_BASE_URL`, `COMPATIBLE_MODEL` e `COMPATIBLE_API_KEY`. | Must | `ProviderFactory.create('openai-compatible')` usa a URL e o modelo do `.env`. |
| RF-03 | `COMPATIBLE_API_KEY` é opcional; vazio vira um placeholder (`not-needed`), pois o SDK exige uma chave e servidores locais a ignoram. | Must | Provedor funciona contra Ollama sem chave definida. |
| RF-04 | `COMPATIBLE_BASE_URL` tem padrão `http://localhost:11434/v1` (Ollama, servidor de referência). `Config.validate()` exige apenas `COMPATIBLE_MODEL` quando o provedor é `openai-compatible`, e não exige chave. | Must | Sem `COMPATIBLE_BASE_URL`, o provedor usa a URL do Ollama; sem `COMPATIBLE_MODEL`, o start loga `COMPATIBLE_MODEL não definido` e encerra com exit code 1. |
| RF-05 | Flag `COMPATIBLE_SUPPORTS_TOOLS` (padrão `true`). Com `false`, o `AgentLoop` não envia `tools` e o system prompt deixa de mencionar ferramentas. | Must | Com a flag desligada, a requisição não contém `tools` e o agente responde em uma iteração. |
| RF-06 | Flag `COMPATIBLE_SUPPORTS_JSON_MODE` (padrão `true`). Com `false`, o `SkillRouter` não envia `response_format` e depende só do prompt e do parse tolerante já existente (`SkillRouter.parse`). | Must | Com a flag desligada, a requisição do router não contém `response_format`. |
| RF-07 | Flag `COMPATIBLE_SUPPORTS_TEMPERATURE` (padrão `true`), reutilizando o mecanismo da spec openai-provider. | Must | Com `false`, `temperature` é omitido. |
| RF-08 | O `ILlmProvider` passa a expor as capacidades (`capabilities: { tools, jsonMode, temperature }`), e `AgentLoop` e `SkillRouter` consultam esse objeto em vez de conhecer o provedor. | Must | Gemini, DeepSeek, Groq e OpenAI retornam as capacidades corretas; testes existentes continuam passando. |
| RF-09 | O `FallbackProvider` expõe as capacidades do primário e, ao cair para o secundário, ajusta as opções às capacidades dele. | Should | Primário sem tools e secundário com tools: o fallback recebe a chamada sem erro. |
| RF-10 | Atualizar `.env.example` e `README.md` tendo o Ollama como caminho recomendado (instalação, `ollama pull <modelo>`, variáveis). Outros servidores compatíveis aparecem só como nota de URL alternativa. | Must | README contém um passo a passo copiável para Ollama. |

### 6.2 Fluxo Principal (Happy Path)

1. Usuário roda `ollama serve` com um modelo que suporta tools.
2. Define no `.env`: `LLM_PROVIDER=openai-compatible` e `COMPATIBLE_MODEL=<modelo>` (a URL do Ollama já é o padrão).
3. `npm run dev` inicia e loga `provider: openai-compatible (http://localhost:11434/v1)`.
4. Usuário envia "crie um arquivo notas.md com minhas ideias" pelo Telegram.
5. O `SkillRouter` consulta o modelo local com JSON mode; o `AgentLoop` envia as tools; o modelo chama `criar_arquivo`; a observação volta; a resposta final é entregue.
6. Nenhuma requisição sai da máquina.

### 6.3 Fluxos Alternativos

**Fluxo Alternativo A — Modelo sem function calling:**
1. `COMPATIBLE_SUPPORTS_TOOLS=false`.
2. O `AgentLoop` roda sem tools e responde em uma iteração; pedidos que exigem ação recebem uma resposta explicando a limitação.

**Fluxo Alternativo B — Servidor local fora do ar com fallback na nuvem:**
1. `LLM_PROVIDER=openai-compatible` e `LLM_FALLBACK_PROVIDER=gemini`.
2. O servidor local não responde (ECONNREFUSED).
3. O `FallbackProvider` envia a chamada ao Gemini e loga o warning.

---

## 7. Requisitos Não-Funcionais

| ID | Requisito | Valor alvo | Observação |
|----|-----------|-----------|------------|
| RNF-01 | Timeout por chamada | `COMPATIBLE_TIMEOUT_MS` (padrão 300 s) | Modelos locais em CPU são lentos; não deve herdar os 120 s da nuvem. |
| RNF-02 | Privacidade | 0 requisições externas | Com o provedor local como primário e router, e sem fallback, nenhum prompt sai da máquina. |
| RNF-03 | Compatibilidade retroativa | 100% | Provedores atuais mantêm comportamento; todas as capacidades deles são `true`, exceto a flag de temperature da OpenAI. |

---

## 8. Design e Interface

Arquivos afetados:

```
src/config/Config.ts                         # ProviderName += 'openai-compatible'; leitura das COMPATIBLE_*; validate
src/llm/ILlmProvider.ts                      # interface LlmCapabilities; ILlmProvider.capabilities
src/llm/OpenAICompatibleProvider.ts          # capabilities a partir das settings; omite tools/response_format/temperature
src/llm/OpenAICompatibleGenericProvider.ts   # novo
src/llm/FallbackProvider.ts                  # repassa capabilities; adapta opções no fallback
src/llm/ProviderFactory.ts                   # case 'openai-compatible'
src/core/AgentLoop.ts                        # envia tools só se capabilities.tools
src/core/SystemPromptBuilder.ts              # seção ReAct condicionada a tools
src/skills/SkillRouter.ts                    # jsonMode/temperature condicionados às capabilities
```

Variáveis novas no `.env.example`:

```env
# ===== Provedor compatível com OpenAI (LLM local) =====
# Recomendado: Ollama (https://ollama.com) -> ollama pull <modelo>
# Padrão: http://localhost:11434/v1 (Ollama). Outros servidores: ex. LM Studio http://localhost:1234/v1
COMPATIBLE_BASE_URL=http://localhost:11434/v1
COMPATIBLE_MODEL=
COMPATIBLE_API_KEY=
COMPATIBLE_SUPPORTS_TOOLS=true
COMPATIBLE_SUPPORTS_JSON_MODE=true
COMPATIBLE_SUPPORTS_TEMPERATURE=true
COMPATIBLE_TIMEOUT_MS=300000
```

---

## 9. Modelo de Dados

Sem alterações de schema. `conversations.provider` passa a poder conter `'openai-compatible'`.

---

## 10. Integrações e Dependências

| Dependência | Tipo | Impacto se indisponível |
|-------------|------|------------------------|
| SDK `openai` (já instalado) | Obrigatória | Nenhuma dependência nova. |
| Servidor local (Ollama, LM Studio, etc.) | Obrigatória quando selecionado | `LlmProviderError`; aciona o fallback, se configurado. |
| Spec openai-provider (flag `supportsTemperature`) | Pré-requisito | Implementar antes, ou junto. |

---

## 11. Edge Cases e Tratamento de Erros

| Cenário | Trigger | Comportamento esperado |
|---------|---------|----------------------|
| EC-01: Servidor desligado | ECONNREFUSED | `LlmProviderError('openai-compatible', ...)`; fallback, se houver, ou "⚠️ Erro: API Provider openai-compatible falhou. Verifique se o servidor local está rodando." |
| EC-02: Modelo não baixado no servidor | HTTP 404 | Erro amigável; terminal loga o nome do modelo e a URL. |
| EC-03: Flag de tools ligada em modelo sem suporte | Servidor retorna 400 ou ignora as tools | Se 400: erro com a dica "verifique COMPATIBLE_SUPPORTS_TOOLS". Se ignorar: resposta em texto, sem quebra. |
| EC-04: Router sem JSON mode responde texto livre | Modelo pequeno não segue o formato | `SkillRouter.parse` retorna `null` e o fluxo segue sem skill. |
| EC-05: Inferência lenta | Modelo grande em CPU | Respeita `COMPATIBLE_TIMEOUT_MS`; o indicador "digitando..." continua ativo durante a espera. |
| EC-06: URL sem `/v1` | `COMPATIBLE_BASE_URL=http://localhost:11434` | Startup loga um warning sugerindo o sufixo `/v1`; não corrige automaticamente. |
| EC-07: Tool call com JSON malformado (comum em modelos pequenos) | Argumentos inválidos | Tratamento existente do `AgentLoop` (agent-loop EC-01) pede correção ao modelo. |

---

## 12. Segurança e Privacidade

- URLs fora de `localhost`/`127.0.0.1` são permitidas (ex.: servidor na rede local), mas o startup loga um aviso de que os prompts sairão da máquina.
- `COMPATIBLE_API_KEY`, quando usada, segue as mesmas regras das demais chaves: nunca aparece em logs nem nas mensagens ao usuário.

---

## 13. Plano de Rollout

1. Implementar a spec [openai-provider.md](openai-provider.md) (pré-requisito da flag `supportsTemperature`).
2. Implementar RF-08 (capabilities) com testes provando que nada muda para os provedores atuais.
3. Implementar RF-01 a RF-07 e RF-10, com testes de cliente mockado para cada combinação de flags.
4. Validação manual com Ollama (um modelo com tools e outro sem, usando `COMPATIBLE_SUPPORTS_TOOLS=false`).
5. Implementar RF-09 (fallback ciente das capacidades).

---

## 14. Open Questions

Resolvidas na revisão de 2026-10-17:

- ~~Recomendação de execução local~~ → Ollama é o servidor recomendado e de referência (URL padrão, README e validação manual). O modelo específico fica a critério do usuário via `COMPATIBLE_MODEL`.
- ~~Router sempre local~~ → não. O router segue a regra atual (`ROUTER_PROVIDER` vazio = provedor primário), sem recomendação de rodar localmente quando o agente usa nuvem.
