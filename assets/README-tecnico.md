# 🎲 Bot de Call of Cthulhu + Overlay para OBS — Referência técnica

> Versão direta (Pra quem sabe o que ta fazendo). Para o passo a passo guiado, veja o [`README.md`](../README.md).

---

## Como funciona

```
  Planilha do Google  ◄──lê fichas, lê/grava Registros e Rolagens──►┌─────────────┐
                                                                    │             │
  Discord (/rl, /registrar) ──────────────────────────────────────► │   index.js  │
                                                                    │   (o bot)   │
  Bot Rollem (rolagens soltas) ───────────────────────────────────► │             │
                                                                    └──────┬──────┘
                                                                           │ WebSocket (PORT, padrão 8080)
                                                             ┌─────────────┴─────────────┐
                                                             ▼                           ▼
                                                      overlayOBS.html              Dados3D.html
                                                      (cartões + som)              (2× D10 3D)
                                                             └─────────────┬─────────────┘
                                                                           ▼
                                                                     sua live no OBS

  Planilha (aba OBS_Export) ──CSV por HTTPS, poll de 3s──► CthulhuStatus.html ──► OBS   (NÃO passa pelo bot)
```

`index.js` conversa com Discord e Google (lê fichas, lê/grava `/registrar` na aba Registros, grava o histórico na aba Rolagens) e transmite cada rolagem via WebSocket para `overlayOBS.html` e/ou `Dados3D.html`. Sem `index.js` rodando, esses dois overlays ficam vazios. O `CthulhuStatus.html` (HUD de Vida/Sanidade/Magia) é independente: baixa uma aba da planilha direto do Google e funciona com o bot desligado.

---

## O que o bot faz

| Recurso | Descrição |
|---|---|
| **Fichas no Google Sheets** | Lê FOR, DES, INT, CON, APA, POD, TAM, EDU, Sorte, Sanidade e perícias direto da planilha. |
| **`/registrar`** | Vincula usuário do Discord ↔ aba da ficha. Persistido na planilha (aba Registros; sobrevive a reinícios/deploys). |
| **`/rl`** | Rola perícia com autocomplete, calcula nível de sucesso. |
| **Regras CoC 7e** | Crítico Absoluto (01), Extremo (⅕), Bom (½), Normal, Falha, Desastre. |
| **Vantagem/Desvantagem** | Dado de dezena extra, usa melhor ou pior resultado. |
| **Overlay de cartões** (`overlayOBS.html`) | Cartão animado, cor conforme resultado. Mostra também rolagens genéricas do Rollem (`1d20`, `3d6`...). |
| **Overlay de dados 3D** (`Dados3D.html`) | Dois D10 (dezena + unidade) com física, quique e animação de vantagem/desvantagem. Sem áudio. Opcional; funciona junto ou no lugar dos cartões. |
| **HUD de status** (`CthulhuStatus.html`) | Cartões com barras de Vida/Sanidade/Magia lidos de uma aba da planilha. Independente do bot. |
| **Sons** | Som padrão em toda rolagem + som especial em crítico/desastre (só no `overlayOBS.html`). |
| **Suporte Rollem** | Rolagens do bot Rollem também aparecem nos overlays (detecção por username exato `rollem`). No 3D, só d100/d10. |
| **Histórico** | Últimas 1000 rolagens (`/rl` + Rollem) na aba **Rolagens**: `Data`, `Jogador`, `Pericia`, `Alvo`, `Resultado`, `Status`. FIFO automático; gravação assíncrona (erro fica só no log). |

---

## Pré-requisitos

- Node.js 18+
- Bot criado no [Discord Developer Portal](https://discord.com/developers/applications) com **Message Content Intent** ativado (sem isso o bot não sobe)
- Service Account do Google com **Sheets API** ativada
- Planilha no formato esperado (ver abaixo)
- Arquivo `.env` na raiz do projeto

Dependências (`npm install`): `discord.js`, `ws`, `google-spreadsheet`, `google-auth-library`, `dotenv`. Start: `node index.js`.

**Discord:** criar aplicação → aba Bot → Reset Token → ativar Message Content Intent em Privileged Gateway Intents → OAuth2 URL Generator com scopes `bot` + `applications.commands` e permissions `Send Messages`, `Read Message History`, `Embed Links`, `View Channels`.

**Google:** criar projeto no Google Cloud Console → ativar Google Sheets API → APIs e serviços → Credenciais → Criar credenciais → Conta de serviço → gerar chave JSON. `client_email` e `private_key` do JSON viram as variáveis de ambiente abaixo. Compartilhar a planilha como "Qualquer pessoa com o link → Editor" cobre a Service Account; se a conta for Workspace com esse compartilhamento bloqueado, compartilhar diretamente com o `client_email`.

---

## `.env`

```env
DISCORD_TOKEN=
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
SPREADSHEET_ID=
# opcionais
PORT=8080
DEBUG_DISCORD=false
```

| Variável | Origem |
|---|---|
| `DISCORD_TOKEN` | Discord Developer Portal → Bot → Token |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` do JSON da Service Account |
| `GOOGLE_PRIVATE_KEY` | `private_key` do JSON — entre aspas, numa linha só, `\n` literais (não converter para quebra de linha real) |
| `SPREADSHEET_ID` | Trecho da URL entre `/d/` e `/edit` |
| `PORT` *(opcional)* | Porta do servidor WebSocket/HTTP. Padrão `8080`; hospedagens (Render etc.) injetam a própria. Se mudar localmente, mudar também nos overlays. |
| `DEBUG_DISCORD` *(opcional)* | `true` imprime mensagens `[DEBUG]` (conexão, reconexão, rate limits). |

Sem espaços em volta do `=`. `.gitignore` deve conter `.env` e `node_modules` (e o `.json` da Service Account, se estiver dentro da pasta do projeto).

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

Restrições: valores precisam ser numéricos reais (`45`, não `45%`). Nome da perícia = texto antes do parêntese de porcentagem (`Lutar (Briga) (25%)` → `Lutar (Briga)`). Nada fora de P100 é lido. Ficha é lida uma vez no `/registrar` (e ressincronizada na inicialização a partir da aba Registros); mudanças na ficha exigem rodar `/registrar` de novo.

**Abas criadas pelo bot** (não apagar nem renomear; se sumirem, ele recria vazias e o conteúdo anterior se perde):

| Aba | Colunas | Uso |
|---|---|---|
| `Registros` | `UserID`, `Ficha` | Vínculo usuário → aba da ficha. Criada no primeiro boot. |
| `Rolagens` | `Data`, `Jogador`, `Pericia`, `Alvo`, `Resultado`, `Status` | Histórico (máx. 1000 linhas, a mais antiga é removida). Criada na primeira rolagem. |

A `ficha/Ficha_CoC_Modelo.xlsx` (Alan) já vem no formato esperado, com Vida, Sanidade e perícias calculadas.

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

| Rolagem | Status | Cor no overlay |
|---|---|---|
| `01` | Crítico Absoluto | verde + som especial |
| ≤ ⅕ do valor | Sucesso Extremo | padrão |
| ≤ ½ do valor | Sucesso Bom | padrão |
| ≤ valor | Sucesso Normal | padrão |
| > valor | Falha | padrão |
| `100`, ou `96–99` com perícia < 50 | Desastre | vermelho + som especial |

### Rollem

O bot observa mensagens do usuário `rollem` (username exato). Qualquer rolagem dele (`2d6+3`, `1d100`...) aparece nos cartões; o nome exibido é o apelido de quem pediu. Outro bot de dados exige editar essa checagem no `index.js`.

---

## Overlays no OBS

Cada overlay é uma **Browser Source** separada (Arquivo local).

| Arquivo | Fonte de dados | Tamanho sugerido | Áudio |
|---|---|---|---|
| `overlay/overlayOBS.html` | WebSocket do bot | 420 × 600 (adapta-se ao tamanho da fonte) | ✅ marcar *Controlar áudio via OBS* |
| `overlay/Dados3D.html` (+ `dado3d.js` na mesma pasta) | WebSocket do bot | Cena inteira (ex.: 1920 × 1080); os dados quicam nas bordas da fonte | ❌ |
| `overlay/CthulhuStatus.html` | CSV do Google Sheets | Cena inteira (ex.: 1920 × 1080); cartões grudam no topo/base | ❌ |

Comum aos três: **Desligar a fonte quando não estiver visível** desmarcado; manter a estrutura da pasta `overlay/` (sons ao lado do `overlayOBS.html`, `dado3d.js` ao lado do `Dados3D.html`). Cache preso: propriedades da fonte → **Atualizar cache da página atual**.

### Endereço do bot (`overlayOBS.html` e `Dados3D.html`)

Padrão: `ws://localhost:8080`.

| Cenário | `overlayOBS.html` | `Dados3D.html` |
|---|---|---|
| Local, porta padrão | nada a mudar | nada a mudar |
| Local, outra porta (`PORT=9000` no `.env`) | `enderecoDoBot = 'ws://localhost:9000'` | `urlLocal: 'ws://localhost:9000'` |
| Nuvem | `enderecoDoBot = 'wss://seu-app.onrender.com'` | `urlNuvem: 'wss://seu-app.onrender.com'` (o `urlLocal` pode ficar: tenta o PC primeiro, cai pra nuvem se não achar nada) |

`ws://` (local) vs `wss://` (nuvem, TLS): trocar isso é a causa mais comum de overlay vazio.

### Dados 3D

O overlay **não sorteia nada**: o número vem do bot; o `Dados3D.html` (física, tela) e o `dado3d.js` (desenho e rotação do D10) só animam até a face correta. d100 = dois D10 (dezena 00–90 e unidade 0–9). Em vantagem/desvantagem os dados de dezena extras aparecem só pra ilustrar e somem. Rolagens do Rollem que não sejam d100/d10 são ignoradas pelo 3D (sem aviso). Um aviso pequeno no canto inferior indica conexão/erro e some sozinho; `debug: true` mostra o que o bot enviou.

---

## HUD de status (`CthulhuStatus.html`)

Cartões com **Vida, Sanidade e Magia** por jogador. **Não usa o bot nem WebSocket**: faz `fetch` do CSV de exportação de uma aba do Google Sheets a cada 3 s (com `&t=<timestamp>` anti-cache) e redesenha tudo. Só o computador do OBS precisa de internet (planilha + Google Fonts Cinzel/Roboto, com fallback).

### Configuração

Em `CthulhuStatus.html`, constante `csvUrl`:

```javascript
const csvUrl = 'https://docs.google.com/spreadsheets/d/SEU_ID/export?format=csv&gid=SEU_GID';
```

- `SEU_ID` = mesmo `SPREADSHEET_ID` do `.env`.
- `SEU_GID` = número após `#gid=` na URL, **da aba `OBS_Export (NAO MEXER)`** (não de uma ficha).
- A planilha precisa estar como "Qualquer pessoa com o link" (a exportação CSV é feita sem autenticação). No repositório público, mantenha `COLE_O_ID_AQUI` e `SEU_GID_AQUI` como placeholders: o ID dá acesso à planilha.
- Teste: abrir o link numa aba anônima deve baixar/mostrar o CSV.

### Formato da aba (colunas A–G, nesta ordem)

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| Nome | PV Atual | PV Max | SAN Atual | SAN Max | PM Atual | PM Max |

Regras do parser:

- Linha 1 (cabeçalho) ignorada; o que vale é a ordem das colunas.
- Linha ignorada se o nome estiver vazio ou se tiver menos de 7 campos.
- `parseFloat` nos valores: atual inválido → `0`; máximo inválido/zero → `1`. Largura da barra = `min(atual / max × 100, 100)`; o número exibido não é limitado.
- Parser CSV ingênuo (`split(',')`, sem tratar aspas): **sem vírgula em nome**, valores em inteiros sem vírgula decimal.
- Layout: com `n` jogadores, `meio = ceil(n / 2)`; os primeiros `meio` (ordem da planilha) vão pra **base**, o resto pro **topo**.
- Erros: resposta HTTP não-ok mostra `#debug-box` vermelha ("Erro de Conexão"); falha de rede/CORS (ex.: planilha privada redireciona pro login) só loga no console (`F12` via **Interagir**).

### Script de criação da aba: `ficha/HUD_criar_aba.gs`

Google Apps Script (roda dentro do Sheets, sem Node nem Service Account) que monta a aba `OBS_Export (NAO MEXER)` com **fórmulas** apontando para cada ficha, então o HUD acompanha as fichas sozinho.

Instalação: planilha → **Extensões → Apps Script** → colar o arquivo → salvar → recarregar a planilha → menu **🎲 HUD → Criar / atualizar aba OBS_Export**. Primeira execução pede autorização (*"O Google não verificou este app"* → Avançado → Permitir); o script é container-bound e só toca na própria planilha.

Itens do menu (`onOpen`): **Criar / atualizar aba OBS_Export** (`criarAbaHUD`; se a aba existe, pede confirmação e refaz) e **Mostrar link do HUD** (`mostrarLinkHUD`). Ao terminar, abre um diálogo com a linha `const csvUrl = '...'` pronta (ID + `gid` já resolvidos), com botão de copiar.

Detecção de fichas: toda aba cujo nome **começa com `PREFIXO_FICHAS`** (comparação sem diferenciar maiúsculas), exceto a própria aba gerada e as que contêm algum trecho de `IGNORAR_SE_CONTIVER`. Ordem das linhas = ordem das abas na planilha.

Configuração (topo do script):

| Constante | Padrão | O que faz |
|---|---|---|
| `NOME_ABA_HUD` | `'OBS_Export (NAO MEXER)'` | Nome da aba gerada. O HUD usa o `gid`, então renomear não quebra. |
| `PREFIXO_FICHAS` | `'Ficha'` | Toda aba cujo nome começa com isso é uma ficha de jogador. |
| `IGNORAR_SE_CONTIVER` | `['modelo']` | Trechos no nome da aba que excluem (ex.: `Ficha Modelo` com nome de exemplo). |
| `CELULAS` | `['D3','M4','I4','M8','K8','M6','I6']` | Célula de cada campo na ficha, na ordem de `CABECALHO`. Valores da `Ficha_CoC_Modelo.xlsx`. |
| `CABECALHO` | `Nome, PV Atual, PV Max, SAN Atual, SAN Max, PM Atual, PM Max` | Cabeçalho da aba (ordem = ordem das colunas do HUD). |

Fórmula gerada por ficha (aspas simples no nome da aba são dobradas):

```
='Ficha 1 (Arthur)'!D3   ='Ficha 1 (Arthur)'!M4   ='Ficha 1 (Arthur)'!I4   ...
```

Nova ficha ou aba renomeada/apagada (`#REF!`): rodar o item do menu de novo.

---

## Deploy (Render ou equivalente)

O bot lê `process.env.PORT` e cai para `8080` local — nenhuma alteração de código é necessária.

1. Subir repositório para o GitHub sem `.env`.
2. Criar Web Service conectado ao repo.
3. Build command: `npm install`
4. Start command: `node index.js`
5. Environment variables: `DISCORD_TOKEN`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` (com `\n` literais), `SPREADSHEET_ID`
6. Apontar os overlays para o endereço gerado (`wss://seu-app.onrender.com`): `enderecoDoBot` no `overlayOBS.html` e `urlNuvem` no `Dados3D.html` (ver [Endereço do bot](#endereço-do-bot-overlayobshtml-e-dados3dhtml)). O `CthulhuStatus.html` não depende disso.

No plano free do Render o serviço hiberna sem tráfego. Keep-alive via UptimeRobot (monitor HTTP(S) na URL `https://` raiz do serviço, 5 min) evita a hibernação. O WebSocket roda sobre um servidor HTTP nativo do Node (módulo `http`, sem Express) e a rota raiz responde `200 OK` em texto: necessário porque o monitor HTTP não completa o handshake de WebSocket e marcaria falha.

**IP de saída compartilhado (Render):** os blocos `74.220.50.0/24` e `74.220.58.0/24` são usados por múltiplos serviços; abuso de terceiros pode levar o Discord a bloquear o bloco inteiro temporariamente, derrubando bots sem relação entre si (mesmo em contas diferentes). Costuma normalizar em horas. Confirmar com `DEBUG_DISCORD=true` + logs. Alternativas com IP fixo: **Render Dedicated IP** (add-on pago); **Oracle Cloud Always Free** (grátis, aprovação de conta inconsistente); **VM free-tier do Google Cloud** (grátis, IP fixo, sem região no Brasil, pede cartão, 1GB egress/mês pra fora da América do Norte; dá pra ligar só em dia de sessão); **Discloud/Square Cloud** (hospedagem de bot BR, sem IP fixo divulgado — confirmar antes de migrar). Oracle e GCP exigem provisionar o servidor manualmente (porta, `index.js` como serviço; sem deploy automático via Git).

---

## Personalização

### `overlayOBS.html` (índice no topo do arquivo)

| O quê | Onde |
|---|---|
| Cores | `:root { --cor-normal, --cor-crit, --cor-falha, --cor-texto, --cor-fundo }` (hex; `--cor-fundo` em `rgba()`) |
| Nº de cartões simultâneos | `const maxMensagens = 6;` |
| Tamanho dos cartões | Definido pela Browser Source do OBS, não pelo código |
| Endereço do bot | `enderecoDoBot` |
| Sons | Arquivos `.mp3` em `overlay/sons/` (`diceroll1-3.mp3`, `crit.mp3`, `falhacrit.mp3`) mantendo os nomes; volume em `tocarSom(somRolagem, 0.8)` (0 a 1) |

### `Dados3D.html` (bloco `CFG`; índice no topo, `Ctrl+F` "GUIA RÁPIDO")

| O quê | Chave | Padrão |
|---|---|---|
| Bot local / nuvem | `urlLocal` / `urlNuvem` | `'ws://localhost:8080'` / vazio |
| Tamanho do dado (px) | `tamanho` | `150` |
| Zona de queda (% da tela) | `zonaMinX`, `zonaMaxX`, `zonaMinY`, `zonaMaxY` | `25`–`75` |
| Tempo na tela (ms) | `vida` | `4000` |
| Rolagens simultâneas | `maxGrupos` | `4` |
| Nome + valor embaixo | `legenda` | `true` |
| Dado descartado (ms) | `descartado.delay` / `descartado.duracao` | `1500` / `2000` |
| Brilho crítico/desastre | `--cor-crit`, `--cor-falha` | `#2ee673`, `#ff4d5e` |
| Log do que o bot enviou | `debug` | `false` |

Bloco `fisica`: `atritoMesa` (menor = desliza mais), `atritoLinear` (o que faz parar de verdade), `gravidade`, `alturaInicial`, `restituicaoXY` (quique dado×dado, 0–1), `restituicaoParede` (quique nas bordas da fonte). Ajustar um por vez.

### `CthulhuStatus.html`

| O quê | Onde |
|---|---|
| Link da planilha | `csvUrl` |
| Intervalo de atualização | `setInterval(fetchAndRender, 3000)` (ms) |
| Largura do cartão | `.player-card { width: 220px }` |
| Espaço entre cartões / margem | `.hud-row { gap: 25px; padding: 20px 40px }` |
| Cores das barras | `.fill-hp`, `.fill-san`, `.fill-mp` (`linear-gradient`) |
| Detalhe do topo do cartão | `.player-card { border-top: 3px solid #8b0000 }` |
| Rótulos | Template em `card.innerHTML` (`❤️ Vida`, `🧠 Sanidade`, `✨ Magia`) |
| Todos na base / todos no topo | `const meio = jogadoresValidos.length` / `0` |
| Barras extras | Novo `stat-group` em `card.innerHTML` + leitura de mais colunas |

### `index.js` (seção "GUIA RÁPIDO" no topo)

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
| Overlay em branco | WebSocket apontando errado (`ws://` vs `wss://`, porta), ou bot desligado | Conferir `enderecoDoBot` / `urlLocal` / `urlNuvem` e o processo do bot. |
| Dados 3D: "o dado3d.js NÃO carregou" | `dado3d.js` fora da pasta do `Dados3D.html` | Manter os dois juntos em `overlay/` e limpar o cache da fonte. |
| Dados 3D: "não achei o bot" | Bot desligado, porta ≠ 8080 ou bot na nuvem sem `urlNuvem` | Conferir `urlLocal` / `urlNuvem` e o processo do bot. |
| Cartões aparecem, dados 3D não (ou vice-versa) | São duas Browser Sources separadas | Adicionar/ativar cada uma na cena. |
| Dados 3D espremidos, cortados ou sem quicar | Fonte pequena demais | Largura/Altura da fonte no tamanho da cena (ex.: 1920 × 1080). |
| Cartões sem som | Áudio não roteado no OBS | *Controlar áudio via OBS* + Mixer → Propriedades Avançadas de Áudio. |
| `EADDRINUSE: port 8080` | Outra instância (ou programa) na porta | Fechar processo duplicado ou definir `PORT` e ajustar os overlays. |
| `Error: No key or keyFile set.` | `GOOGLE_PRIVATE_KEY` ausente/vazia/nome errado no ambiente de deploy | Conferir as env vars do serviço certo (e `GOOGLE_SERVICE_ACCOUNT_EMAIL`). |
| `iam.disableServiceAccountKeyCreation` | Política padrão do Google bloqueando criação de chave | Desativar em IAM e admin → Políticas da organização. |
| Env vars não aparecem no Render | Mudança de layout do menu | Acessar `https://dashboard.render.com/web/SEU_SERVICE_ID/env`. |
| Bot cai sem motivo, outros bots no Render também caem | Bloqueio temporário do bloco de IP compartilhado do Render | Ver seção Deploy acima. |
| HUD: caixa vermelha "Erro de Conexão" | `csvUrl` com placeholder/ID errado, ou planilha fora de "Qualquer pessoa com o link" | Corrigir `csvUrl` e testar o link numa aba anônima. |
| HUD: nada aparece, sem caixa vermelha | Planilha privada (falha de CORS/rede), `gid` de outra aba ou aba vazia | Conferir compartilhamento e `gid`; `F12` via **Interagir**. |
| HUD: jogador não aparece | Na linha 1, nome vazio ou < 7 colunas | Primeiro jogador na linha 2, colunas A–G preenchidas. |
| HUD: `0/1` ou barra vazia | Célula com texto, `%` ou vírgula decimal, ou colunas fora de ordem | Inteiros puros e ordem Nome, PV Atual, PV Max, SAN Atual, SAN Max, PM Atual, PM Max. |
| HUD: não atualiza | Atraso do Google ou cache do OBS | Aguardar alguns segundos; **Atualizar cache da página atual**. |
| Script HUD: menu 🎲 HUD não aparece | Planilha não recarregada / `onOpen` não rodou | Salvar, `F5`; se persistir, executar `onOpen` uma vez no editor. |
| Script HUD: "Nenhuma ficha encontrada" ou ficha faltando | Nome da aba não começa com `Ficha` (ou contém "modelo") | Renomear a aba ou ajustar `PREFIXO_FICHAS` / `IGNORAR_SE_CONTIVER`. |
| Script HUD: `#REF!` / `#ERROR!` numa linha | Aba renomeada/apagada, ou ficha fora do layout de `CELULAS` | Rodar o item do menu de novo; ajustar `CELULAS`. |

Debug do overlay: fonte de navegador → botão direito → **Interagir** → `F12`. Debug do bot: `DEBUG_DISCORD=true`.

---

## Estrutura de arquivos

```
├── index.js                  # bot: Discord, Google Sheets (leitura/escrita), servidor WebSocket/HTTP
├── package.json
├── .env                      # não versionar
├── .gitignore
├── LICENSE
├── README.md
│
├── overlay/                  # tudo que vai pro OBS
│   ├── overlayOBS.html       # cartões (HTML+CSS+JS)
│   ├── Dados3D.html          # dados 3D (opcional)
│   ├── dado3d.js             # desenho/rotação do D10 (usado pelo Dados3D.html)
│   ├── CthulhuStatus.html    # HUD de Vida/Sanidade/Magia (independente do bot)
│   └── sons/
│       ├── crit.mp3
│       ├── falhacrit.mp3
│       └── diceroll1-3.mp3
│
├── ficha/
│   ├── Ficha_CoC_Modelo.xlsx # ficha modelo (Alan) — cálculos automáticos
│   └── HUD_criar_aba.gs      # Apps Script: gera a aba OBS_Export do HUD
│
└── assets/
    ├── README-tecnico.md     # este arquivo
    └── exemplo1-7.png/.webp  # imagens do README
```

`index.js` e `package.json` ficam na raiz: é onde `node index.js` e as hospedagens esperam encontrá-los.

---

## Créditos

**Alan** — `Ficha_CoC_Modelo.xlsx`, planilha modelo com Vida, Sanidade, atributos e perícias calculados automaticamente.

---

## Licença

**AGPL-3.0**. Uso, cópia, modificação e redistribuição livres, inclusive comercial, desde que: versões modificadas permaneçam sob a mesma licença; se usado para oferecer um serviço via rede, o código-fonte correspondente seja disponibilizado aos usuários desse serviço. Texto completo em [`LICENSE`](../LICENSE).
