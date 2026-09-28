// ---------------------------------------------------------------------
// Dado D10 3D (trapezoedro pentagonal), desenhado num <canvas> 2D.
// Usado pelo overlayOBS3D.html: cada dado da rolagem ganha o seu canvas.
//
// Importante: este arquivo NÃO sorteia nada. O número quem decide é o
// bot (index.js); o dado 3D só gira até a face certa (rolarPara) pra
// ilustrar o resultado que já foi calculado.
// ---------------------------------------------------------------------

const DADO3D_FACES = (() => {
    const toRad = (d) => (d * Math.PI) / 180;
    const polar = (ang, y, r) => ({ x: r * Math.cos(toRad(ang)), y, z: r * Math.sin(toRad(ang)) });
    const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
    const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
    const scaleV = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
    const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
    const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
    const norm = (a) => { const l = Math.hypot(a.x, a.y, a.z) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };

    // Proporção entre a altura das pontas e a do "cinturão" do dado.
    // É essa conta que deixa as faces planas (coplanares); se mexer
    // nela, o dado fica torto.
    const th = Math.PI / 5, St = Math.sin(th), Ct = Math.cos(th), S2 = Math.sin(2 * th), C2 = Math.cos(2 * th);
    const Acp = St * (C2 - 1) + S2 * (1 - Ct), Bcp = St * (1 - C2) + S2 * (1 + Ct);
    const RATIO = -Bcp / Acp;

    const R = 95, hBelt = 9.6, H = hBelt * RATIO;
    const T = { x: 0, y: -H, z: 0 }, B = { x: 0, y: H, z: 0 };
    const U = [], L = [];
    for (let i = 0; i < 5; i++) { U.push(polar(i * 72, -hBelt, R)); L.push(polar(i * 72 + 36, hBelt, R)); }

    const topNums = [0, 2, 4, 6, 8], botNums = [3, 1, 9, 7, 5];
    const rawFaces = [];
    for (let i = 0; i < 5; i++) rawFaces.push({ v: [T, U[i], L[i], U[(i + 1) % 5]], num: topNums[i] });
    for (let i = 0; i < 5; i++) rawFaces.push({ v: [B, L[i], U[(i + 1) % 5], L[(i + 1) % 5]], num: botNums[i] });

    return rawFaces.map((f) => {
        const v = f.v;
        const centroid = scaleV(v.reduce((a, c) => add(a, c), { x: 0, y: 0, z: 0 }), 1 / v.length);
        let normal = norm(cross(sub(v[1], v[0]), sub(v[2], v[0])));
        if (dot(normal, centroid) < 0) normal = scaleV(normal, -1);
        let right = cross({ x: 0, y: 1, z: 0 }, normal);
        right = Math.hypot(right.x, right.y, right.z) < 1e-4 ? { x: 1, y: 0, z: 0 } : norm(right);
        const up = norm(cross(normal, right));
        return { v, num: f.num, centroid, normal, right, up };
    });
})();

function dado3dRotX(p, a) { const c = Math.cos(a), s = Math.sin(a); return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c }; }
function dado3dRotY(p, a) { const c = Math.cos(a), s = Math.sin(a); return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c }; }
function dado3dRotZ(p, a) { const c = Math.cos(a), s = Math.sin(a); return { x: p.x * c - p.y * s, y: p.x * s + p.y * c, z: p.z }; }
function dado3dRotateFull(p, ax, ay, az) { return dado3dRotX(dado3dRotY(dado3dRotZ(p, az), ay), ax); }
function dado3dToRad(d) { return (d * Math.PI) / 180; }
function dado3dEaseOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function dado3dTargetDeg(curDeg, tgtDeg, spins) {
    const delta = (((tgtDeg - curDeg) % 360) + 360) % 360;
    return curDeg + spins * 360 + delta;
}

function criarDado3D(canvas, opcoes = {}) {
    const multiplicador = opcoes.multiplicador || 1;
    const ctx = canvas.getContext('2d');
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    const PERSP = 560;
    const LIGHT = { x: -0.35, y: -0.55, z: 0.9 };
    const luzLen = Math.hypot(LIGHT.x, LIGHT.y, LIGHT.z);
    LIGHT.x /= luzLen; LIGHT.y /= luzLen; LIGHT.z /= luzLen;
    const BASE = { r: 196, g: 58, b: 45 };

    // Toda a geometria (R=95 etc.) foi pensada pra um quadro de 360px, que
    // é o tamanho em que o dado preenche o canvas sem cortar. Pra caber em
    // qualquer tamanho, desenho sempre nesse sistema de 360x360 e deixo o
    // ctx.scale() encolher ou esticar tudo junto (inclusive o número).
    const REFERENCIA = 360;

    // Só dá pra medir o canvas depois que ele está na tela (antes disso o
    // clientWidth vem 0). Por isso o tamanho real é ajustado aqui, a cada
    // rolagem, e não na hora em que o dado é criado.
    function garantirTamanho() {
        const size = canvas.clientWidth;
        if (size === 0) return false;
        canvas.width = size * DPR;
        canvas.height = size * DPR;
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        return true;
    }

    function desenhar(ax, ay, az) {
        const size = canvas.clientWidth;
        if (size === 0) return;
        ctx.clearRect(0, 0, size, size);

        ctx.save();
        ctx.scale(size / REFERENCIA, size / REFERENCIA);

        const cx = REFERENCIA / 2, cy = REFERENCIA / 2;
        const project = (p) => { const k = PERSP / (PERSP - p.z); return { x: cx + p.x * k, y: cy + p.y * k }; };

        const projetadas = DADO3D_FACES.map((f) => {
            const rv = f.v.map((p) => dado3dRotateFull(p, ax, ay, az));
            const rn = dado3dRotateFull(f.normal, ax, ay, az);
            const rCentroid = dado3dRotateFull(f.centroid, ax, ay, az);
            const rRight = dado3dRotateFull(f.right, ax, ay, az);
            const rUp = dado3dRotateFull(f.up, ax, ay, az);
            const avgZ = rv.reduce((s, p) => s + p.z, 0) / rv.length;
            const screen = rv.map(project);

            const EPS = 6;
            const c0 = project(rCentroid);
            const cR = project({ x: rCentroid.x + rRight.x * EPS, y: rCentroid.y + rRight.y * EPS, z: rCentroid.z + rRight.z * EPS });
            const cU = project({ x: rCentroid.x + rUp.x * EPS, y: rCentroid.y + rUp.y * EPS, z: rCentroid.z + rUp.z * EPS });
            const dirR = { x: (cR.x - c0.x) / EPS, y: (cR.y - c0.y) / EPS };
            const dirU = { x: (cU.x - c0.x) / EPS, y: (cU.y - c0.y) / EPS };

            const shade = Math.max(0.18, rn.x * LIGHT.x + rn.y * LIGHT.y + rn.z * LIGHT.z);
            return { screen, avgZ, shade, num: f.num, facing: rn.z, centroidScreen: c0, dirR, dirU };
        });

        projetadas.sort((a, b) => a.avgZ - b.avgZ);

        projetadas.forEach((f) => {
            ctx.beginPath();
            f.screen.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
            ctx.closePath();
            const r = Math.round(BASE.r * f.shade + 30), g = Math.round(BASE.g * f.shade + 8), b = Math.round(BASE.b * f.shade + 6);
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,.4)';
            ctx.lineWidth = 1;
            ctx.stroke();

            if (f.facing < 0.05) return;

            // O multiplicador só muda o TEXTO da face: o dado da dezena
            // mostra 00, 10, 20… 90, igual a um d10 percentual de mesa.
            // Qual face fica de frente continua sendo decidido pelo f.num (0 a 9).
            const valorExibido = f.num * multiplicador;
            const texto = multiplicador > 1 ? String(valorExibido).padStart(2, '0') : String(valorExibido);

            ctx.save();
            ctx.transform(f.dirR.x, f.dirR.y, f.dirU.x, f.dirU.y, f.centroidScreen.x, f.centroidScreen.y);
            ctx.fillStyle = 'rgba(255,255,255,.95)';
            ctx.font = "700 30px -apple-system,Segoe UI,Roboto,sans-serif";
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(0,0,0,.6)';
            ctx.shadowBlur = 3;
            ctx.fillText(texto, 0, 0);
            ctx.restore();
        });

        ctx.restore();
    }

    let curAx = -14, curAy = 24 + Math.random() * 60, curAz = Math.random() * 30;

    function rolarPara(valorAlvo) {
        return new Promise((resolve) => {
            if (!garantirTamanho()) { resolve(); return; }

            const fd = DADO3D_FACES.find((f) => f.num === valorAlvo) || DADO3D_FACES[0];
            const ayT = Math.asin(Math.max(-1, Math.min(1, fd.right.z))) * (180 / Math.PI);
            const axT = Math.atan2(-fd.up.z, fd.normal.z) * (180 / Math.PI);
            const azT = Math.atan2(-fd.right.y, fd.right.x) * (180 / Math.PI);

            const spinsX = 3 + Math.floor(Math.random() * 2);
            const spinsY = 4 + Math.floor(Math.random() * 2);
            const spinsZ = 2 + Math.floor(Math.random() * 2);

            const startAx = curAx, startAy = curAy, startAz = curAz;
            const endAx = dado3dTargetDeg(curAx, axT, spinsX);
            const endAy = dado3dTargetDeg(curAy, ayT, spinsY);
            const endAz = dado3dTargetDeg(curAz, azT, spinsZ);

            const duracao = 1300;
            const t0 = performance.now();

            function quadro(agora) {
                const t = Math.min(1, (agora - t0) / duracao);
                const e = dado3dEaseOutCubic(t);
                const ax = startAx + (endAx - startAx) * e;
                const ay = startAy + (endAy - startAy) * e;
                const az = startAz + (endAz - startAz) * e;
                desenhar(dado3dToRad(ax), dado3dToRad(ay), dado3dToRad(az));
                if (t < 1) {
                    requestAnimationFrame(quadro);
                } else {
                    curAx = endAx; curAy = endAy; curAz = endAz;
                    resolve();
                }
            }
            requestAnimationFrame(quadro);
        });
    }

    return { rolarPara };
}
