# 🎲 Bot de Call of Cthulhu + Overlay para OBS

Bot de Discord que lê as fichas dos investigadores direto de uma planilha do Google Sheets, rola os testes de d100 aplicando as regras de Call of Cthulhu 7ª edição e mostra o resultado na sua live, em tempo real, com animação e som.

🌐 Este projeto também está disponível em [Inglês](https://github.com/henriquecoelhome-source/CoC_Bot_En.git).

> ⁉ **Nunca mexeu com programação?** Sem problema. Este guia foi escrito para você seguir do zero, na ordem, sem pular etapas. Leva cerca de 30 a 40 minutos na primeira vez.

> ⚡ **Já sabe o que está fazendo?** Pule direto para a [versão técnica](assets/README-tecnico.md).

> 🎯 **Só quer o bot de rolagens, sem exibir nada no OBS?** Você só precisa dos **Passos 1 a 7**. O [Passo 8](#passo-8--colocar-o-overlay-no-obs) e as seções de personalização ([cartões](#-personalizando-o-visual-e-os-sons) e [dados 3D](#-personalizando-os-dados-3d)) são só pra quem vai usar o overlay na live — pode pular direto pra [Como usar na mesa](#-como-usar-na-mesa) depois do Passo 7.

---

## 📑 Índice

- [Como fica na Live](#-como-fica-na-livegravação)
- [Como funciona](#-como-funciona)
- [O que o bot faz](#-o-que-o-bot-faz)
- [Antes de começar](#-antes-de-começar)
- [Passo 1 — Instalar o Node.js](#passo-1--instalar-o-nodejs)
- [Passo 2 — Baixar o projeto](#passo-2--baixar-o-projeto)
- [Passo 3 — Criar o bot no Discord](#passo-3--criar-o-bot-no-discord)
- [Passo 4 — Criar a Service Account do Google](#passo-4--criar-a-service-account-do-google)
- [Passo 5 — Preparar a planilha das fichas](#passo-5--preparar-a-planilha-das-fichas)
- [Passo 6 — Criar o arquivo .env](#passo-6--criar-o-arquivo-env)
- [Passo 7 — Instalar e ligar o bot](#passo-7--instalar-e-ligar-o-bot)
- [Passo 8 — Colocar o overlay no OBS](#passo-8--colocar-o-overlay-no-obs)
- [Como usar na mesa](#-como-usar-na-mesa)
- [Personalizando o visual e os sons](#-personalizando-o-visual-e-os-sons)
- [Personalizando os dados 3D](#-personalizando-os-dados-3d)
- [Deixando o bot online 24 horas](#-deixando-o-bot-online-24-horas-opcional)
- [Problemas comuns](#-problemas-comuns)
- [Créditos](#-créditos)
- [Licença](#-licença)

---
## 📸 Como fica na Live/Gravação

Abaixo você pode conferir o visual do overlay no OBS. Os cartões aparecem na tela em tempo real, acompanhados de efeitos sonoros.

**Rolagens nativas do próprio bot:**
Calculam automaticamente o nível de sucesso (Extremo, Bom, Normal, Falha ou Desastre) e aplicam cores correspondentes aos resultados de Call of Cthulhu 7ª edição, incluindo suporte a Vantagem e Desvantagem.

![Exemplo de rolagens com o bot](assets/exemplo1.png)

**Como rolagens aparecem no Discord:**

![Exemplo de rolagem no Discord](assets/exemplo4.png)

**Integração com o bot Rollem:**
Se a sua mesa utiliza o bot Rollem para rolagens de dano ou dados genéricos (como `1d20` ou `3d6`), o overlay também captura e exibe esses resultados.

![Exemplo de rolagens com o Rollem](assets/exemplo2.png)

**Exemplo em um layout completo:**

![Exemplo em um layout completo](assets/exemplo3.png)

<video src="assets/exemplo6.mp4" width="600" autoplay loop muted playsinline></video>

**Dados 3D (novo!):**
Além dos cartões, existe um segundo overlay que joga dois dados D10 em 3D na tela (um de dezena e um de unidade, igual a um d100 de mesa). Eles são arremessados, quicam nas bordas, batem um no outro e param no número que o bot sorteou. Em vantagem/desvantagem, os dados extras aparecem e somem devagar. Dá pra usar sozinho ou junto com os cartões — veja o [Passo 8](#passo-8--colocar-o-overlay-no-obs).

---
## 🔄 Como funciona

```
  Planilha do Google  ◄──lê fichas, lê/grava Registros────►┌─────────────┐
                                                           │             │
  Discord (/rl, /registrar) ─────────────────────────────► │   index.js  │
                                                           │   (o bot)   │
  Bot Rollem (rolagens soltas) ─────────────────────────►  │             │
                                                           └──────┬──────┘
                                                                  │ WebSocket (porta 8080)
                                                    ┌─────────────┴─────────────┐
                                                    ▼                           ▼
                                             overlayOBS.html            Dados3D.html
                                             (cartões + som)              (dados 3D)
                                                    └─────────────┬─────────────┘
                                                                  ▼
                                                            sua live no OBS
```

O `index.js` fica rodando no seu computador (ou num servidor). Ele conversa com o Discord e com o Google (lendo as fichas dos investigadores e também lendo/gravando os vínculos de `/registrar` na aba Registros), e transmite cada rolagem para os overlays (`overlayOBS.html` com os cartões e/ou `Dados3D.html` com os dados 3D), que você adiciona no OBS como fontes de navegador. **Se o `index.js` estiver desligado, o overlay fica vazio.**

---

## ✨ O que o bot faz

| Recurso | Descrição |
|---|---|
| **Fichas no Google Sheets** | Lê atributos (FOR, DES, INT, CON, APA, POD, TAM, EDU), Sorte, Sanidade e todas as perícias direto da planilha. |
| **`/registrar`** | Vincula o jogador do Discord à aba da ficha dele. O vínculo fica salvo na própria planilha e sobrevive a reinícios e deploys. |
| **`/rl`** | Rola a perícia com autocompletar e já calcula o nível de sucesso. |
| **Regras de CoC 7e** | Crítico Absoluto (01), Sucesso Extremo (⅕), Bom (½), Normal, Falha e Desastre. |
| **Vantagem / Desvantagem** | Rola um dado de dezena extra e usa o melhor (ou o pior) resultado. |
| **Overlay no OBS** | Cartão animado na tela, colorido conforme o resultado. |
| **Dados 3D no OBS** | Dois D10 (dezena + unidade) arremessados na tela, com física, quique e animação de vantagem/desvantagem. Opcional, funciona junto ou no lugar dos cartões. |
| **Sons automáticos** | Som de dado em toda rolagem + som especial em crítico e desastre. |
| **Suporte ao Rollem** | Rolagens feitas pelo bot Rollem também aparecem no overlay. |
| **Histórico de rolagens** | Guarda as últimas 1000 rolagens (`/rl` e Rollem) numa aba **Rolagens** da planilha, com data, jogador, perícia, alvo e resultado. |

---

## ✅ Antes de começar

Você vai precisar de:

- [ ] Um computador com Windows, macOS ou Linux
- [ ] Um servidor do Discord **onde você seja administrador**
- [ ] Uma conta Google
- [ ] O OBS Studio instalado (só para a parte do overlay)
- [ ] Cerca de 40 minutos

Ao longo do guia você vai anotar **quatro informações secretas**. Deixe um bloco de notas aberto para colar cada uma delas:

```
DISCORD_TOKEN = ...
GOOGLE_SERVICE_ACCOUNT_EMAIL = ...
GOOGLE_PRIVATE_KEY = ...
SPREADSHEET_ID = ...
```

> ⚠️ **Nunca poste esses valores em lugar nenhum** — nem no chat da live, nem em prints, nem no GitHub. Quem tiver o token do Discord ou a chave privada da Service Account assume o controle do seu bot (e da sua planilha).

---

## Passo 1 — Instalar o Node.js

O Node.js é o programa que executa o bot.

1. Acesse **<https://nodejs.org/>**.
2. Baixe a versão marcada como **LTS** (a recomendada, do lado esquerdo).
3. Instale clicando em *Avançar* até o fim, sem mudar nada.
4. Para conferir se deu certo, abra o terminal:
   - **Windows:** tecla `Windows`, digite `cmd`, abra o *Prompt de Comando*.
   - **macOS:** `Cmd + Espaço`, digite `Terminal`.
5. Digite o comando abaixo e aperte Enter:

```bash
node -v
```

Se aparecer algo como `v22.11.0`, está tudo certo. Se aparecer "comando não reconhecido", reinicie o computador e tente de novo.

---

## Passo 2 — Baixar o projeto

**Jeito fácil (sem Git):**

1. Na página do projeto no GitHub, clique no botão verde **Code** → **Download ZIP**.
2. Extraia o ZIP em uma pasta fácil de achar, por exemplo `C:\bot-coc` ou `Documentos/bot-coc`.

**Jeito com Git (se você já tem o Git instalado):**

```bash
git clone https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
cd SEU-REPOSITORIO
```

Ao final, sua pasta deve conter:

```
index.js  package.json  README.md  LICENSE  .gitignore
overlay/   (os overlays do OBS e a pasta de sons)
ficha/     (a ficha modelo em Excel)
assets/    (imagens do README e o guia técnico)
```

---

## Passo 3 — Criar o bot no Discord

### 3.1 Criar a aplicação

1. Acesse **<https://discord.com/developers/applications>** e faça login.
2. Clique em **New Application**, dê um nome (ex.: `Guardião`) e confirme.

### 3.2 Pegar o token

1. No menu lateral, clique em **Bot**.
2. Clique em **Reset Token** → **Yes, do it!** (confirme com a senha se pedir).
3. Clique em **Copy** e cole no seu bloco de notas em `DISCORD_TOKEN`.

> O token aparece **uma única vez**. Se perder, é só resetar de novo.

### 3.3 Ligar a permissão de leitura de mensagens ⚠️

Ainda na aba **Bot**, role até **Privileged Gateway Intents** e **ative**:

- [x] **MESSAGE CONTENT INTENT**

Clique em **Save Changes**.

> Sem o *Message Content Intent* o bot **nem liga** — ele fecha com erro logo ao iniciar. É o erro nº 1 de quem instala pela primeira vez.

### 3.4 Convidar o bot para o servidor

1. Menu lateral → **OAuth2** → **URL Generator**.
2. Em **Scopes**, marque: `bot` e `applications.commands`.
3. Em **Bot Permissions**, marque: `Send Messages`, `Read Message History`, `Embed Links` e `View Channels`.
4. Copie o link gerado lá embaixo, cole no navegador, escolha o seu servidor e autorize.

---

## Passo 4 — Criar a Service Account do Google

Para ler a planilha e também gravar os vínculos do `/registrar` direto nela, o bot precisa de uma **Service Account** do Google (uma espécie de "conta robô" com usuário e senha próprios).

1. Acesse **<https://console.cloud.google.com/>** e faça login.
2. No topo, clique no seletor de projeto → **Novo projeto** → dê um nome → **Criar**.
3. Com o projeto selecionado, use a busca do topo para achar **Google Sheets API** e clique em **Ativar**.
4. No menu lateral, vá em **APIs e serviços** → **Credenciais**.
5. Clique em **Criar credenciais** → **Conta de serviço**.
6. Dê um nome (ex.: `bot-coc`) e clique em **Concluir**. Pode pular as telas de papel/função e de acesso de usuários — não são necessárias aqui.
7. Na lista de contas de serviço, clique na que você acabou de criar.
8. Vá na aba **Chaves** → **Adicionar chave** → **Criar nova chave** → formato **JSON** → **Criar**.
9. Um arquivo `.json` é baixado no seu computador automaticamente. Abra-o num editor de texto (Bloco de Notas serve) — dentro dele estão os dois valores que você precisa:

```json
{
  "client_email": "bot-coc@seu-projeto.iam.gserviceaccount.com",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----\n"
}
```

10. Copie o valor de `client_email` para o bloco de notas em `GOOGLE_SERVICE_ACCOUNT_EMAIL`.
11. Copie o valor de `private_key` (com aspas e os `\n` inclusos, exatamente como está) para `GOOGLE_PRIVATE_KEY`.

> ⚠️ **Guarde bem esse `.json`** — ele dá acesso de leitura e escrita à sua planilha, igual a uma senha. Depois de copiar os dois valores para o `.env` (Passo 6), você não precisa mais manter o arquivo dentro da pasta do projeto — pode movê-lo para outro lugar fora do repositório. Ele **nunca** deve ir para o GitHub (veja o aviso no Passo 6 sobre o `.gitignore`).

---

## Passo 5 — Preparar a planilha das fichas

> 💡 **Já tem uma ficha modelo pronta neste repositório** (`ficha/Ficha_CoC_Modelo.xlsx`), criada pelo **Alan** 🏊‍♂️. Ela é **totalmente automática**: Vida, Sanidade, atributos e perícias já vêm com os cálculos prontos — é só duplicar e preencher os dados do seu investigador que o resto se ajusta sozinho. Baixe o arquivo, suba pro seu Google Drive, abra com o Google Planilhas (botão direito → *Abrir com* → *Google Planilhas*) e siga a partir do passo 5.1 abaixo para liberar o acesso.
>
> Em alguns casos, pode aparecer um bug visual leve nos atributos — aparece uma linha preta em algumas células por algum motivo — mas é só estético, não atrapalha os cálculos nem a leitura do bot.

### 5.1 Liberar o acesso

**Não use "Publicar na web"** — é outra coisa.

1. Abra sua planilha de fichas no Google Sheets.
2. Clique em **Compartilhar** (canto superior direito).
3. Em "Acesso geral", troque para **Qualquer pessoa com o link** → permissão **Editor** por que os jogadores precisam editar suas própias fichas (em páginas diferentes da mesma planilha).
4. Clique em **Concluído**.

> 💡 Isso já é suficiente para o bot também: uma Service Account é uma conta do Google como outra qualquer, então o link "qualquer pessoa com o link → Editor" cobre ela também — não precisa compartilhar de novo com o `client_email` dela. A exceção é se a sua conta Google faz parte de um Workspace (empresa/faculdade) que bloqueia esse tipo de compartilhamento por link; nesse caso, compartilhe também diretamente com o e-mail da Service Account (o `client_email` do Passo 4), com permissão **Editor**.

### 5.2 Pegar o ID da planilha

Olhe a URL da planilha:

```
https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz123456/edit?usp=sharing
                                      └─────────── isto é o ID ─────────┘
```

Copie **só o trecho entre `/d/` e `/edit`** e cole no bloco de notas em `SPREADSHEET_ID`.

### 5.3 Como a planilha precisa estar organizada (ignorar caso usar a disponibilizada)

O bot não usa posições fixas de célula (com uma exceção): ele procura padrões de texto dentro do intervalo **A1 até P100** de cada aba. Monte as fichas assim:

| O que | Como o bot encontra | Exemplo |
|---|---|---|
| **Uma ficha por aba** | Cada aba da planilha = um investigador. O nome da aba é o que aparece no `/registrar`. | aba `Ficha 1 (Arthur)` |
| **Nome do personagem** | Uma célula escrita exatamente `Nome:` e o valor até 3 colunas à direita. | `B3 = Nome:` · `D3 = Arthur Wallace` |
| **Perícias** | Texto com a porcentagem entre parênteses. O valor fica 2 colunas à direita (ou 1, se a 2 estiver vazia). | `B12 = Psicologia (10%)` · `D12 = 45` |
| **Atributos** | Célula com exatamente `FOR`, `DES`, `INT`, `CON`, `APA`, `POD`, `TAM` ou `EDU`, valor 1 coluna à direita. | `B5 = FOR` · `C5 = 60` |
| **Sorte** | Célula com exatamente `Sorte`, valor 1 ou 2 colunas à direita. | `B9 = Sorte` · `C9 = 55` |
| **Sanidade** | Lida da célula **M8**. Se não houver número ali, o bot procura um rótulo `Atual` nas 3 linhas abaixo da palavra `Sanidade`. | `M8 = 65` |

Pontos de atenção:

- O **valor** precisa ser número de verdade, não texto. `45` funciona; `45%` não.
- O nome da perícia é o que sobra depois de remover os parênteses — `Lutar (Briga) (25%)` vira **`Lutar (Briga)`** no autocompletar.
- Nada além da coluna **P** ou da linha **100** é lido.
- A ficha é lida **uma vez**, no `/registrar`. Mudou a planilha? É só rodar `/registrar` de novo.

---

## Passo 6 — Criar o arquivo .env

Dentro da pasta do projeto (a mesma do `index.js`), crie um arquivo de texto chamado **`.env`** — com o ponto na frente e **sem** `.txt` no final.

> **No Windows:** abra o Bloco de Notas, cole o conteúdo, clique em *Salvar como*, mude "Tipo" para **Todos os arquivos** e digite o nome `.env`.

Conteúdo:

```env
DISCORD_TOKEN=cole_aqui_o_token_do_discord
GOOGLE_SERVICE_ACCOUNT_EMAIL=cole_aqui_o_client_email_da_service_account
GOOGLE_PRIVATE_KEY="cole_aqui_a_private_key_da_service_account"
SPREADSHEET_ID=cole_aqui_o_id_da_planilha
```

Sem espaços em volta do `=`. A única que leva aspas é a `GOOGLE_PRIVATE_KEY` — ela sai do `.json` (Passo 4) em várias linhas, mas no `.env` precisa ficar **numa linha só**, entre aspas, com os `\n` exatamente como estão no arquivo original (não troque por quebras de linha de verdade). Deve ficar parecida com isto:

```env
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----\n"
```

**Opcional — modo debug:** por padrão o terminal mostra só o essencial. Se algum dia o bot der problema (por exemplo, parar de responder sem motivo) e você quiser ver o que o Discord está dizendo por trás, adicione mais uma linha no `.env`:

```env
DEBUG_DISCORD=true
```

Reinicie o bot e o terminal passa a mostrar mensagens `[DEBUG]` (conexão, reconexão, limites de uso...). Quando resolver, apague a linha ou troque por `false`. Não é preciso ligar isso no dia a dia.

> Se você for subir o projeto para o GitHub, garanta que existe um arquivo `.gitignore` contendo as linhas `.env` e `node_modules`. Se você guardou o `.json` da Service Account (Passo 4) dentro da pasta do projeto por comodidade, adicione o nome dele ao `.gitignore` também — ou, melhor ainda, mova-o para fora da pasta assim que copiar os dois valores para o `.env`.

---

## Passo 7 — Instalar e ligar o bot

Abra o terminal **dentro da pasta do projeto**:

- **Windows:** abra a pasta no Explorador, clique na barra de endereço, digite `cmd` e aperte Enter.
- **macOS:** clique com o botão direito na pasta → *Serviços* → *Novo Terminal na Pasta*.
- **Linux:** você é o cara que não precisa que eu te explique

Depois rode:

```bash
npm install
```

Isso baixa as bibliotecas (`discord.js`, `ws`, `google-spreadsheet`, `google-auth-library`, `dotenv`) e cria a pasta `node_modules`. Demora um ou dois minutos.

> Se der erro dizendo que não achou o `package.json`, instale manualmente:
> `npm install discord.js ws google-spreadsheet google-auth-library dotenv`

Agora ligue o bot digitando:

```bash
node index.js
```

Se tudo estiver certo, aparece algo como:

```
Servidor WebSocket iniciado — aguardando conexões do overlay na porta 8080.
Bot conectado como SeuBot#1234!
Planilha "Fichas CoC" carregada com sucesso!
Registros carregados da planilha: 0 vínculo(s) de usuário → ficha.
Histórico de rolagens carregado: 0 linha(s) na aba "Rolagens".
Buffer de histórico do overlay repovoado com 0 rolagem(ns) vinda(s) da planilha.
```

Na primeiríssima vez, o bot cria sozinho uma aba **Registros** na planilha (com as colunas `UserID` e `Ficha`) para guardar os vínculos do `/registrar` — não precisa criar essa aba na mão. Nas próximas vezes que o bot ligar, aparecerá também uma linha por ficha já registrada, tipo `Ficha "Ficha 1 (Arthur)" resincronizada.`, confirmando que os jogadores não vão precisar rodar `/registrar` de novo.

🎉 **O bot está no ar.** Deixe essa janela do terminal aberta — fechar o terminal desliga o bot.

Se você só quer usar o bot de rolagens, já está tudo pronto. Veja [Como usar na mesa](#-como-usar-na-mesa), como [deixar o bot online 24 horas](#-deixando-o-bot-online-24-horas-opcional) ou consulte a seção de [Problemas comuns](#-problemas-comuns) caso tenha tido algum problema.


## Passo 8 — Colocar o overlay no OBS

### 8.1 Escolher o overlay

O projeto vem com dois overlays. Você pode usar só um ou os dois ao mesmo tempo (cada um vira uma fonte de navegador separada no OBS):

| Arquivo | O que mostra | Som |
|---|---|---|
| `overlay/overlayOBS.html` | Cartões com jogador, perícia, alvo e resultado. Mostra também as rolagens genéricas do Rollem (`1d20`, `3d6`...). | ✅ |
| `overlay/Dados3D.html` | Dados D10 em 3D arremessados na tela (dezena + unidade), com vantagem/desvantagem. Só anima rolagens de d100/d10. | ❌ |

> O `Dados3D.html` usa o `dado3d.js`, que fica **na mesma pasta** dele (`overlay`). E como ele não toca som, se você quiser o áudio dos dados na live, deixe também o `overlayOBS.html` ligado.

### 8.2 Conferir o endereço do bot

Os dois overlays já vêm prontos pra falar com o bot rodando **no seu computador, na porta 8080** (`ws://localhost:8080`). Se você seguiu o guia até aqui, **não precisa mudar nada**: pode pular direto pro [8.3](#83-adicionar-no-obs).

Só mexa nisso se você se encaixar em um destes casos. Abra o arquivo do overlay num editor de texto e use `Ctrl + F` pra achar a linha indicada.

**Caso A — o bot está usando outra porta**

A porta aparece na primeira linha que o bot escreve no terminal ("...aguardando conexões do overlay na porta 8080"). Se a 8080 já estava ocupada por outro programa (erro `EADDRINUSE`) e você quer usar outra, coloque uma linha `PORT=9000` no seu `.env`, reinicie o bot e troque o número nos overlays:

- `overlayOBS.html` → procure `enderecoDoBot` e deixe `'ws://localhost:9000'`
- `Dados3D.html` → procure `urlLocal` e deixe `'ws://localhost:9000'`

**Caso B — o bot está na nuvem** (Render etc., veja [Deixando o bot online 24 horas](#-deixando-o-bot-online-24-horas-opcional))

- `overlayOBS.html` → procure `enderecoDoBot` e troque por `'wss://seu-app.onrender.com'`
- `Dados3D.html` → procure `urlNuvem` (vem vazio) e preencha com `'wss://seu-app.onrender.com'`. O `urlLocal` pode ficar como está: o overlay tenta o seu PC primeiro e, se não achar nada rodando, usa a nuvem.

> Repare: `ws://` (local, sem "s") e `wss://` (nuvem, com "s"). Trocar isso é a causa mais comum de "o overlay não mostra nada".

### 8.3 Adicionar no OBS

1. No OBS, em **Fontes**, clique em **+** → **Navegador**.
2. Dê um nome (ex.: `Rolagens CoC` ou `Dados 3D`) e clique em OK.
3. Marque a caixa **Arquivo local**.
4. Em **Arquivo local**, clique em *Procurar* e abra a pasta `overlay` e selecione o `overlayOBS.html` (cartões) ou o `Dados3D.html` (dados 3D).
5. Defina o tamanho:
   - **Cartões:** Largura **420** e Altura **600** (ajuste depois ao seu gosto, o layout se adapta).
   - **Dados 3D:** use o tamanho da cena inteira, por exemplo **1920 x 1080**. Os dados voam pela tela toda e quicam nas bordas da fonte, então uma fonte pequena deixa tudo espremido.
6. Deixe **Desligar a fonte quando não estiver visível** desmarcado.
7. Marque **Controlar áudio via OBS** (na fonte dos cartões) para que os sons dos dados entrem na transmissão.
8. Clique em **OK** e posicione o overlay na cena. No caso dos dados 3D, coloque a fonte por cima do resto do layout.

> Tudo que está dentro da pasta `overlay` precisa ficar junto: os sons (pasta `sons`) ao lado do `overlayOBS.html`, e o `dado3d.js` ao lado do `Dados3D.html`. Não mova um HTML sozinho para outro lugar. Se quiser levar o overlay pra outra pasta, leve a pasta `overlay` inteira.

### 8.4 Testar

Com o bot rodando, use `/rl` no Discord. O cartão deve surgir no OBS em menos de um segundo, e os dados 3D aparecem voando e param no número da rolagem.

Se não aparecer nada: clique com o botão direito na fonte → **Interagir**, e depois **Atualizar cache da página atual**.

> No canto de baixo do overlay 3D aparece um aviso pequeno ("Dados 3D: conectado ao bot...") quando ele abre ou quando algo dá errado. Ele some sozinho depois de uns segundos, e ajuda a descobrir o problema. Pra ver mais detalhes, ligue o `debug` (veja [Personalizando os dados 3D](#-personalizando-os-dados-3d)).

---

## 🎮 Como usar na mesa

### `/registrar`
 
Cada jogador roda uma vez, no início — mas antes disso, cada um precisa ter sua própria ficha como **uma aba dentro da mesma planilha** (geralmente duplicando a aba modelo), não uma planilha separada por jogador:
 
```
/registrar personagem: Ficha 1 (Arthur)
```

O campo tem autocompletar com os nomes das abas da planilha. A resposta é privada (só o jogador vê).

> O vínculo fica salvo numa aba **Registros** (colunas `UserID` e `Ficha`) que o próprio bot cria na planilha, se ela ainda não existir. Por estar na planilha (e não no disco do bot), o vínculo sobrevive a reinícios, quedas e até a um novo deploy — ninguém precisa rodar `/registrar` de novo depois disso. Evite apagar ou renomear essa aba manualmente; se isso acontecer, o bot cria outra em branco e os jogadores precisam se registrar de novo.

### `/rl`

```
/rl pericia: Psicologia
/rl pericia: Esquivar  vantagem: Vantagem (Bônus)
```

O campo `pericia` sugere tudo que o bot leu da ficha daquele jogador. Perícias, atributos, Sorte e Sanidade.
Ao começar a digitar o comando, o auto completar também já sugere os comandos possíveis, assim não tendo q escrever corretamente o nome completo dos comandos ou perícias. 

![Exemplo de autocompletar do comando /rl](./assets/exemplo5.png)

### Tabela de resultados

| Resultado da rolagem | Status | Cor no overlay |
|---|---|---|
| Exatamente **01** | Crítico Absoluto | 🟢 verde + som especial |
| ≤ ⅕ do valor da perícia | Sucesso Extremo | 🟠 padrão |
| ≤ ½ do valor | Sucesso Bom | 🟠 padrão |
| ≤ valor da perícia | Sucesso Normal | 🟠 padrão |
| Acima do valor | Falha | 🟠 padrão |
| **100**, ou 96–99 com perícia abaixo de 50 | Desastre | 🔴 vermelho + som especial |

**Vantagem** rola um dado de dezena extra e fica com o menor total. **Desvantagem** fica com o maior.

### 📜 Histórico de rolagens (aba "Rolagens")

Toda rolagem — tanto pelo `/rl` quanto pelo Rollem — fica registrada numa aba **Rolagens** que o bot cria sozinho na planilha na primeira rolagem (igual acontece com a aba Registros). Colunas: `Data`, `Jogador`, `Pericia`, `Alvo`, `Resultado`, `Status`.

O bot mantém só as **últimas 1000 linhas**: sempre que uma rolagem nova é gravada e o total passa de 1000, a mais antiga é apagada automaticamente. Você não precisa fazer nada — só não apague nem renomeie a aba manualmente (se apagar, o bot cria outra em branco e o histórico anterior se perde).

> A gravação acontece em paralelo, sem atrasar a resposta do `/rl` no Discord nem o envio pro overlay. Se der algum erro ao gravar (ex.: planilha sem permissão), ele fica só no log do bot — não quebra a rolagem nem a live.

### Rolagens pelo Rollem

Se o bot **Rollem** estiver no servidor, qualquer rolagem feita por ele (`2d6+3`, `1d100` etc.) também aparece no overlay, num formato mais simples. O nome exibido é o apelido de quem pediu a rolagem no servidor.

> Funciona porque o bot procura mensagens de um usuário cujo nome seja exatamente `rollem`. Se você usar outro bot de dados, é preciso editar essa linha no `index.js`.

---

## 🎨 Personalizando o visual e os sons

A melhor parte desse projeto é que ele é totalmente customizável. O padrão foca em Call of Cthulhu, mas isso é só o ponto de partida: quem quiser pode ir além, adaptando o overlay e o index para rodar qualquer ficha ou sistema — isso já entra em território de programação.

Mas calma, você não precisa saber programar pra fazer a maioria das alterações. Trocar cores, ajustar quantos cards aparecem na tela, o tamanho deles, ou trocar os sons das rolagens e críticos é simples e não exige nenhum conhecimento técnico — só editar alguns valores num arquivo de texto.

> Para fazer essas alterações, você pode usar **qualquer editor de texto** comum (até mesmo o Bloco de Notas). Porém, recomendo muito que você baixe um editor de código leve e gratuito, como o [Sublime Text](https://www.sublimetext.com/) ou o [VS Code](https://code.visualstudio.com/). Com a ferramenta certa, a visualização muda da água pro vinho. O editor colore as palavras e, o mais importante, **exibe o número das linhas**. Como eu criei uma espécie de índice indicando exatamente em qual linha você precisa ir para modificar cada coisa, usar um programa desses torna tudo muito mais rápido e fácil.

A seguir, mostro como mexer nos parâmetros para alterar cores, quantidade de mensagens, tamanho e sons.

Os ajustes dos cartões ficam no `overlayOBS.html`, no começo do arquivo (use Ctrl+F pra localizar facilmente). Os do dado 3D ficam no `Dados3D.html`, e estão numa seção própria mais abaixo: [Personalizando os dados 3D](#-personalizando-os-dados-3d).

---

### 🎨 Cores

```css
:root {
    --cor-normal: #ffb648;   /* rolagem comum */
    --cor-crit:   #2ee673;   /* crítico */
    --cor-falha:  #ff4d5e;   /* desastre */
    --cor-texto:  #f2f2f2;
    --cor-fundo:  rgba(20, 20, 22, 0.92);  /* último número = transparência */
}
```

> **Como mudar as cores:** os valores como `#ffb648` são **códigos hexadecimais**. Para encontrar a sua própria cor, pesquise por "Seletor de cores" no Google, escolha a cor desejada, copie o código com o `#` e cole no arquivo.
>
> Já a `--cor-fundo`, que usa `rgba(20, 20, 22, 0.92)`, funciona diferente: os três primeiros números são a cor (RGB) e o último (`0.92`) é o nível de transparência, onde `1` é totalmente sólido e `0` é invisível.

---

### 🃏 Quantidade de cartões na tela

```javascript
const maxMensagens = 6;
```

> Controla quantos cartões ficam visíveis ao mesmo tempo antes do mais antigo sumir (padrão: 6). É só trocar o número — bem intuitivo, sem segredo.

---

### 📐 Tamanho dos cartões

Essa parte nem precisa mexer no arquivo. O script foi feito pra se adaptar automaticamente ao espaço reservado pra ele — quem define o tamanho real é o próprio OBS, nas propriedades da fonte de Browser.

Pra ajustar:

1. No OBS, clique com o botão direito na fonte do overlay (a Browser Source) e selecione **Propriedades**.
2. Altere os campos **Largura** e **Altura** pro tamanho que você quiser.
3. Clique em **OK** — o overlay se redimensiona sozinho, na hora, sem precisar editar nada no código.

> Quanto maior a largura e a altura definidas no OBS, mais espaço os cartões têm pra aparecer. Se eles ficarem cortados ou espremidos, é só aumentar esses valores por ali mesmo.

---

### 🔊 Sons

Substitua os arquivos `.mp3` da pasta `overlay/sons`, mantendo exatamente os mesmos nomes:

- `diceroll1.mp3`, `diceroll2.mp3`, `diceroll3.mp3` — sons de rolagem comum (um é sorteado a cada vez)
- `crit.mp3` — toca depois da rolagem, em caso de crítico
- `falhacrit.mp3` — toca depois da rolagem, em caso de desastre

O volume fica em:

```javascript
tocarSom(somRolagem, 0.8);
```

> Troque `0.8` por um valor entre `0` e `1` pra ajustar o volume.

---

## 🎲 Personalizando os dados 3D

Tudo isso fica no `Dados3D.html`, dentro do bloco `CFG` (logo no começo do script). O arquivo tem um **ÍNDICE** no topo, e você também pode dar `Ctrl + F` em **"GUIA RÁPIDO"** pra pular entre os pontos. Não precisa saber programar: troque os números (ou `true`/`false`), salve e atualize a fonte no OBS.

| O que mudar | Procure por | Exemplo |
|---|---|---|
| Porta do bot | `urlLocal` | `'ws://localhost:8080'` |
| Endereço do bot na nuvem | `urlNuvem` | `'wss://seu-app.onrender.com'` (vem vazio) |
| Tamanho de cada dado | `tamanho` | `150` (pixels) |
| Onde os dados caem na tela | `zonaMinX`, `zonaMaxX`, `zonaMinY`, `zonaMaxY` | `25` e `75` (% da tela) |
| Quanto tempo ficam na tela | `vida` | `4000` (4 segundos) |
| Quantas rolagens ao mesmo tempo | `maxGrupos` | `4` |
| Nome + valor embaixo dos dados | `legenda` | `true` ou `false` |
| Quanto tempo o dado descartado fica antes de sumir | `descartado` → `delay` e `duracao` | `1500` e `2000` (ms) |
| Cores do brilho de crítico/desastre | `--cor-crit`, `--cor-falha` | `#2ee673`, `#ff4d5e` |
| Mostrar o que o bot mandou (pra achar erro) | `debug` | `true` |

> As cores funcionam igual às dos cartões: códigos hexadecimais, que você acha pesquisando "Seletor de cores" no Google.

### 🎯 Física do arremesso

É a "sensação" dos dados caindo, e aqui não existe certo ou errado: é gosto. Mude **um** valor por vez, salve, veja como ficou e vá afinando. Fica no bloco `fisica`. Os mais divertidos:

| Valor | O que faz |
|---|---|
| `atritoMesa` | Menor = o dado desliza mais (tipo gelo). Maior = para mais rápido (tipo mesa). |
| `atritoLinear` | É o que faz o dado parar **de verdade**. Sem ele, o dado desliza pra sempre. |
| `gravidade` | Maior = arco mais curto e pesado. |
| `alturaInicial` | A altura de onde o dado é jogado. |
| `restituicaoXY` | O quique quando um dado bate no outro (0 = sem quique, 1 = borracha). |
| `restituicaoParede` | O quique nas bordas da fonte do OBS. |

> Se quiser deixar tudo maior, nem precisa mexer no `tamanho`: aumente a Largura/Altura da fonte de navegador no OBS que o overlay se adapta sozinho.

### 🎲 Como o dado 3D funciona (curiosidade)

O dado **não sorteia nada**: o número quem decide é o bot. O overlay só pega o resultado e gira o dado até a face certa (o arquivo `dado3d.js` cuida do desenho e da rotação, e o `Dados3D.html` cuida da física e da tela). Um d100 vira dois D10: um mostra a dezena (00, 10, 20... 90) e o outro a unidade (0 a 9). Nas rolagens de vantagem/desvantagem, os dados de dezena extras aparecem só pra ilustrar e somem depois.

> No Rollem, só as rolagens de d100 e d10 viram dados 3D. Rolagens como `1d20` ou `3d6` aparecem nos cartões, mas o overlay 3D ignora (sem nenhum aviso na tela).

---

## 🤖 Personalizando as mensagens e o visual no Discord

Além do overlay para o OBS, você também pode personalizar as respostas do bot e o visual das rolagens diretamente no Discord. Tudo isso fica no arquivo `index.js`. 

No topo do arquivo, há um **ÍNDICE** indicando as linhas exatas de onde modificar cada coisa, ou você pode usar o atalho Ctrl+F no seu editor e buscar por "GUIA RÁPIDO" para pular direto para as seções configuráveis.

A seguir, mostro como mexer nos principais parâmetros de mensagens:

---

### 💬 Mensagens de resposta do /registrar

```javascript
if (!sheet) return interaction.editReply(`Não encontrei aba contendo "${busca}".`);
// ...
interaction.editReply(`Conta vinculada com sucesso à **${sheet.title}**!`);
// ...
interaction.editReply(`Erro ao ler a ficha **${sheet.title}**.`);
```

> **Como mudar os textos:** O texto dentro das crases (\`) é livre e você pode reescrever as mensagens de sucesso, erro ou de ficha não encontrada como preferir. O único cuidado importante é **manter os trechos com `${...}`** (como `${busca}` e `${sheet.title}` nos lugares certos), pois é ali que o bot injeta os nomes dinamicamente.

---

### ⚠️ Mensagem de "Não registrou ficha"

```javascript
if (!personagem) return interaction.reply({ content: 'Use `/registrar [nome]` primeiro.', flags: MessageFlags.Ephemeral });
```

> Essa é a mensagem de aviso que aparece para quem tenta usar o comando `/rl` sem ter vinculado uma conta a uma ficha antes. É só trocar a frase entre aspas simples para algo da sua preferência (o texto é livre).

---

### 🎨 Cores e textos dos resultados (/rl)

```javascript
if (totalFinal === 1) {
    resultadoTexto = '**CRÍTICO ABSOLUTO (01)**';
    corEmbed = 0xFFD700;
// ...
} else if (isFumble) {
    resultadoTexto = '**DESASTRE**';
    corEmbed = 0x8B0000;
```

> **Textos:** Você pode alterar as palavras que definem o resultado da rolagem entre aspas à vontade, podendo inclusive adicionar emojis (exemplo: `'💀 **DESASTRE** 💀'`).
>
> **Cores:** Aqui, o bot também usa códigos hexadecimais para colorir a barrinha lateral da caixa de mensagem no Discord. A única diferença para o CSS é que, em vez do tradicional `#`, você usa `0x` antes do código (ex: `0xFFD700` é amarelo). É só trocar os números e letras depois do `0x` pela cor que você preferir.

---

### 🗂️ Layout do Embed (Caixa de mensagem)

```javascript
const embed = new EmbedBuilder()
    .setTitle(`${nomeParaOBS} rolou ${periciaNome}`)
    .setDescription(`**Alvo:** ${valorBase}  |  Bom: ${valorBom}  |  Extremo: ${valorExtremo}`)
    .addFields(
        { name: `Rolagem${avisoVant}`, value: `Dezena(s): ...` },
        { name: 'Status', value: resultadoTexto }
    )
```

> Essa parte constrói a "caixinha" (Embed) da rolagem que aparece no chat.
> - **setTitle / setDescription:** Definem o título principal e a linha descritiva logo abaixo no embed. Reescreva o texto se desejar, mas lembre-se de preservar as variáveis `${variavel}`.
> - **addFields:** Cada bloco `{ name, value }` é uma seção visual dentro da caixa. O `name` é o título em negrito daquela seção (ex: "Rolagem" ou "Status") e o `value` é o seu conteúdo. Dá pra trocar facilmente esses nomes ou até adicionar um *field* novo na estrutura.


### 💡 Dicas (se você quebrar o código)

Se você nunca mexeu com código antes, é normal ficar com receio de estragar alguma coisa. Aqui vão algumas dicas de ouro para você testar e modificar o arquivo sem medo:

 Repita comigo **NÃO VOU USAR BLOCO DE NOTAS.** 
> Sério. Use o [Sublime Text](https://www.sublimetext.com/) ou o [VS Code](https://code.visualstudio.com/) como recomendei ali em cima. O Bloco de Notas nativo do Windows não colore o texto, não tem numeração de linha e só vai te fazer passar raiva na hora de achar o que mudar.

 **A magia do Ctrl+Z**
> Usando um editor de verdade (como o [Sublime](https://www.sublimetext.com/)), você pode fuçar à vontade. Mudou algo? Salva o arquivo (`Ctrl + S`), atualiza no OBS ou no navegador e vê se funcionou. Se o overlay quebrar, é só voltar no editor, dar um `Ctrl + Z` pra desfazer a bagunça, salvar e testar de novo. Você faz tudo isso sem precisar fechar o programa e sem o Windows dar aquele erro chato de *"este arquivo está sendo usado e não pode ser modificado"*.

 **Quebrou tudo, nem o Ctrl+Z não resolve mais**
> **Não baixe o projeto de novo para substituir o arquivo inteiro**. Se você fizer isso, vai perder todas as outras configurações que já ajustou (cores, limite de mensagens, etc). 
> 
> A solução é simples: vá até o repositório original do projeto no seu navegador, abra o arquivo original por lá, copie **apenas** o bloco de código que você estragou e cole por cima da parte quebrada no seu computador.>

 **Como assim "copiar só um pedaço"? (Exemplo prático)**
> 
> Quando dizemos "copia o bloco", pode parecer confuso saber onde começa e onde termina. O segredo aqui é usar **dois pontos de referência** (um teto e um chão) ao redor da parte que você acha que quebrou.
> 
> Imagine que você estava alterando as cores e o overlay parou de funcionar porque você apagou um ponto e vírgula sem querer. Você não precisa procurar o erro exato, basta fazer o seguinte:
> 
> 1. No seu código quebrado, encontre uma linha intacta **antes** da bagunça (exemplo: a linha `:root {`). Esse é o seu Ponto A.
> 2. Encontre uma linha intacta logo **depois** da bagunça (exemplo: a chave de fechamento `}`). Esse é o seu Ponto B.
> 3. Vá no código original do repositório.
> 4. Selecione exatamente do Ponto A até o Ponto B e copie.
> 5. Volte no seu arquivo quebrado, selecione o mesmo trecho (do Ponto A ao Ponto B) e cole por cima.
> 
> Pronto. Pode ser qualquer parte do arquivo, desde que você pegue essas duas "âncoras" iguais nos dois lados. Mesmo que você acabe copiando linhas extras que já estavam certas, colar usando as âncoras garante que você conserte o erro sem duplicar código ou deixar algo pela metade.

 ### ⚡ Mais alguns detalehes pra não se perder:
 
> * **Espaços não importam:** O editor costuma deixar um baita espaço vazio à esquerda do código (indentação) — isso é só pra leitura, apagar ou bagunçar esses espaços não quebra absolutamente nada.
> * **Cuidado com aspas e ponto-e-vírgula:** Apagar sem querer uma única aspa (`"`) ou um ponto-e-vírgula (`;`) no final da linha é o motivo número 1 de um código parar de funcionar do nada.
> * **Maiúsculas e minúsculas são diferentes:** O código é chato com isso; se o original estava escrito `maxMensagens`, escrever `maxmensagens` vai fazer o programa não reconhecer o comando.
> * **Textos "inúteis" (comentários):** Tudo que aparecer no editor depois de `//` ou entre `/*` e `*/` é só uma anotação pra você ler; o computador ignora e você pode apagar ou escrever o que quiser ali.
> * **Salvou e não mudou nada?** Às vezes o OBS "prende" a versão velha do arquivo. Abra as propriedades da fonte no OBS, desça tudo e clique no botão "Atualizar cache da página atual".

---

## ☁️ Deixando o bot online 24 horas (opcional)

Rodando no seu PC, o bot morre junto com o computador. Para deixá-lo sempre ligado, use um serviço de hospedagem como o [Render](https://render.com/).

**Não precisa editar nada no `index.js` para isso.** O bot já vem pronto para nuvem: ele detecta a porta que o serviço de hospedagem define (`process.env.PORT`) e cai de volta pra 8080 se rodar local, sem precisar mudar nada. É só subir o projeto.

1. Suba o projeto para um repositório no GitHub (**sem o `.env`**).
2. No Render, crie um **Web Service** conectado a esse repositório.
3. Em *Build Command* use `npm install` e em *Start Command* use `node index.js`.
4. Em **Environment**, cadastre `DISCORD_TOKEN`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` e `SPREADSHEET_ID` como variáveis (cole a `GOOGLE_PRIVATE_KEY` com os `\n` literais, igual está no `.env`).
5. Depois do deploy, o Render te dá um endereço. Nos overlays, use esse endereço com `wss://` (é só quem hospeda na nuvem que precisa fazer isso; os detalhes estão no [Passo 8.2](#82-conferir-o-endereço-do-bot)):

```javascript
// overlayOBS.html
const enderecoDoBot = 'wss://seu-app.onrender.com';

// Dados3D.html
urlNuvem: 'wss://seu-app.onrender.com',
```

> Com isso está tudo pronto, porém, no plano gratuito do Render o serviço hiberna após um período sem uso e leva alguns segundos para acordar na primeira rolagem.


Para contornar essa hibernação e garantir que o seu overlay responda instantaneamente durante as sessões, você pode usar uma ferramenta externa para manter o servidor sempre acordado (*keep alive*):

1. Acesse o [UptimeRobot](https://uptimerobot.com/).
2. Logo na página inicial, cole a URL primária do seu serviço gerada pelo Render (certifique-se de usar a que começa com `https://`).
3. De um nome pro monitoramento se pedir. Siga em frente e faça o login usando a sua conta do Google.
4. Pronto! O UptimeRobot criará o monitoramento automaticamente com o padrão de 5 em 5 minutos. Com isso, sua aplicação receberá "pings" constantes e o overlay não vai mais dormir durante a partida.

> 💡 **Nota sobre o `index.js`:** O WebSocket do overlay roda em cima de um servidor HTTP simples (módulo `http` nativo do Node, sem Express). Quando alguém acessa a rota raiz (`/`) por um navegador ou pelo UptimeRobot, o bot responde só um texto curto com `HTTP 200 OK`. Isso é importante porque o monitoramento HTTP(S) do UptimeRobot faz requisições comuns e não completa o *handshake* de WebSocket: sem o `200 OK`, o *ping* seria marcado como falha, mesmo com o bot funcionando.

> ⚠️ **O bot parou de responder do nada, sem eu ter mudado nada?** Isso já aconteceu e não é bug do bot: os IPs de saída do Render (`74.220.50.0/24` e `74.220.58.0/24`, conferíveis no botão *Connect* do dashboard) são compartilhados com muitos outros serviços. Se algum deles abusar da API do Discord, o Discord pode bloquear o bloco inteiro temporariamente — derrubando, ao mesmo tempo, bots sem nenhuma relação entre si, até em contas diferentes do Render. Costuma normalizar sozinho em algumas horas. Pra confirmar que é isso mesmo, cadastre `DEBUG_DISCORD` = `true` nas Environment Variables do Render e olhe os logs (depois é só remover). Se quiser fugir do problema de vez, as opções são:
> - **Render com [Dedicated IP](https://render.com/docs/dedicated-static-outbound-ip)** — add-on pago, sem precisar trocar de hospedagem.
> - **Oracle Cloud "Always Free"** — VM de graça pra sempre com IP fixo, mas a aprovação da conta é famosa por ser complicada (às vezes recusam ou banem sem motivo claro).
> - **VM gratuita do Google Cloud** — também de graça, com IP fixo; deixando a VM sempre ligada não tem custo extra pelo IP. Só que não tem região no Brasil (só EUA), pede cartão de crédito no cadastro (sem cobrança se ficar dentro do limite) e o free tier só cobre 1GB de saída de dados por mês pra fora da América do Norte. Pra economizar, dá pra deixar ligada só quando for usar (dias de sessão ou fins de semana), manual ou programado pra ligar sozinho.
> - **[Discloud](https://discloud.com)** ou **[Square Cloud](https://squarecloud.app)** — hospedagens de bot mantidas por comunidades brasileiras no Discord. A Discloud ainda tem camada gratuita (mas às vezes fecha novos cadastros por estar lotada); a Square Cloud, pela documentação oficial dela, hoje pede plano pago pra hospedar bot. Nenhuma das duas divulga IP de saída fixo como recurso, então vale confirmar/testar antes de migrar.
>
> Diferente do Render, Oracle e Google Cloud não têm deploy automático — é preciso configurar o servidor na mão (abrir porta, rodar o `index.js` como serviço, etc.), o que exige saber um pouco de programação. Nada que uma IA (ChatGPT, Claude) não te guie passo a passo, mas é mais trabalho que o "conecta o GitHub e pronto" do Render.

---

## 🔧 Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| `Used disallowed intents` ao iniciar | Intent privilegiada desligada | Volte ao [Passo 3.3](#33-ligar-a-permissão-de-leitura-de-mensagens-) e ative *Message Content*. |
| `An invalid token was provided` | Token errado ou com espaço sobrando | Resete o token no Developer Portal e cole de novo no `.env`. |
| O bot liga, mas `/rl` não aparece no Discord | Comandos ainda propagando | Espere alguns minutos e reinicie o app do Discord (`Ctrl + R`). |
| `The caller does not have permission` | Planilha não compartilhada com a Service Account | Passo 5.1: link em **Editor**, ou compartilhe direto com o `client_email` da Service Account. |
| `Google Sheets API has not been used...` ou erro parecido | Sheets API não ativada no projeto certo do Google Cloud | Passo 4, item 3. |
| `error:...DECODER routines` ou `Invalid PEM formatted message` ao iniciar | `GOOGLE_PRIVATE_KEY` colada errada no `.env` | Revise o Passo 6: a chave precisa ficar entre aspas, numa linha só, com os `\n` literais (não troque por quebra de linha de verdade). |
| `Não encontrei aba contendo "..."` | Nome digitado ≠ nome da aba | Use o autocompletar do `/registrar` em vez de digitar. |
| Jogador já registrado precisa rodar `/registrar` de novo | A aba **Registros** foi apagada/renomeada, ou a planilha perdeu a permissão de Editor para a Service Account | Confira se a aba "Registros" ainda existe e se o compartilhamento (Passo 5.1) continua como Editor. |
| Registrou, mas nenhuma perícia aparece no `/rl` | Planilha fora do formato esperado | Revise o [Passo 5.3](#53-como-a-planilha-precisa-estar-organizada-ignorar-caso-usar-a-disponibilizada). Valores precisam ser números. |
| Overlay em branco no OBS | Endereço do WebSocket errado, porta diferente, ou bot desligado | Confira o [Passo 8.2](#82-conferir-o-endereço-do-bot) (padrão: `ws://localhost:8080`) e veja se o terminal ainda está rodando. |
| Dados 3D: aviso "o dado3d.js NÃO carregou" | O `dado3d.js` não está na mesma pasta do `Dados3D.html` (`overlay`) | Deixe os dois arquivos juntos na mesma pasta e atualize o cache da fonte no OBS. |
| Dados 3D: aviso "não achei o bot" | Bot desligado, porta diferente da 8080 ou bot na nuvem | Confira se o bot está ligado e o [Passo 8.2](#82-conferir-o-endereço-do-bot) (`urlLocal` / `urlNuvem`). |
| Cartões aparecem, mas os dados 3D não (ou vice-versa) | São duas fontes separadas no OBS | Confira se cada overlay foi adicionado como uma fonte de navegador própria e se está visível na cena. |
| Dados 3D ficam espremidos, cortados ou não quicam direito | Fonte de navegador pequena demais | Aumente Largura/Altura da fonte no OBS pro tamanho da cena (ex.: 1920 x 1080). |
| Cartões aparecem, mas sem som | Áudio não roteado | Marque *Controlar áudio via OBS* e confira em *Mixer → Propriedades Avançadas de Áudio* se o monitoramento está ativo. |
| `EADDRINUSE: port 8080` | Já existe um bot rodando, ou outro programa está usando a porta 8080 | Feche a outra janela de terminal. Se for outro programa, mude a porta (veja o [Passo 8.2, caso A](#82-conferir-o-endereço-do-bot)). |
| `Error: No key or keyFile set.` (bot crasha, `Exited with status 1`) | `GOOGLE_PRIVATE_KEY` ausente, vazia ou com nome errado nas Environment Variables do serviço na nuvem | Confira as variáveis do serviço certo (não um Env Group vazio) e recadastre `GOOGLE_SERVICE_ACCOUNT_EMAIL` e `GOOGLE_PRIVATE_KEY` — as duas juntas, é comum faltar uma delas. |
| `A criação da chave da conta de serviço está desativada` / `iam.disableServiceAccountKeyCreation` no Google Cloud | Política de segurança padrão do Google bloqueando chaves de Service Account | Desative a política em **IAM e admin → Políticas da organização** (veja a mesma seção acima) e tente gerar a chave de novo. |
| Não acho "Environment Variables" no menu do Render | Mudou de lugar/estrutura de Projects, ou não aparece no menu lateral | Acesse direto por `https://dashboard.render.com/web/SEU_SERVICE_ID/env` (o Service ID aparece no topo da página do serviço). |
| Bot para de responder do nada, mesmo sem mudar nada no código, e todos os outros bots seus no Render também caem juntos | IP de saída compartilhado do Render foi bloqueado temporariamente pelo Discord | Veja a nota em [Deixando o bot online 24 horas](#-deixando-o-bot-online-24-horas-opcional). |

**Ver o erro do overlay:** botão direito na fonte de navegador → **Interagir** → tecla `F12` abre o console com as mensagens de erro.

---

## 📁 Estrutura dos arquivos

```
├── index.js                  # o bot: Discord, Google Sheets (leitura e escrita) e servidor WebSocket
├── package.json              # lista de dependências
├── .env                      # suas chaves secretas (você cria, nunca sobe pro GitHub)
├── .gitignore
├── LICENSE
├── README.md
│
├── overlay/                  # tudo que vai pro OBS fica aqui
│   ├── overlayOBS.html       # overlay de cartões (HTML, CSS e JS num arquivo só)
│   ├── Dados3D.html          # overlay de dados 3D (opcional)
│   ├── dado3d.js             # desenho e rotação do D10 3D (usado pelo Dados3D.html)
│   └── sons/
│       ├── crit.mp3          # som de crítico
│       ├── falhacrit.mp3     # som de desastre
│       └── diceroll1-3.mp3   # sons de rolagem (sorteados a cada jogada)
│
├── ficha/
│   └── Ficha_CoC_Modelo.xlsx # ficha modelo automática (criada por Alan): Vida, Sanidade e perícias se calculam sozinhas
│
└── assets/
    ├── README-tecnico.md     # versão técnica deste guia
    └── exemplo1-4.png        # imagens usadas neste README
```

O `index.js` e o `package.json` ficam na raiz de propósito: é onde o `node index.js` e as hospedagens (como o Render) esperam encontrá-los.

---

🆘 Precisa de ajuda?
---

Ficou com alguma dúvida na instalação, o bot não ligou ou apareceu um erro esquisito no terminal? Não se preocupe, o projeto foi feito pra ser acessível e eu estou aqui para ajudar!

Você pode relatar o problema de duas formas:

Abrir uma Issue (Recomendado): Vá na aba Issues aqui no topo do GitHub, clique no botão verde New Issue e descreva o que deu errado. Se puder, cole a mensagem de erro que apareceu no seu terminal ou mande um print. **Antes de postar, confira se não tem nenhum token, chave ou ID da planilha aparecendo** (o modo debug, se estiver ligado, mostra bastante coisa).

Contato Direto: Se preferir, pode me chamar direto pelas redes sociais ou dar um grito lá no [Narrativa RPG](https://linktr.ee/NarrativaRPG).

Pode perguntar sem medo, a ideia da ferramenta é justamente facilitar a vida de todo mundo nas mesas(apesar de dificultar na instalação)!



---

## 🏊‍♂️ Créditos

- **Alan** — criou a `Ficha_CoC_Modelo.xlsx`, a planilha modelo de investigador usada por este projeto. Ela é totalmente automática: preenche Vida, Sanidade, atributos e perícias sozinha a partir dos dados básicos do personagem, sem precisar mexer em fórmulas.

---

## 📜 Licença

Distribuído sob a **AGPL-3.0** (GNU Affero General Public License v3.0). Qualquer pessoa pode usar, copiar, modificar e redistribuir o código livremente, inclusive comercialmente, desde que:

- qualquer versão modificada continue sendo distribuída como código aberto, sob a mesma licença;
- se o código (ou uma versão modificada) for usado para oferecer um serviço acessível pela rede — como rodar este bot num servidor para terceiros usarem — o código-fonte correspondente também seja disponibilizado aos usuários desse serviço.

Ou seja: não é permitido pegar o projeto, modificá-lo e fechá-lo, nem mesmo rodando-o apenas como serviço. O texto completo está no arquivo [`LICENSE`](LICENSE).
