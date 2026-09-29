/**
 * HUD_criar_aba.gs
 * Cria sozinho a aba que alimenta o overlay CthulhuStatus.html (HUD de Vida/Sanidade/Magia).
 *
 * Como usar (resumo): na planilha, Extensões → Apps Script → cole este arquivo inteiro →
 * salve → recarregue a planilha → menu "🎲 HUD" → "Criar / atualizar aba do HUD".
 * O passo a passo completo está no README (Passo 9).
 *
 * O que ele faz: procura todas as abas cujo nome começa com "Ficha" (Ficha 1 (Arthur),
 * Ficha 2 (Helena)...) e monta uma aba com uma linha por ficha, puxando Nome, Vida, Sanidade
 * e Magia por FÓRMULA. Depois disso a aba se atualiza sozinha quando os jogadores mexem
 * nas fichas. Rode de novo sempre que entrar uma ficha nova.
 */

// ===================== CONFIGURAÇÃO (só mexa se precisar) =====================

// Nome da aba criada. Se mudar aqui, o HUD continua funcionando (ele usa o gid, não o nome).
const NOME_ABA_HUD = 'OBS_Export (NAO MEXER)';

// Toda aba cujo nome COMEÇA com isto é considerada a ficha de um jogador.
const PREFIXO_FICHAS = 'Ficha';

// Abas com estes trechos no nome são ignoradas (ex.: "Ficha Modelo").
const IGNORAR_SE_CONTIVER = ['modelo'];

// Células de cada ficha, NESTA ORDEM (igual ao CABECALHO abaixo).
// Os valores abaixo são os da Ficha_CoC_Modelo.xlsx. Se a sua ficha for diferente, troque aqui.
const CELULAS   = ['D3',   'M4',      'I4',     'M8',        'K8',      'M6',      'I6'];
const CABECALHO = ['Nome', 'PV Atual', 'PV Max', 'SAN Atual', 'SAN Max', 'PM Atual', 'PM Max'];

// ==============================================================================

/** Cria o menu "🎲 HUD" toda vez que a planilha é aberta. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🎲 HUD')
    .addItem('Criar / atualizar aba do HUD', 'criarAbaHUD')
    .addItem('Mostrar link do HUD', 'mostrarLinkHUD')
    .addToUi();
}

/** Nomes das abas que parecem fichas de jogadores, na ordem em que aparecem na planilha. */
function fichasEncontradas_(ss) {
  const prefixo = PREFIXO_FICHAS.toLowerCase();
  return ss.getSheets().map(function (s) { return s.getName(); }).filter(function (nome) {
    const n = nome.toLowerCase();
    if (n === NOME_ABA_HUD.toLowerCase()) return false;
    if (n.indexOf(prefixo) !== 0) return false;
    return !IGNORAR_SE_CONTIVER.some(function (t) { return n.indexOf(t.toLowerCase()) !== -1; });
  });
}

/** Cria (ou refaz) a aba do HUD com uma linha de fórmulas por ficha. */
function criarAbaHUD() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const fichas = fichasEncontradas_(ss);

  if (fichas.length === 0) {
    ui.alert('Nenhuma ficha encontrada',
      'Não achei nenhuma aba com nome começando por "' + PREFIXO_FICHAS + '".\n\n' +
      'Renomeie as abas dos jogadores (ex.: "Ficha 1 (Arthur)") ou mude o PREFIXO_FICHAS no topo do script.',
      ui.ButtonSet.OK);
    return;
  }

  let aba = ss.getSheetByName(NOME_ABA_HUD);
  if (aba) {
    const resp = ui.alert('A aba do HUD já existe',
      'Refazer a aba "' + NOME_ABA_HUD + '"? O conteúdo atual dela será substituído pelas ' +
      fichas.length + ' ficha(s) encontrada(s). Nenhuma ficha é alterada.',
      ui.ButtonSet.YES_NO);
    if (resp !== ui.Button.YES) return;
    aba.clear();
  } else {
    aba = ss.insertSheet(NOME_ABA_HUD);
  }

  // Monta a tabela: cabeçalho + uma linha de fórmulas por ficha.
  const linhas = [CABECALHO];
  fichas.forEach(function (nome) {
    // Aspas simples dentro do nome da aba precisam ser dobradas na fórmula.
    const ref = "'" + nome.replace(/'/g, "''") + "'!";
    linhas.push(CELULAS.map(function (celula) { return '=' + ref + celula; }));
  });

  aba.getRange(1, 1, linhas.length, CABECALHO.length).setValues(linhas);
  aba.getRange(1, 1, 1, CABECALHO.length).setFontWeight('bold');
  aba.setFrozenRows(1);
  aba.autoResizeColumns(1, CABECALHO.length);
  aba.setTabColor('#8b0000');

  mostrarLinkHUD_(fichas);
}

/** Item de menu: só mostra o link da aba (útil se você já criou a aba antes). */
function mostrarLinkHUD() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(NOME_ABA_HUD)) {
    const ui = SpreadsheetApp.getUi();
    ui.alert('Aba do HUD não encontrada',
      'Use antes o menu 🎲 HUD → "Criar / atualizar aba do HUD".', ui.ButtonSet.OK);
    return;
  }
  mostrarLinkHUD_(null);
}

/** Abre uma janelinha com a linha pronta pra colar no CthulhuStatus.html. */
function mostrarLinkHUD_(fichas) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aba = ss.getSheetByName(NOME_ABA_HUD);
  const url = 'https://docs.google.com/spreadsheets/d/' + ss.getId() +
              '/export?format=csv&gid=' + aba.getSheetId();
  const linha = "const csvUrl = '" + url + "';";

  const resumo = fichas
    ? '<p><b>Pronto!</b> ' + fichas.length + ' ficha(s) no HUD:<br>' +
      fichas.map(function (n) { return '• ' + esc_(n); }).join('<br>') + '</p>'
    : '';

  const html = HtmlService.createHtmlOutput(
    '<div style="font-family:Arial,sans-serif;font-size:13px">' + resumo +
    '<p>Copie a linha abaixo e cole no <b>CthulhuStatus.html</b>, <b>no lugar</b> da linha que começa com <code>const csvUrl</code>:</p>' +
    '<textarea id="t" readonly style="width:100%;height:95px;font-family:monospace;font-size:12px">' + esc_(linha) + '</textarea>' +
    '<p><button onclick="var t=document.getElementById(\'t\');t.select();document.execCommand(\'copy\');this.innerText=\'Copiado!\'">Copiar</button></p>' +
    '<p style="color:#666">Lembre de compartilhar a planilha como <b>Qualquer pessoa com o link</b> (Compartilhar → Acesso geral). ' +
    'Não poste essa linha em lugar público: ela contém o ID da sua planilha.</p></div>'
  ).setWidth(560).setHeight(fichas ? 200 + fichas.length * 18 + 200 : 330);

  SpreadsheetApp.getUi().showModalDialog(html, 'HUD — link da aba');
}

/** Escapa texto pra colocar dentro de HTML. */
function esc_(txt) {
  return String(txt).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
