# Bot de Discord & Overlay OBS para Call of Cthulhu

Bot de Discord integrado a um overlay animado para o OBS Studio, desenvolvido para transmissões e mesas de Call of Cthulhu (CoC 7e). O sistema lê os dados dos investigadores diretamente de uma planilha do Google Sheets, calcula automaticamente os níveis de sucesso em d100 e envia os resultados em tempo real para a tela da live via WebSockets.

## Funcionalidades

- **Integração com Google Sheets:** lê automaticamente os atributos (FOR, DES, INT, CON, APA, POD, TAM, EDU), Sorte, Sanidade e perícias direto da ficha.
- **Cálculo automático de sucessos (`/rl`):** processa testes em d100 identificando Sucesso Normal, Bom (metade), Extremo (um quinto), Falha, Desastre (Fumble) e Crítico Absoluto (01).
- **Dados de bônus e penalidade:** suporte nativo a regras de Vantagem e Desvantagem, rolando dados extras de dezena.
- **Overlay dinâmico no OBS:** comunicação em tempo real via WebSocket (`ws://` ou `wss://`) para exibir os cards das rolagens na transmissão.
- **Alertas visuais e sonoros:** destaques em cores e efeitos sonoros automáticos para acertos críticos e desastres.
- **Suporte ao bot Rollem:** monitora e renderiza no overlay as rolagens convencionais feitas pelo Rollem.

## Arquivos incluídos

- `index.js` — lógica do bot do Discord e servidor WebSocket.
- `overlayOBS.html` — interface visual (HUD) para o OBS Studio.

## Pré-requisitos

- [Node.js](https://nodejs.org/) instalado.
- Uma aplicação de bot criada no [Discord Developer Portal](https://discord.com/developers/applications), com o respectivo token.
- Uma chave de API do Google (Google Sheets API habilitada).
- Uma planilha do Google Sheets com as fichas dos investigadores.

## Configuração

### 1. Variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto (não versione este arquivo) com as seguintes chaves:

```env
DISCORD_TOKEN=seu_token_do_discord_aqui
GOOGLE_API_KEY=sua_chave_da_api_do_google_aqui
SPREADSHEET_ID=id_da_sua_planilha_aqui
PORT=8080 # Opcional; plataformas em nuvem costumam configurar isso dinamicamente
```

Certifique-se de que `.env` está listado no `.gitignore` para não expor essas credenciais.

### 2. Vinculando a planilha do Google Sheets

Não utilize a opção "Publicar na web". Para que o bot leia as fichas, basta o link de compartilhamento padrão:

1. Abra a planilha de fichas de Call of Cthulhu no Google Sheets.
2. Clique em **Compartilhar**, no canto superior direito.
3. Ajuste o acesso geral para "Qualquer pessoa com o link pode ver" (ou garanta o acesso via sua Google API Key).
4. O link gerado seguirá esta estrutura:
   `https://docs.google.com/spreadsheets/d/SEU_ID_AQUI/edit?usp=sharing`
5. Copie somente o código alfanumérico entre `/d/` e `/edit` — esse é o ID da planilha.
6. Cole esse valor na variável `SPREADSHEET_ID` do arquivo `.env`.

### 3. Instalação e execução

```bash
# Clone este repositório
git clone https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git

# Acesse o diretório
cd SEU-REPOSITORIO

# Instale as dependências
npm install

# Inicie o bot
node index.js
```

## Licença

Este projeto é distribuído sob a licença **AGPL-3.0** (GNU Affero General Public License v3.0) — qualquer pessoa pode usar, copiar, modificar e redistribuir o código livremente, inclusive para fins comerciais, desde que:

- qualquer versão modificada continue sendo distribuída como código aberto, sob a mesma licença;
- se o código (ou uma versão modificada dele) for usado para oferecer um serviço acessível por rede — como rodar este bot em um servidor para terceiros usarem — o código-fonte correspondente também deve ser disponibilizado aos usuários desse serviço.

Ou seja, não é permitido pegar o projeto, modificá-lo e fechá-lo (nem mesmo rodando-o apenas como serviço). Veja o arquivo `LICENSE` para o texto completo.
