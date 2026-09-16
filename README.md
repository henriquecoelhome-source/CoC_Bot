# 🎲 Bot de Call of Cthulhu + Overlay para OBS

Bot de Discord que lê as fichas dos investigadores direto de uma planilha do Google Sheets, rola os testes de d100 aplicando as regras de Call of Cthulhu 7ª edição e mostra o resultado na sua live, em tempo real, com animação e som.

> **Nunca mexeu com programação?** Sem problema. Este guia foi escrito para você seguir do zero, na ordem, sem pular etapas. Leva cerca de 30 a 40 minutos na primeira vez.

---

## 📑 Índice

- [Como fica na Live](#como-fica-na-livegravação)
- [Como funciona](#-como-funciona)
- [O que o bot faz](#-o-que-o-bot-faz)
- [Antes de começar](#-antes-de-começar)
- [Passo 1 — Instalar o Node.js](#passo-1--instalar-o-nodejs)
- [Passo 2 — Baixar o projeto](#passo-2--baixar-o-projeto)
- [Passo 3 — Criar o bot no Discord](#passo-3--criar-o-bot-no-discord)
- [Passo 4 — Criar a chave da API do Google](#passo-4--criar-a-chave-da-api-do-google)
- [Passo 5 — Preparar a planilha das fichas](#passo-5--preparar-a-planilha-das-fichas)
- [Passo 6 — Criar o arquivo .env](#passo-6--criar-o-arquivo-env)
- [Passo 7 — Instalar e ligar o bot](#passo-7--instalar-e-ligar-o-bot)
- [Passo 8 — Colocar o overlay no OBS](#passo-8--colocar-o-overlay-no-obs)
- [Como usar na mesa](#-como-usar-na-mesa)
- [Personalizando o visual e os sons](#-personalizando-o-visual-e-os-sons)
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

**Integração com o bot Rollem:**
Se a sua mesa utiliza o bot Rollem para rolagens de dano ou dados genéricos (como `1d20` ou `3d6`), o overlay também captura e exibe esses resultados.

![Exemplo de rolagens com o Rollem](assets/exemplo2.png)

**Exemplo em um layout completo:**

![Exemplo em um layout completo](assets/exemplo3.png)

---
## 🔄 Como funciona

```
  Planilha do Google  ──lê as fichas──►  ┌─────────────┐
                                         │             │
  Discord (/rl, /registrar) ────────────►│   index.js  │
                                         │   (o bot)   │
  Bot Rollem (rolagens soltas) ─────────►│             │
                                         └──────┬──────┘
                                                │ WebSocket (porta 8080)
                                                ▼
                                    overlayOBS.html  ──►  sua live no OBS
```

O `index.js` fica rodando no seu computador (ou num servidor). Ele conversa com o Discord e com o Google, e transmite cada rolagem para o `overlayOBS.html`, que você adiciona no OBS como fonte de navegador. **Se o `index.js` estiver desligado, o overlay fica vazio.**

---

## ✨ O que o bot faz

| Recurso | Descrição |
|---|---|
| **Fichas no Google Sheets** | Lê atributos (FOR, DES, INT, CON, APA, POD, TAM, EDU), Sorte, Sanidade e todas as perícias direto da planilha. |
| **`/registrar`** | Vincula o jogador do Discord à aba da ficha dele. |
| **`/rl`** | Rola a perícia com autocompletar e já calcula o nível de sucesso. |
| **Regras de CoC 7e** | Crítico Absoluto (01), Sucesso Extremo (⅕), Bom (½), Normal, Falha e Desastre. |
| **Vantagem / Desvantagem** | Rola um dado de dezena extra e usa o melhor (ou o pior) resultado. |
| **Overlay no OBS** | Cartão animado na tela, colorido conforme o resultado. |
| **Sons automáticos** | Som de dado em toda rolagem + som especial em crítico e desastre. |
| **Suporte ao Rollem** | Rolagens feitas pelo bot Rollem também aparecem no overlay. |

---

## ✅ Antes de começar

Você vai precisar de:

- [ ] Um computador com Windows, macOS ou Linux
- [ ] Um servidor do Discord **onde você seja administrador**
- [ ] Uma conta Google
- [ ] O OBS Studio instalado (só para a parte do overlay)
- [ ] Cerca de 40 minutos

Ao longo do guia você vai anotar **três informações secretas**. Deixe um bloco de notas aberto para colar cada uma delas:

```
DISCORD_TOKEN = ...
GOOGLE_API_KEY = ...
SPREADSHEET_ID = ...
```

> ⚠️ **Nunca poste esses três valores em lugar nenhum** — nem no chat da live, nem em prints, nem no GitHub. Quem tiver o token do Discord assume o controle do seu bot.

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
index.js  overlayOBS.html  package.json  README.md  LICENSE
crit.mp3  falhacrit.mp3  diceroll1.mp3  diceroll2.mp3  diceroll3.mp3
Ficha-CoC-modelo.xlsx
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
- [x] **SERVER MEMBERS INTENT**

Clique em **Save Changes**.

> Sem o *Message Content Intent* o bot **nem liga** — ele fecha com erro logo ao iniciar. É o erro nº 1 de quem instala pela primeira vez.

### 3.4 Convidar o bot para o servidor

1. Menu lateral → **OAuth2** → **URL Generator**.
2. Em **Scopes**, marque: `bot` e `applications.commands`.
3. Em **Bot Permissions**, marque: `Send Messages`, `Read Message History`, `Embed Links` e `View Channels`.
4. Copie o link gerado lá embaixo, cole no navegador, escolha o seu servidor e autorize.

---

## Passo 4 — Criar a chave da API do Google

1. Acesse **<https://console.cloud.google.com/>** e faça login.
2. No topo, clique no seletor de projeto → **Novo projeto** → dê um nome → **Criar**.
3. Com o projeto selecionado, use a busca do topo para achar **Google Sheets API** e clique em **Ativar**.
4. No menu lateral, vá em **APIs e serviços** → **Credenciais**.
5. Clique em **Criar credenciais** → **Chave de API**.
6. Copie a chave e cole no bloco de notas em `GOOGLE_API_KEY`.

> **Dica de segurança:** clique em *Editar chave de API* e, em "Restrições de API", limite o uso apenas à *Google Sheets API*. Assim a chave não serve para mais nada caso vaze.

---

## Passo 5 — Preparar a planilha das fichas

> 💡 **Já tem uma ficha modelo pronta neste repositório** (`Ficha-CoC-modelo.xlsx`), criada pelo **Alan** 🏊‍♂️. Ela é **totalmente automática**: Vida, Sanidade, atributos e perícias já vêm com os cálculos prontos — é só duplicar e preencher os dados do seu investigador que o resto se ajusta sozinho. Baixe o arquivo, suba pro seu Google Drive, abra com o Google Planilhas (botão direito → *Abrir com* → *Google Planilhas*) e siga a partir do passo 5.1 abaixo para liberar o acesso.
>
> Em alguns casos, pode aparecer um bug visual leve nos atributos — aparece uma linha preta em algumas células por algum motivo — mas é só estético, não atrapalha os cálculos nem a leitura do bot.

### 5.1 Liberar o acesso

A chave de API só consegue ler planilhas públicas para leitura. **Não use "Publicar na web"** — é outra coisa.

1. Abra sua planilha de fichas no Google Sheets.
2. Clique em **Compartilhar** (canto superior direito).
3. Em "Acesso geral", troque para **Qualquer pessoa com o link** → permissão **Leitor**.
4. Clique em **Concluído**.

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
GOOGLE_API_KEY=cole_aqui_a_chave_do_google
SPREADSHEET_ID=cole_aqui_o_id_da_planilha
```

Sem aspas, sem espaços em volta do `=`.

> Se você for subir o projeto para o GitHub, garanta que existe um arquivo `.gitignore` contendo as linhas `.env` e `node_modules`.

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

Isso baixa as bibliotecas (`discord.js`, `ws`, `google-spreadsheet`, `dotenv`) e cria a pasta `node_modules`. Demora um ou dois minutos.

> Se der erro dizendo que não achou o `package.json`, instale manualmente:
> `npm install discord.js ws google-spreadsheet dotenv`

Agora ligue o bot digitando:

```bash
node index.js
```

Se tudo estiver certo, aparece:

```
Servidor WebSocket iniciado — aguardando conexões do overlay na porta 8080.
Bot conectado como SeuBot#1234!
Planilha "Fichas CoC" carregada com sucesso!
```

🎉 **O bot está no ar.** Deixe essa janela do terminal aberta — fechar o terminal desliga o bot.

---

## Passo 8 — Colocar o overlay no OBS

### 8.1 Apontar o overlay para o bot certo ⚠️

O arquivo `overlayOBS.html` vem configurado para um servidor na nuvem. Como você está rodando o bot no seu computador, precisa mudar isso.

1. Abra `overlayOBS.html` no Bloco de Notas (botão direito → *Abrir com*).
2. Perto do fim do arquivo, ache esta linha:

```javascript
const ws = new WebSocket('wss://coc-bot-nj88.onrender.com');
```

3. Troque por:

```javascript
const ws = new WebSocket('ws://localhost:8080');
```

4. Salve.

> Repare: `ws://` (local, sem "s") e `wss://` (nuvem, com "s"). Trocar isso é a causa mais comum de "o overlay não mostra nada".

### 8.2 Adicionar no OBS

1. No OBS, em **Fontes**, clique em **+** → **Navegador**.
2. Dê um nome (ex.: `Rolagens CoC`) e clique em OK.
3. Marque a caixa **Arquivo local**.
4. Em **Arquivo local**, clique em *Procurar* e selecione o `overlayOBS.html`.
5. Defina **Largura: 420** e **Altura: 600** (ajuste depois ao seu gosto — o layout se adapta).
6. Marque **Desligar a fonte quando não estiver visível**: desmarcado.
7. Marque **Controlar áudio via OBS** para que os sons dos dados entrem na transmissão.
8. Clique em **OK** e posicione o overlay na cena.

> Os arquivos `.mp3` precisam ficar **na mesma pasta** do `overlayOBS.html`. Não mova o HTML sozinho para outro lugar.

### 8.3 Testar

Com o bot rodando, use `/rl` no Discord. O cartão deve surgir no OBS em menos de um segundo.

Se não aparecer nada: clique com o botão direito na fonte → **Interagir**, e depois **Atualizar cache da página atual**.

---

## 🎮 Como usar na mesa

### `/registrar`

Cada jogador roda uma vez, no início:

```
/registrar personagem: Ficha 1 (Arthur)
```

O campo tem autocompletar com os nomes das abas da planilha. A resposta é privada (só o jogador vê).

> O vínculo fica salvo em `data/registros.json` — não é preciso registrar de novo depois que o bot for reiniciado.

### `/rl`

```
/rl pericia: Psicologia
/rl pericia: Esquivar  vantagem: Vantagem (Bônus)
```

O campo `pericia` sugere tudo que o bot leu da ficha daquele jogador — perícias, atributos, Sorte e Sanidade.

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

### Rolagens pelo Rollem

Se o bot **Rollem** estiver no servidor, qualquer rolagem feita por ele (`2d6+3`, `1d100` etc.) também aparece no overlay, num formato mais simples. O nome exibido é o apelido de quem pediu a rolagem no servidor.

> Funciona porque o bot procura mensagens de um usuário cujo nome seja exatamente `rollem`. Se você usar outro bot de dados, é preciso editar essa linha no `index.js`.

---

## 🎨 Personalizando o visual e os sons

Tudo fica no `overlayOBS.html`, no começo do arquivo:

```css
:root {
    --cor-normal: #ffb648;   /* rolagem comum */
    --cor-crit:   #2ee673;   /* crítico */
    --cor-falha:  #ff4d5e;   /* desastre */
    --cor-texto:  #f2f2f2;
    --cor-fundo:  rgba(20, 20, 22, 0.92);  /* último número = transparência */
}
```

Quantos cartões ficam na tela ao mesmo tempo (padrão: 6):

```javascript
const maxMensagens = 6;
```

**Trocar os sons:** substitua os arquivos `.mp3` mantendo exatamente os mesmos nomes (`diceroll1.mp3`, `diceroll2.mp3`, `diceroll3.mp3`, `crit.mp3`, `falhacrit.mp3`). O volume fica em `tocarSom(somRolagem, 0.8)` — troque `0.8` por um valor entre `0` e `1`.

---

## ☁️ Deixando o bot online 24 horas (opcional)

Rodando no seu PC, o bot morre junto com o computador. Para deixá-lo sempre ligado, use um serviço de hospedagem como o [Render](https://render.com/).

**Antes de subir, edite o `index.js`.** Hoje a porta está fixa:

```javascript
const wss = new WebSocket.Server({ port: 8080 });
```

Serviços de nuvem exigem que o programa use a porta que **eles** definem. Troque por:

```javascript
const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });
```

Assim continua usando 8080 na sua máquina e a porta correta na nuvem.

Depois:

1. Suba o projeto para um repositório no GitHub (**sem o `.env`**).
2. No Render, crie um **Web Service** conectado a esse repositório.
3. Em *Build Command* use `npm install` e em *Start Command* use `node index.js`.
4. Em **Environment**, cadastre `DISCORD_TOKEN`, `GOOGLE_API_KEY` e `SPREADSHEET_ID` como variáveis.
5. Depois do deploy, o Render te dá um endereço. No `overlayOBS.html`, use esse endereço com `wss://`:

```javascript
const ws = new WebSocket('wss://seu-app.onrender.com');
```

> No plano gratuito do Render o serviço hiberna após um período sem uso e leva alguns segundos para acordar na primeira rolagem.

---

## 🔧 Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| `Used disallowed intents` ao iniciar | Intents privilegiadas desligadas | Volte ao [Passo 3.3](#33-ligar-a-permissão-de-leitura-de-mensagens-️) e ative *Message Content* e *Server Members*. |
| `An invalid token was provided` | Token errado ou com espaço sobrando | Resete o token no Developer Portal e cole de novo no `.env`. |
| O bot liga, mas `/rl` não aparece no Discord | Comandos ainda propagando | Espere alguns minutos e reinicie o app do Discord (`Ctrl + R`). |
| `The caller does not have permission` | Planilha não está compartilhada | Passo 5.1: acesso *Qualquer pessoa com o link → Leitor*. |
| `API key not valid` | Sheets API não ativada no projeto | Passo 4, item 3. |
| `Não encontrei aba contendo "..."` | Nome digitado ≠ nome da aba | Use o autocompletar do `/registrar` em vez de digitar. |
| Registrou, mas nenhuma perícia aparece no `/rl` | Planilha fora do formato esperado | Revise o [Passo 5.3](#53-como-a-planilha-precisa-estar-organizada). Valores precisam ser números. |
| Overlay em branco no OBS | Endereço do WebSocket errado, ou bot desligado | Passo 8.1 (`ws://localhost:8080`) e confira se o terminal ainda está rodando. |
| Cartões aparecem, mas sem som | Áudio não roteado | Marque *Controlar áudio via OBS* e confira em *Mixer → Propriedades Avançadas de Áudio* se o monitoramento está ativo. |
| `EADDRINUSE: port 8080` | Já existe um bot rodando | Feche a outra janela de terminal. |

**Ver o erro do overlay:** botão direito na fonte de navegador → **Interagir** → tecla `F12` abre o console com as mensagens de erro.

---

## 📁 Estrutura dos arquivos

```
├── index.js           # o bot: Discord, Google Sheets e servidor WebSocket
├── overlayOBS.html    # o overlay que vai no OBS (HTML, CSS e JS num arquivo só)
├── Ficha-CoC-modelo.xlsx  # ficha modelo automática (criada por Alan) — Vida, Sanidade e perícias se calculam sozinhos
├── package.json       # lista de dependências
├── .env               # suas chaves secretas (você cria, nunca sobe pro GitHub)
├── crit.mp3           # som de crítico
├── falhacrit.mp3      # som de desastre
└── diceroll1-3.mp3    # sons de rolagem (sorteados a cada jogada)
```

---

## 🏊‍♂️ Créditos

- **Alan** — criou a `Ficha-CoC-modelo.xlsx`, a planilha modelo de investigador usada por este projeto. Ela é totalmente automática: preenche Vida, Sanidade, atributos e perícias sozinha a partir dos dados básicos do personagem, sem precisar mexer em fórmulas.

---

## 📜 Licença

Distribuído sob a **AGPL-3.0** (GNU Affero General Public License v3.0). Qualquer pessoa pode usar, copiar, modificar e redistribuir o código livremente, inclusive comercialmente, desde que:

- qualquer versão modificada continue sendo distribuída como código aberto, sob a mesma licença;
- se o código (ou uma versão modificada) for usado para oferecer um serviço acessível pela rede — como rodar este bot num servidor para terceiros usarem — o código-fonte correspondente também seja disponibilizado aos usuários desse serviço.

Ou seja: não é permitido pegar o projeto, modificá-lo e fechá-lo, nem mesmo rodando-o apenas como serviço. O texto completo está no arquivo [`LICENSE`](LICENSE).
