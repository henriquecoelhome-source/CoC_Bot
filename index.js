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
