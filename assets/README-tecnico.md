# 🎲 Bot de Call of Cthulhu + Overlay para OBS — Referência técnica

> Versão direta (Pra quem sabe o que ta fazendo). Para o passo a passo guiado, veja o [`README.md`](../README.md).

---

## Como funciona

```
  Planilha do Google  ◄──lê fichas, lê/grava Registros────►┌─────────────┐
                                                           │             │
  Discord (/rl, /registrar) ─────────────────────────────► │   index.js  │
                                                           │   (o bot)   │
  Bot Rollem (rolagens soltas) ─────────────────────────►  │             │
                                                           └──────┬──────┘
                                                                  │ WebSocket (porta 8080)
                                                                  ▼
                                                           overlayOBS.html  ──►  sua live no OBS
```

`index.js` conversa com Discord e Google (lê fichas, lê/grava `/registrar` na aba Registros) e transmite cada rolagem via WebSocket para `overlayOBS.html`. Sem `index.js` rodando, o overlay fica vazio.

---

## O que o bot faz

| Recurso | Descrição |
|---|---|
| **Fichas no Google Sheets** | Lê FOR, DES, INT, CON, APA, POD, TAM, EDU, Sorte, Sanidade e perícias direto da planilha. |
| **`/registrar`** | Vincula usuário do Discord ↔ aba da ficha. Persistido na planilha (sobrevive a reinícios/deploys). |
| **`/rl`** | Rola perícia com autocomplete, calcula nível de sucesso. |
| **Regras CoC 7e** | Crítico Absoluto (01), Extremo (⅕), Bom (½), Normal, Falha, Desastre. |
| **Vantagem/Desvantagem** | Dado de dezena extra, usa melhor ou pior resultado. |
| **Overlay OBS** | Cartão animado, cor conforme resultado. |
| **Sons** | Som padrão em toda rolagem + som especial em crítico/desastre. |
| **Suporte Rollem** | Rolagens do bot Rollem também aparecem no overlay (detecção por username exato `rollem`). |
| **Histórico** | Últimas 1000 rolagens (`/rl` + Rollem) na aba **Rolagens**: `Data`, `Jogador`, `Pericia`, `Alvo`, `Resultado`, `Status`. FIFO automático. |

---

## Pré-requisitos

- Node.js 18+
- Bot criado no [Discord Developer Portal](https://discord.com/developers/applications) com **Message Content Intent** ativado (sem isso o bot não sobe)
- Service Account do Google com **Sheets API** ativada
- Planilha no formato esperado (ver abaixo)
- Arquivo `.env` na raiz do projeto

**Discord:** criar aplicação → aba Bot → Reset Token → ativar Message Content Intent em Privileged Gateway Intents → OAuth2 URL Generator com scopes `bot` + `applications.commands` e permissions `Send Messages`, `Read Message History`, `Embed Links`, `View Channels`.

**Google:** criar projeto no Google Cloud Console → ativar Google Sheets API → APIs e serviços → Credenciais → Criar credenciais → Conta de serviço → gerar chave JSON. `client_email` e `private_key` do JSON viram as variáveis de ambiente abaixo. Compartilhar a planilha como "Qualquer pessoa com o link → Editor" cobre a Service Account; se a conta for Workspace com esse compartilhamento bloqueado, compartilhar diretamente com o `client_email`.

---

## `.env`

```env
DISCORD_TOKEN=
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
SPREADSHEET_ID=
```

| Variável | Origem |
|---|---|
| `DISCORD_TOKEN` | Discord Developer Portal → Bot → Token |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` do JSON da Service Account |
| `GOOGLE_PRIVATE_KEY` | `private_key` do JSON — entre aspas, numa linha só, `\n` literais (não converter para quebra de linha real) |
| `SPREADSHEET_ID` | Trecho da URL entre `/d/` e `/edit` |

Sem espaços em volta do `=`. `.gitignore` deve conter `.env` e `node_modules`.

---

## Formato da planilha (ignorar caso usar a disponibilizada)

Uma aba por investigador. Leitura por padrão de texto no intervalo **A1:P100** (não por posição fixa), exceto Sanidade.

| Campo | Regra de detecção | Exemplo |
|---|---|---|
| **Nome do personagem** | Célula exatamente `Nome:`, valor até 3 colunas à direita | `B3 = Nome:` · `D3 = Arthur Wallace` |
| **Perícias** | Texto com `%` entre parênteses; valor 2 colunas à direita (ou 1, se a 2ª estiver vazia) | `B12 = Psicologia (10%)` · `D12 = 45` |
| **Atributos** | Célula exatamente `FOR`/`DES`/`INT`/`CON`/`APA`/`POD`/`TAM`/`EDU`, valor 1 coluna à direita | `B5 = FOR` · `C5 = 60` |
| **Sorte** | Célula exatamente `Sorte`, valor 1–2 colunas à direita | `B9 = Sorte` · `C9 = 55` |
| **Sanidade** | Célula fixa **M8**; se vazia, procura rótulo `Atual` até 3 linhas abaixo de `Sanidade` | `M8 = 65` |

Restrições: valores precisam ser numéricos reais (`45`, não `45%`). Nome da perícia = texto antes do parêntese de porcentagem (`Lutar (Briga) (25%)` → `Lutar (Briga)`). Nada fora de P100 é lido. Ficha é lida uma vez no `/registrar`; mudanças exigem rodar `/registrar` de novo.

---

## Comandos

### `/registrar`

Pré-condição: a ficha do jogador precisa existir como uma aba própria dentro da mesma planilha compartilhada (não uma planilha separada por jogador) — geralmente duplicando a aba modelo.

```
/registrar personagem: <nome da aba>
```

`personagem` — autocomplete com os nomes das abas da planilha. Resposta ephemeral. Grava o vínculo `UserID → Ficha` na aba **Registros** (criada automaticamente na primeira execução).

### `/rl`

```
/rl pericia: <nome> [vantagem: Vantagem (Bônus) | Desvantagem]
```

`pericia` — autocomplete com perícias, atributos, Sorte e Sanidade lidos da ficha vinculada ao usuário.
`vantagem` — opcional; rola d10 extra de dezena e usa o melhor (Vantagem) ou pior (Desvantagem) resultado.

**Tabela de resultado:**

| Rolagem | Status |
|---|---|
| `01` | Crítico Absoluto |
| ≤ ⅕ do valor | Sucesso Extremo |
| ≤ ½ do valor | Sucesso Bom |
| ≤ valor | Sucesso Normal |
| > valor | Falha |
| `100`, ou `96–99` com perícia < 50 | Desastre |

---

## Deploy (Render ou equivalente)

O bot lê `process.env.PORT` e cai para `8080` local — nenhuma alteração de código é necessária.

1. Subir repositório para o GitHub sem `.env`.
2. Criar Web Service conectado ao repo.
3. Build command: `npm install`
4. Start command: `node index.js`
5. Environment variables: `DISCORD_TOKEN`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` (com `\n` literais), `SPREADSHEET_ID`
6. Em `overlayOBS.html`, apontar o WebSocket para o endereço gerado: `wss://seu-app.onrender.com`

No plano free do Render o serviço hiberna sem tráfego. Keep-alive via UptimeRobot (ping HTTP na URL raiz a cada 5 min) evita a hibernação — a rota raiz do `index.js` já responde `200 OK` para isso.

**IP de saída compartilhado (Render):** os blocos `74.220.50.0/24` e `74.220.58.0/24` são usados por múltiplos serviços; abuso de terceiros pode levar o Discord a bloquear o bloco inteiro temporariamente, derrubando bots sem relação entre si. Costuma normalizar em horas. Alternativas com IP fixo: **Render Dedicated IP** (add-on pago); **Oracle Cloud Always Free** (grátis, aprovação de conta inconsistente); **VM free-tier do Google Cloud** (grátis, sem a pegadinha de aprovação da Oracle, 1GB egress/mês); **Discloud/Square Cloud** (hospedagem de bot BR, sem IP fixo divulgado — confirmar antes de migrar). Oracle e GCP exigem provisionar o servidor manualmente (sem deploy automático via Git).

---

## Personalização

Tudo em `overlayOBS.html` (índice no topo do arquivo):

| O quê | Onde |
|---|---|
| Cores | `:root { --cor-normal, --cor-crit, --cor-falha, --cor-texto, --cor-fundo }` (hex; `--cor-fundo` em `rgba()`) |
| Nº de cartões simultâneos | `const maxMensagens = 6;` |
| Tamanho dos cartões | Definido pela Browser Source do OBS, não pelo código |
| Sons | Arquivos `.mp3` (`diceroll1-3.mp3`, `crit.mp3`, `falhacrit.mp3`) mantendo os nomes; volume em `tocarSom(somRolagem, 0.8)` |

Em `index.js` (seção "GUIA RÁPIDO" no topo):

| O quê | Onde |
|---|---|
| Mensagens de `/registrar` | Strings nos `interaction.editReply(...)` — preservar interpolações `${...}` |
| Mensagem de "não registrado" | String em `interaction.reply({ content: ... })` |
| Textos/cores de resultado (`/rl`) | `resultadoTexto` e `corEmbed` (hex `0x...`) no bloco de `if/else` por status |
| Layout do embed | `EmbedBuilder().setTitle/.setDescription/.addFields` |
| Detecção do Rollem | Match por username exato `rollem` — editar se usar outro bot de dados |

---

## Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| `Used disallowed intents` | Message Content Intent desligado | Ativar em Bot → Privileged Gateway Intents. |
| `An invalid token was provided` | Token errado/espaço sobrando | Resetar token no Developer Portal. |
| `/rl` não aparece no Discord | Comandos ainda propagando | Aguardar e recarregar o client (`Ctrl+R`). |
| `The caller does not have permission` | Planilha não compartilhada com a Service Account | Compartilhar como Editor (link ou `client_email`). |
| `Google Sheets API has not been used...` | Sheets API não ativada no projeto correto | Ativar no Google Cloud Console. |
| `DECODER routines` / `Invalid PEM formatted message` | `GOOGLE_PRIVATE_KEY` mal formatada no `.env` | Aspas, linha única, `\n` literais. |
| `Não encontrei aba contendo "..."` | Nome digitado ≠ nome da aba | Usar autocomplete do `/registrar`. |
| Jogador precisa registrar de novo | Aba Registros apagada/renomeada, ou perdeu permissão de Editor | Checar existência da aba e compartilhamento. |
| `/rl` sem perícias | Planilha fora do formato esperado | Revisar formato acima; valores precisam ser numéricos. |
| Overlay em branco | WebSocket apontando errado, ou bot desligado | Conferir `ws://localhost:8080` / `wss://...` e processo do bot. |
| Cartões sem som | Áudio não roteado no OBS | *Controlar áudio via OBS* + Mixer → Propriedades Avançadas de Áudio. |
| `EADDRINUSE: port 8080` | Outra instância já rodando | Fechar processo duplicado. |
| `Error: No key or keyFile set.` | `GOOGLE_PRIVATE_KEY` ausente/vazia/nome errado no ambiente de deploy | Conferir as env vars do serviço certo. |
| `iam.disableServiceAccountKeyCreation` | Política padrão do Google bloqueando criação de chave | Desativar em IAM e admin → Políticas da organização. |
| Env vars não aparecem no Render | Mudança de layout do menu | Acessar `https://dashboard.render.com/web/SEU_SERVICE_ID/env`. |
| Bot cai sem motivo, outros bots no Render também caem | Bloqueio temporário do bloco de IP compartilhado do Render | Ver seção Deploy acima. |

Debug do overlay: fonte de navegador → botão direito → **Interagir** → `F12`.

---

## Estrutura de arquivos

```
├── index.js           # bot: Discord, Google Sheets (leitura/escrita), servidor WebSocket
├── overlayOBS.html    # overlay OBS (HTML+CSS+JS)
├── Ficha-CoC-modelo.xlsx  # ficha modelo (Alan) — cálculos automáticos
├── package.json
├── .env
├── crit.mp3
├── falhacrit.mp3
└── diceroll1-3.mp3
```

---

## Créditos

**Alan** — `Ficha-CoC-modelo.xlsx`, planilha modelo com Vida, Sanidade, atributos e perícias calculados automaticamente.

---

## Licença

**AGPL-3.0**. Uso, cópia, modificação e redistribuição livres, inclusive comercial, desde que: versões modificadas permaneçam sob a mesma licença; se usado para oferecer um serviço via rede, o código-fonte correspondente seja disponibilizado aos usuários desse serviço. Texto completo em [`LICENSE`](LICENSE).
