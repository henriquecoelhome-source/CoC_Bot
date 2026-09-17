require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const WebSocket = require('ws');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// ---------------------------------------------------------------------
// Servidor WebSocket — canal de eventos para o overlay do OBS.
// Toda rolagem de dados detectada (via /rl ou observação do bot "rollem")
// é retransmitida em tempo real para os clientes conectados nesta porta.
// ---------------------------------------------------------------------
const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });
console.log(`Servidor WebSocket iniciado — aguardando conexões do overlay na porta ${PORT}.`);

// ---------------------------------------------------------------------
// Histórico de eventos — buffer com as últimas rolagens transmitidas.
// Sem isso, um evento só chega a quem já estava conectado no instante
// exato do broadcast: se o overlay cair e reconectar (queda de rede,
// reload da fonte de navegador no OBS etc.), tudo que rolou nesse meio
// tempo se perde, porque o servidor nunca guardava nada, só repassava.
// Ao conectar, o overlay agora recebe esse histórico de uma vez.
// ---------------------------------------------------------------------
const HISTORICO_MAX = 6; // mesmo valor de maxMensagens no overlay
let historicoEventos = [];

function transmitirEvento(evento) {
    historicoEventos.push(evento);
    if (historicoEventos.length > HISTORICO_MAX) historicoEventos.shift();

    wss.clients.forEach(cliente => {
        if (cliente.readyState === WebSocket.OPEN) {
            cliente.send(JSON.stringify(evento));
        }
    });

    // Grava no histórico persistente da planilha (aba "Rolagens") em
    // paralelo. Sem `await` de propósito: isso é uma função síncrona
    // chamada em pontos onde não queremos atrasar nem o broadcast pro
    // overlay nem a resposta do comando no Discord — a gravação roda
    // em segundo plano e qualquer erro fica só no log (ver a função).
    registrarHistoricoRolagem(evento);
}

wss.on('connection', (ws) => {
    if (historicoEventos.length > 0) {
        ws.send(JSON.stringify({ tipo: 'historico', eventos: historicoEventos }));
    }
});

const client = new Client({ 
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

// ---------------------------------------------------------------------
// Integração com Google Sheets — fonte de dados das fichas de personagem
// e, agora, também onde ficam salvos os vínculos usuário → ficha.
//
// Antes a autenticação era só com uma API key, que só permite leitura.
// Para gravar dados na planilha (a persistência dos registros, logo
// abaixo) é preciso uma Service Account do Google, com permissão de
// edição — as credenciais vêm de variáveis de ambiente, nunca ficam
// hardcoded aqui. Veja o README para o passo a passo de como gerar
// essas credenciais e compartilhar a planilha com a Service Account.
// ---------------------------------------------------------------------
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const serviceAccountAuth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);

// userCharacters:   mapeia o ID do usuário do Discord à aba (ficha) vinculada.
// characterCache:   cache dos atributos/perícias já lidos de cada ficha.
// nomeFichaCache:   cache do nome do personagem extraído da própria ficha.
const userCharacters = {};
const characterCache = {};
const nomeFichaCache = {};

// ---------------------------------------------------------------------
// Persistência dos vínculos usuário → ficha (comando /registrar).
//
// userCharacters vivia só em memória (RAM do processo): qualquer
// reinício do processo Node apagava tudo sem deixar rastro — inclusive
// todo deploy novo no Render, já que lá o disco local é efêmero (some
// a cada redeploy, não só quando o serviço hiberna). Por isso os
// vínculos agora moram numa aba própria da planilha ("Registros"),
// que é externa ao servidor: sobrevive a qualquer redeploy, crash ou
// hibernação, porque não depende do disco do bot.
// ---------------------------------------------------------------------
const REGISTROS_SHEET_TITLE = 'Registros';

async function getOrCriarAbaRegistros() {
    let sheet = doc.sheetsByTitle[REGISTROS_SHEET_TITLE];
    if (!sheet) {
        sheet = await doc.addSheet({ title: REGISTROS_SHEET_TITLE, headerValues: ['UserID', 'Ficha'] });
        console.log(`Aba "${REGISTROS_SHEET_TITLE}" criada na planilha.`);
    }
    return sheet;
}

async function carregarRegistros() {
    try {
        const sheet = await getOrCriarAbaRegistros();
        const rows = await sheet.getRows();
        for (const row of rows) {
            const userId = row.get('UserID');
            const ficha = row.get('Ficha');
            if (userId && ficha) userCharacters[userId] = ficha;
        }
        console.log(`Registros carregados da planilha: ${Object.keys(userCharacters).length} vínculo(s) de usuário → ficha.`);
    } catch (e) {
        console.error('Erro ao carregar registros da planilha:', e);
    }
}

async function salvarRegistro(userId, ficha) {
    try {
        const sheet = await getOrCriarAbaRegistros();
        const rows = await sheet.getRows();
        const existente = rows.find(r => r.get('UserID') === userId);
        if (existente) {
            existente.set('Ficha', ficha);
            await existente.save();
        } else {
            await sheet.addRow({ UserID: userId, Ficha: ficha });
        }
    } catch (e) {
        console.error('Erro ao salvar registro na planilha:', e);
    }
}

// ---------------------------------------------------------------------
// Histórico persistente de rolagens (aba "Rolagens").
//
// O `historicoEventos` lá em cima é outra coisa: um buffer pequeno (6
// itens) só pra reenviar as últimas rolagens a quem acabou de conectar
// no overlay, e que se perde a cada restart do bot porque vive só na
// RAM. Esta seção é o histórico de verdade — cada rolagem (/rl e
// Rollem) é gravada numa aba própria da planilha, igual acontece com a
// aba "Registros", então sobrevive a reinícios, quedas e redeploys.
//
// Pra aba não crescer pra sempre, o bot mantém só as últimas
// HISTORICO_ROLAGENS_MAX linhas. A limpeza roda em lotes de
// HISTORICO_ROLAGENS_LOTE_LIMPEZA em vez de apagar uma linha a cada
// rolagem nova — isso evita gastar uma chamada de API extra a cada
// /rl só pra manter o total redondo (a Google Sheets API tem cota de
// requisições por minuto, e numa mesa animada isso soma rápido). Na
// prática a aba pode passar um pouco do limite por um instante (até
// +HISTORICO_ROLAGENS_LOTE_LIMPEZA linhas) entre uma limpeza e outra,
// o que não faz diferença nenhuma pra um histórico de rolagens.
// ---------------------------------------------------------------------
const HISTORICO_ROLAGENS_SHEET_TITLE = 'Rolagens';
const HISTORICO_ROLAGENS_MAX = 1000; // reduza aqui se a planilha ficar pesada
const HISTORICO_ROLAGENS_LOTE_LIMPEZA = 50; // apaga em blocos, não linha a linha

let historicoRolagensContagem = 0; // contagem em memória — evita reler a aba inteira a cada rolagem

async function getOrCriarAbaHistoricoRolagens() {
    let sheet = doc.sheetsByTitle[HISTORICO_ROLAGENS_SHEET_TITLE];
    if (!sheet) {
        sheet = await doc.addSheet({
            title: HISTORICO_ROLAGENS_SHEET_TITLE,
            headerValues: ['Data', 'Jogador', 'Pericia', 'Alvo', 'Resultado', 'Status'],
        });
        console.log(`Aba "${HISTORICO_ROLAGENS_SHEET_TITLE}" criada na planilha.`);
    }
    return sheet;
}

/**
 * Lê a aba de histórico uma única vez, na inicialização do bot, só pra
 * saber quantas linhas já existem. Depois disso a contagem fica só em
 * memória (incrementada a cada gravação, decrementada a cada limpeza),
 * pra nunca mais precisar reler a aba inteira só pra saber o tamanho
 * dela — isso é o que permite decidir "preciso limpar?" sem gastar uma
 * chamada de leitura da API a cada rolagem.
 */
async function inicializarContagemHistoricoRolagens() {
    try {
        const sheet = await getOrCriarAbaHistoricoRolagens();
        const rows = await sheet.getRows();
        historicoRolagensContagem = rows.length;
        console.log(`Histórico de rolagens carregado: ${historicoRolagensContagem} linha(s) na aba "${HISTORICO_ROLAGENS_SHEET_TITLE}".`);
    } catch (e) {
        console.error('Erro ao inicializar o histórico de rolagens:', e);
    }
}

/**
 * Apaga o excedente mais antigo de uma vez, em lote, quando a aba passa
 * de HISTORICO_ROLAGENS_MAX + HISTORICO_ROLAGENS_LOTE_LIMPEZA linhas.
 * As linhas mais antigas são sempre as do topo da aba (logo abaixo do
 * cabeçalho), então basta pegar as primeiras `excedente` linhas.
 *
 * Apaga de trás pra frente dentro do lote (da última linha buscada pra
 * primeira): apagar uma linha desloca pra cima só as linhas abaixo
 * dela na planilha, então apagar da mais "de baixo" pra mais "de cima"
 * evita que o número de linha das outras já buscadas fique
 * desatualizado no meio do processo.
 */
async function apararHistoricoRolagensSeNecessario(sheet) {
    const excedente = historicoRolagensContagem - HISTORICO_ROLAGENS_MAX;
    if (excedente < HISTORICO_ROLAGENS_LOTE_LIMPEZA) return;

    try {
        const linhasAntigas = await sheet.getRows({ offset: 0, limit: excedente });
        for (let i = linhasAntigas.length - 1; i >= 0; i--) {
            await linhasAntigas[i].delete();
            historicoRolagensContagem--;
        }
        console.log(`Histórico de rolagens: ${linhasAntigas.length} linha(s) antiga(s) removida(s) (limite: ${HISTORICO_ROLAGENS_MAX}).`);
    } catch (e) {
        console.error('Erro ao limpar histórico antigo de rolagens:', e);
    }
}

/**
 * Grava uma linha do evento recebido na aba de histórico. Funciona
 * tanto para rolagens estruturadas do /rl ("comando", com perícia,
 * alvo e status separados) quanto para rolagens cruas capturadas do
 * bot Rollem (que não têm perícia/alvo/status — só o texto original).
 *
 * Chamada a partir de `transmitirEvento` sem `await` de propósito (veja
 * o comentário lá) — erros aqui nunca devem derrubar uma rolagem, por
 * isso ficam só no log.
 */
async function registrarHistoricoRolagem(evento) {
    try {
        const sheet = await getOrCriarAbaHistoricoRolagens();

        const linha = {
            Data: new Date().toLocaleString('pt-BR'),
            Jogador: evento.jogador || '',
            Pericia: evento.pericia || '',
            Alvo: evento.alvo !== undefined ? evento.alvo : '',
            Resultado: evento.tipo === 'comando' ? evento.valor : (evento.resultado || ''),
            Status: evento.status || (evento.evento === 'crit' ? 'Crítico' : evento.evento === 'fail' ? 'Falha' : ''),
        };

        await sheet.addRow(linha);
        historicoRolagensContagem++;
        await apararHistoricoRolagensSeNecessario(sheet);
    } catch (e) {
        console.error('Erro ao gravar rolagem no histórico da planilha:', e);
    }
}

/**
 * Reconstrói, a partir de uma linha da aba "Rolagens", o mesmo formato de
 * evento que `transmitirEvento` recebe normalmente — usado para repovoar
 * `historicoEventos` (o buffer em RAM) a partir do que já está salvo na
 * planilha assim que o bot sobe. Sem isso, um restart do processo
 * (redeploy, crash, hibernação no Render) zera o buffer em memória e o
 * overlay só volta a ver histórico depois que rolagens novas acontecerem
 * — mesmo a planilha já tendo tudo guardado.
 *
 * A distinção "comando" (/rl) vs "rollem" (bot terceiro) é feita pela
 * presença da coluna Perícia, que só rolagens de /rl preenchem.
 */
function eventoAPartirDaLinhaHistorico(row) {
    const jogador = row.get('Jogador') || '';
    const pericia = row.get('Pericia') || '';
    const alvo = row.get('Alvo');
    const resultado = row.get('Resultado') || '';
    const status = row.get('Status') || '';

    if (pericia) {
        // Rolagem estruturada de /rl: a coluna Status guarda o texto
        // bruto do resultado ("CRÍTICO ABSOLUTO (01)", "DESASTRE",
        // "SUCESSO..."), não 'crit'/'fail' diretamente (ver
        // registrarHistoricoRolagem) — por isso o tipo de evento é
        // inferido a partir desse texto.
        let evento = 'normal';
        if (/crítico/i.test(status)) evento = 'crit';
        else if (/desastre/i.test(status)) evento = 'fail';

        return {
            tipo: 'comando',
            jogador,
            pericia,
            alvo,
            valor: resultado,
            status,
            vantagem: '',
            evento,
        };
    }

    // Rolagem crua do bot "rollem": aqui a coluna Status já guarda
    // 'Crítico' / 'Falha' / '' diretamente.
    let evento = 'normal';
    if (status === 'Crítico') evento = 'crit';
    else if (status === 'Falha') evento = 'fail';

    return { tipo: 'rollem', jogador, resultado, evento };
}

/**
 * Repovoa `historicoEventos` com as últimas HISTORICO_MAX rolagens já
 * salvas na aba "Rolagens", lidas diretamente da planilha (offset pelo
 * total de linhas já contado em `inicializarContagemHistoricoRolagens`,
 * então não precisa reler a aba inteira). Chamada uma única vez, na
 * inicialização do bot — depois disso o buffer é mantido normalmente
 * por `transmitirEvento` a cada rolagem nova.
 */
async function carregarHistoricoRecenteDaPlanilha() {
    try {
        const sheet = await getOrCriarAbaHistoricoRolagens();
        const offset = Math.max(0, historicoRolagensContagem - HISTORICO_MAX);
        const rows = await sheet.getRows({ offset, limit: HISTORICO_MAX });
        historicoEventos = rows.map(eventoAPartirDaLinhaHistorico);
        console.log(`Buffer de histórico do overlay repovoado com ${historicoEventos.length} rolagem(ns) vinda(s) da planilha.`);
    } catch (e) {
        console.error('Erro ao repovoar o histórico do overlay a partir da planilha:', e);
    }
}

/**
 * Lê a aba `sheetTitle` da planilha e extrai atributos, perícias, Sorte,
 * Sanidade e o nome do personagem, populando characterCache/nomeFichaCache.
 *
 * A extração é feita por reconhecimento de padrão de texto (rótulos e
 * marcadores como "%"), não por posição fixa de célula — isso torna a
 * leitura resiliente a pequenas variações de layout entre fichas.
 *
 * @param {string} sheetTitle - Título da aba correspondente à ficha.
 * @returns {Promise<boolean>} true se a sincronização foi concluída com sucesso.
 */
async function syncCharacter(sheetTitle) {
    try {
        const sheet = doc.sheetsByTitle[sheetTitle];
        if (!sheet) return false;

        await sheet.loadCells('A1:R100'); 
        const stats = {};

        // A "Sanidade Atual" tem posição fixa nesta ficha (célula M8).
        const celulaSanidade = sheet.getCell(7, 12); // linha 8, coluna M (0-indexado)
        if (typeof celulaSanidade.value === 'number') {
            stats['Sanidade'] = celulaSanidade.value;
        }

        // Perícias seguem o padrão "Nome (xx%)" — ex.: "Lutar (Briga) (25%)",
        // "Psicologia (10%)", "Esquivar (metade da DES%)". Identificamos a
        // célula por esse padrão textual (e não por posição/coluna), já que
        // atributos (FOR, DES...) e demais campos não seguem essa notação.
        const padraoPericiaTeste = /\([^()]*%[^()]*\)/;
        const padraoPericiaRemover = /\([^()]*%[^()]*\)/g;

        // Atributos: célula cujo valor corresponde exatamente a uma dessas siglas.
        const padraoAtributo = /^(FOR|DES|INT|CON|APA|POD|TAM|EDU)$/i;

        for (let r = 0; r < 100; r++) {
            for (let c = 0; c < 16; c++) {
                const cell = sheet.getCell(r, c);
                if (typeof cell.value !== 'string') continue;

                const textoCelula = cell.value.replace(/\n/g, ' ').trim();
                if (!textoCelula) continue;

                // Nome do personagem: o rótulo "Nome:" ocupa uma célula e o
                // valor (em célula mesclada, ex.: D3:F3) fica deslocado à
                // direita. Testamos alguns deslocamentos até localizar uma
                // string não vazia.
                if (/^nome:?$/i.test(textoCelula)) {
                    for (const offset of [1, 2, 3]) {
                        const valorCell = sheet.getCell(r, c + offset);
                        if (valorCell && typeof valorCell.value === 'string' && valorCell.value.trim()) {
                            nomeFichaCache[sheetTitle] = valorCell.value.trim();
                            break;
                        }
                    }
                    continue;
                }

                // Perícias
                if (padraoPericiaTeste.test(textoCelula)) {
                    const statName = textoCelula
                        .replace(padraoPericiaRemover, '')
                        .replace(/\s+/g, ' ')
                        .trim();

                    if (statName) {
                        // O valor da perícia normalmente fica 2 colunas à direita
                        // do nome (a célula intermediária fica vazia devido à
                        // mesclagem). Caso não seja encontrado, tenta 1 coluna
                        // à direita como alternativa.
                        let valor;
                        for (const offset of [2, 1]) {
                            const valorCell = sheet.getCell(r, c + offset);
                            if (valorCell && typeof valorCell.value === 'number') {
                                valor = valorCell.value;
                                break;
                            }
                        }
                        if (valor !== undefined) stats[statName] = valor;
                    }
                    continue;
                }

                // Atributos (FOR, DES, INT, CON, APA, POD, TAM, EDU)
                if (padraoAtributo.test(textoCelula)) {
                    const valorCell = sheet.getCell(r, c + 1);
                    if (valorCell && typeof valorCell.value === 'number') {
                        stats[textoCelula.toUpperCase()] = valorCell.value;
                    }
                    continue;
                }

                // Sorte
                if (/^sorte$/i.test(textoCelula)) {
                    for (const offset of [1, 2]) {
                        const valorCell = sheet.getCell(r, c + offset);
                        if (valorCell && typeof valorCell.value === 'number') {
                            stats['Sorte'] = valorCell.value;
                            break;
                        }
                    }
                    continue;
                }

                // Sanidade: "Sanidade" é apenas o título da seção; o valor
                // "Atual" fica em uma das linhas logo abaixo (o mesmo rótulo
                // "Atual" também aparece nas seções de Vida e Magia, por isso
                // a busca é restrita à vizinhança imediata do título).
                if (/^sanidade$/i.test(textoCelula) && !stats['Sanidade']) {
                    for (let r2 = r + 1; r2 <= r + 3 && r2 < 100 && !stats['Sanidade']; r2++) {
                        for (let c2 = 0; c2 < 16; c2++) {
                            const labelCell = sheet.getCell(r2, c2);
                            if (typeof labelCell.value === 'string' && /^atual$/i.test(labelCell.value.trim())) {
                                const valorCell = sheet.getCell(r2, c2 + 1);
                                if (valorCell && typeof valorCell.value === 'number') {
                                    stats['Sanidade'] = valorCell.value;
                                    break;
                                }
                            }
                        }
                    }
                    continue;
                }
            }
        }
        characterCache[sheetTitle] = stats;
        return true;
    } catch (e) {
        console.error("Erro ao sincronizar ficha:", e);
        return false;
    }
}

client.once('ready', async () => {
    console.log(`Bot conectado como ${client.user.tag}!`);
    await doc.loadInfo();
    console.log(`Planilha "${doc.title}" carregada com sucesso!`);

    // Restaura os vínculos usuário → ficha salvos na planilha e resincroniza
    // o cache de cada ficha envolvida, para que /rl já funcione sem que
    // ninguém precise rodar /registrar de novo depois de um restart.
    await carregarRegistros();
    const fichasParaResincronizar = new Set(Object.values(userCharacters));
    for (const sheetTitle of fichasParaResincronizar) {
        const ok = await syncCharacter(sheetTitle);
        console.log(ok ? `Ficha "${sheetTitle}" resincronizada.` : `Falha ao resincronizar "${sheetTitle}".`);
    }

    // Descobre quantas linhas já existem na aba "Rolagens" (criando a
    // aba se ainda não existir), pra que a limpeza em lote saiba desde
    // já se precisa rodar assim que novas rolagens começarem a chegar.
    await inicializarContagemHistoricoRolagens();

    // Repovoa o buffer em RAM (historicoEventos) com o que já estava
    // salvo na planilha, pra que um overlay que conecte logo após um
    // restart do bot já receba o histórico recente — e não só rolagens
    // que aconteceram depois da subida do processo.
    await carregarHistoricoRecenteDaPlanilha();

    const commands = [
        new SlashCommandBuilder()
            .setName('registrar')
            .setDescription('Vincula sua conta a uma ficha.')
            .addStringOption(opt => opt.setName('personagem').setDescription('Nome do personagem').setRequired(true).setAutocomplete(true)),
        new SlashCommandBuilder()
            .setName('rl')
            .setDescription('Rola uma perícia ou atributo (Automático)')
            .addStringOption(opt => opt.setName('pericia').setDescription('O que rolar?').setRequired(true).setAutocomplete(true))
            .addStringOption(opt => opt.setName('vantagem').setDescription('Bônus ou Penalidade?').setRequired(false)
                .addChoices({ name: 'Vantagem (Bônus)', value: 'V' }, { name: 'Desvantagem (Penalidade)', value: 'D' }))
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
});

// =====================================================================
// FONTE 1 — Observação de rolagens do bot "rollem"
//
// O bot escuta as mensagens desse bot terceiro no canal, interpreta o
// texto da rolagem (1d100, múltiplas rolagens, notação com colchetes)
// e classifica o resultado como crítico, falha crítica ou normal antes
// de retransmitir o evento para o overlay.
// =====================================================================
client.on('messageCreate', async (message) => {
  if (message.author.username !== 'rollem') return;

  let jogador = "Investigador";
  if (message.reference && message.reference.messageId) {
    try {
      const mensagemOriginal = await message.channel.messages.fetch(message.reference.messageId);
      let membro = mensagemOriginal.member;

      // Nem sempre a mensagem buscada traz o membro embutido (ex.: cache
      // desatualizado). Nesse caso, busca o membro diretamente na guild
      // para exibir o apelido do servidor em vez do nome global do Discord.
      if (!membro && message.guild) {
        try {
          membro = await message.guild.members.fetch(mensagemOriginal.author.id);
        } catch (erroMembro) {
          console.error("Membro não encontrado na guild — usando o nome do Discord como alternativa.");
        }
      }

      jogador = membro ? membro.displayName : mensagemOriginal.author.displayName;
    } catch (error) {
      console.error("Falha ao recuperar a mensagem original do autor da rolagem.");
    }
  }

  const textoOriginal = message.content;
  const textoLimpo = textoOriginal.replace(/[*_~`]/g, '');
  let tipoEvento = 'normal';
  const matchDado = textoLimpo.match(/(?:(\d+)\s*#\s*)?(\d*)\s*d(\d+)/i);

  if (matchDado) {
    const qtdDados = parseInt(matchDado[2] || "1"); 
    const faces = parseInt(matchDado[3]);

    if (faces === 100) {
      let valoresRolados = [];
      const matchColchetes = textoLimpo.match(/\[([\d,\s]+)\]/);
      
      if (matchColchetes) {
        valoresRolados = matchColchetes[1].split(',').map(n => parseInt(n.trim()));
      } else {
        const aposIgual = textoLimpo.includes('=') ? textoLimpo.split('=').pop() : textoLimpo;
        const numeros = aposIgual.replace(/[^0-9,]/g, '').split(',').filter(Boolean);
        valoresRolados = numeros.map(n => parseInt(n.trim()));
      }

      if (valoresRolados.length > 0 && qtdDados === 1) {
        const valorFinal = Math.max(...valoresRolados);
        if (valorFinal === 1) tipoEvento = 'crit';
        if (valorFinal === 100) tipoEvento = 'fail';
      }
    }
  }

  transmitirEvento({ tipo: 'rollem', jogador: jogador, resultado: textoOriginal, evento: tipoEvento });
});

// =====================================================================
// FONTE 2 — Comandos slash (/registrar e /rl)
// =====================================================================
client.on('interactionCreate', async interaction => {
    if (interaction.isAutocomplete() && interaction.commandName === 'rl') {
        const userId = interaction.user.id;
        const personagem = userCharacters[userId];
        if (!personagem || !characterCache[personagem]) return await interaction.respond([]);

        const focado = interaction.options.getFocused();
        const pericias = Object.keys(characterCache[personagem]);
        const filtradas = pericias.filter(p => p.toLowerCase().includes(focado.toLowerCase())).slice(0, 25);
        await interaction.respond(filtradas.map(p => ({ name: p, value: p })));
    }

    if (interaction.isAutocomplete() && interaction.commandName === 'registrar') {
        const focado = interaction.options.getFocused().toLowerCase();
        const fichas = doc.sheetsByIndex.map(s => s.title);
        const filtradas = fichas
            .filter(t => t.toLowerCase().includes(focado))
            .slice(0, 25);
        await interaction.respond(filtradas.map(t => ({ name: t, value: t })));
    }

    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'registrar') {
        await interaction.deferReply({ ephemeral: true });
        const busca = interaction.options.getString('personagem').toLowerCase();
        const sheet = doc.sheetsByIndex.find(s => s.title.toLowerCase().includes(busca));
        
        if (!sheet) return interaction.editReply(`Não encontrei aba contendo "${busca}".`);

        const sucesso = await syncCharacter(sheet.title);
        if (sucesso) {
            userCharacters[interaction.user.id] = sheet.title;
            await salvarRegistro(interaction.user.id, sheet.title);
            interaction.editReply(`Conta vinculada com sucesso à **${sheet.title}**!`);
        } else {
            interaction.editReply(`Erro ao ler a ficha **${sheet.title}**.`);
        }
    }

    if (interaction.commandName === 'rl') {
        const userId = interaction.user.id;
        const personagem = userCharacters[userId];

        if (!personagem) return interaction.reply({ content: 'Use `/registrar [nome]` primeiro.', ephemeral: true });

        const periciaNome = interaction.options.getString('pericia');
        const vantagem = interaction.options.getString('vantagem'); 
        const valorBase = characterCache[personagem][periciaNome];
        
        if (valorBase === undefined) return interaction.reply({ content: `Perícia **${periciaNome}** não encontrada.`, ephemeral: true });

        const unidade = Math.floor(Math.random() * 10);
        const numDadosDezena = (vantagem === 'V' || vantagem === 'D') ? 2 : 1;
        const dezenas = [];
        for(let i = 0; i < numDadosDezena; i++) dezenas.push(Math.floor(Math.random() * 10));

        const totaisPossiveis = dezenas.map(dez => {
            let t = (dez * 10) + unidade;
            if (t === 0) return 100;
            return t;
        });

        let totalFinal;
        if (vantagem === 'V') totalFinal = Math.min(...totaisPossiveis);
        else if (vantagem === 'D') totalFinal = Math.max(...totaisPossiveis);
        else totalFinal = totaisPossiveis[0];

        const valorBom = Math.floor(valorBase / 2);
        const valorExtremo = Math.floor(valorBase / 5);
        const isFumble = (totalFinal >= 96 && valorBase < 50) || totalFinal === 100;

        let resultadoTexto = '';
        let eventoOBS = 'normal';
        let corEmbed = 0x228B22; 

        if (totalFinal === 1) {
            resultadoTexto = '**CRÍTICO ABSOLUTO (01)**';
            corEmbed = 0xFFD700;
            eventoOBS = 'crit';
        } else if (isFumble) {
            resultadoTexto = '**DESASTRE**';
            corEmbed = 0x8B0000;
            eventoOBS = 'fail';
        } else if (totalFinal <= valorExtremo) {
            resultadoTexto = '**SUCESSO EXTREMO**';
            corEmbed = 0x00BFFF;
        } else if (totalFinal <= valorBom) {
            resultadoTexto = '**SUCESSO BOM**';
            corEmbed = 0x32CD32;
        } else if (totalFinal <= valorBase) {
            resultadoTexto = '**SUCESSO NORMAL**';
        } else {
            resultadoTexto = '**FALHA**';
            corEmbed = 0xFF0000;
        }

        const nomeParaOBS = nomeFichaCache[personagem] || personagem.replace(/Ficha \d+ \(/, '').replace(/\)/, '');
        const statusLimpo = resultadoTexto.replace(/[*_~`]/g, '');
        const avisoVantPlano = vantagem === 'V' ? 'Vantagem' : (vantagem === 'D' ? 'Desvantagem' : '');
        const textoOBS = `Rolou ${totalFinal} em ${periciaNome} (Alvo: ${valorBase}) ➔ ${statusLimpo}`;

        transmitirEvento({
            tipo: 'comando',
            jogador: nomeParaOBS,
            pericia: periciaNome,
            alvo: valorBase,
            valor: totalFinal,
            status: statusLimpo,
            vantagem: avisoVantPlano,
            resultado: textoOBS,
            evento: eventoOBS
        });

        const avisoVant = vantagem === 'V' ? ' *(Vantagem)*' : (vantagem === 'D' ? ' *(Desvantagem)*' : '');
        const embed = new EmbedBuilder()
            .setTitle(`${nomeParaOBS} rolou ${periciaNome}`)
            .setDescription(`**Alvo:** ${valorBase}  |  Bom: ${valorBom}  |  Extremo: ${valorExtremo}`)
            .addFields(
                { name: `Rolagem${avisoVant}`, value: `Dezena(s): [${dezenas.map(d=>d+'0').join(', ')}] \nUnidade: [${unidade}] \n**Resultado: ${totalFinal}**` },
                { name: 'Status', value: resultadoTexto }
            )
            .setColor(corEmbed);

        await interaction.reply({ embeds: [embed] });
    }
});

client.login(process.env.DISCORD_TOKEN);
