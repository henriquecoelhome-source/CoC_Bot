// ============================================================================
// ÍNDICE — coisas visuais fáceis de mexer no Discord (procura "GUIA RÁPIDO")
// - Mensagens de resposta do /registrar ..... linha 487
// - Mensagem de "não registrou ficha" ....... linha 505
// - Cores e textos dos resultados (/rl) ..... linha 535
// - Título, descrição e campos do embed ..... linha 588
// ============================================================================

require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const WebSocket = require('ws');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// WebSocket pro overlay do OBS — toda rolagem (via /rl ou bot rollem) é
// retransmitida em tempo real pra quem tiver conectado nessa porta.
const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });
console.log(`Servidor WebSocket iniciado — aguardando conexões do overlay na porta ${PORT}.`);

// Buffer com as últimas rolagens, pra mandar de uma vez pro overlay quando
// ele reconecta (queda de rede, reload da fonte no OBS etc). Antes era só
// broadcast puro e quem não tava conectado no momento perdia o evento.
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

    // sem await de propósito — não quero atrasar o broadcast nem a resposta
    // do comando por causa da planilha, roda em background
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

// Google Sheets = fonte das fichas de personagem e onde salvamos os
// vínculos usuário → ficha. Precisa de Service Account (não só API key)
// pra poder escrever. Credenciais vêm do .env, ver README pra gerar.
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const serviceAccountAuth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);

// userCharacters: userId -> aba vinculada. characterCache: atributos/perícias
// já lidos. nomeFichaCache: nome do personagem extraído da ficha.
const userCharacters = {};
const characterCache = {};
const nomeFichaCache = {};

// userCharacters vivia só em RAM e sumia a cada redeploy no Render (disco
// é efêmero lá). Agora os vínculos ficam numa aba própria ("Registros"),
// que sobrevive a restart/crash/redeploy.
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

// Histórico de verdade das rolagens (aba "Rolagens") — o historicoEventos
// lá em cima é só o buffer de 6 pra repovoar o overlay, esse aqui é
// persistente. Mantém só as últimas HISTORICO_ROLAGENS_MAX linhas, limpando
// em lotes pra não gastar uma chamada de API a cada /rl só pra manter o
// total redondo (a aba pode passar um pouco do limite entre limpezas, sem problema).
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

// Lê a aba uma vez na inicialização só pra saber o tamanho atual; depois
// disso a contagem é mantida em memória (sem reler a aba a cada rolagem).
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

// Apaga o excedente antigo em lote quando passa do limite. Apaga de trás
// pra frente dentro do lote pra não bagunçar o índice das linhas já buscadas.
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

// Grava uma linha na aba de histórico. Funciona tanto pra rolagens
// estruturadas do /rl quanto pras cruas do bot Rollem (sem perícia/alvo).
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

// Reconstrói o formato de evento a partir de uma linha da aba "Rolagens",
// pra repovoar o buffer em RAM no boot. A distinção comando/rollem é pela
// coluna Perícia (só /rl preenche).
function eventoAPartirDaLinhaHistorico(row) {
    const jogador = row.get('Jogador') || '';
    const pericia = row.get('Pericia') || '';
    const alvo = row.get('Alvo');
    const resultado = row.get('Resultado') || '';
    const status = row.get('Status') || '';

    if (pericia) {
        // rolagem de /rl: Status guarda o texto bruto ("CRÍTICO ABSOLUTO (01)",
        // "DESASTRE"...), então o tipo de evento é inferido daí
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

    // rolagem crua do rollem: aqui Status já vem 'Crítico'/'Falha'/'' direto
    let evento = 'normal';
    if (status === 'Crítico') evento = 'crit';
    else if (status === 'Falha') evento = 'fail';

    return { tipo: 'rollem', jogador, resultado, evento };
}

// Repovoa historicoEventos com as últimas HISTORICO_MAX linhas da planilha,
// usando o offset já contado em inicializarContagemHistoricoRolagens.
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

// Lê a aba e extrai atributos, perícias, Sorte, Sanidade e o nome do
// personagem. Reconhece por padrão de texto (rótulos, "%") em vez de
// posição fixa, então tolera variação de layout entre fichas.
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

        // Perícias seguem o padrão "Nome (xx%)" — ex.: "Lutar (Briga) (25%)".
        // Pego pelo texto, não por coluna, porque atributos não têm essa notação.
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

                // "Nome:" fica numa célula e o valor (mesclado, ex D3:F3) fica
                // deslocado à direita — testa alguns offsets até achar algo
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
                        // valor geralmente 2 colunas à direita (a do meio some
                        // por causa da mesclagem); se não achar, tenta 1 coluna
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

                // "Sanidade" é só o título da seção — o "Atual" fica logo abaixo.
                // Restringe a busca à vizinhança pra não pegar o Atual de Vida/Magia.
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

    // restaura os vínculos salvos e resincroniza as fichas, pra /rl já
    // funcionar sem precisar rodar /registrar de novo após um restart
    await carregarRegistros();
    const fichasParaResincronizar = new Set(Object.values(userCharacters));
    for (const sheetTitle of fichasParaResincronizar) {
        const ok = await syncCharacter(sheetTitle);
        console.log(ok ? `Ficha "${sheetTitle}" resincronizada.` : `Falha ao resincronizar "${sheetTitle}".`);
    }

    await inicializarContagemHistoricoRolagens();

    // repovoa o buffer em RAM pra overlay que reconectar logo após o restart
    // já ver histórico recente, não só rolagens que acontecerem daqui pra frente
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

// ---- FONTE 1: observa as rolagens do bot "rollem" no canal, parseia o
// texto (1d100, colchetes etc) e classifica crítico/falha antes de
// retransmitir pro overlay ----
client.on('messageCreate', async (message) => {
  if (message.author.username !== 'rollem') return;

  let jogador = "Investigador";
  if (message.reference && message.reference.messageId) {
    try {
      const mensagemOriginal = await message.channel.messages.fetch(message.reference.messageId);
      let membro = mensagemOriginal.member;

      // às vezes o member não vem embutido (cache desatualizado) — busca
      // direto na guild pra pegar o apelido do servidor
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

// ---- FONTE 2: comandos slash (/registrar e /rl) ----
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
        
        // GUIA RÁPIDO: mensagens de resposta do /registrar (não achou a aba,
        // deu certo, ou deu erro ao ler). Texto livre, mantém as "${...}".
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

        // GUIA RÁPIDO: mensagem que aparece pra quem tenta usar /rl sem
        // ter registrado uma ficha ainda. Texto livre, pode reescrever.
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

        // GUIA RÁPIDO: cores e textos do embed no Discord
        // Cada resultado tem uma cor (hexadecimal, sem precisar do "#") e um
        // texto próprio. Troca o texto entre aspas ou o número depois do "0x"
        // à vontade — dá até pra colocar emoji no texto (ex: '💀 **DESASTRE** 💀').
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

        // GUIA RÁPIDO: layout do embed que aparece no Discord
        // - setTitle / setDescription: título e linha de baixo do embed. Pode
        //   reescrever o texto, só mantém as "${variavel}" nos lugares certos.
        // - addFields: cada { name, value } é uma seção do embed — "name" é o
        //   título em negrito da seção (ex: "Rolagem", "Status"), "value" é o
        //   conteúdo dela. Dá pra trocar os nomes ou adicionar um field novo.
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
