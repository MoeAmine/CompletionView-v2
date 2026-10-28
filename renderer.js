/* CompletionView 1.0 — Konva Renderer & Export */

// ═══════════════════════════════════════════════════════
//  KONVA INITIALISATION
// ═══════════════════════════════════════════════════════
function initKonva() {
    const canvasContainer = document.getElementById('container');
    stage = new Konva.Stage({
        container: 'container',
        width: canvasContainer.offsetWidth,
        height: canvasContainer.offsetHeight,
        draggable: true,
        pixelRatio: window.devicePixelRatio > 1 ? window.devicePixelRatio : 2
    });
    layer = new Konva.Layer();
    stage.add(layer);
    axesLayer = new Konva.Layer();
    stage.add(axesLayer);

    const resizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
            stage.width(entry.contentRect.width);
            stage.height(entry.contentRect.height);
            drawDynamicAxes();
        }
    });
    resizeObserver.observe(canvasContainer);

    function _updateMinimapIfVisible() {
        var map = document.getElementById('minimap');
        if (map && map.style.display !== 'none') updateMinimap();
    }

    stage.on('wheel', (e) => {
        e.evt.preventDefault();
        const scaleBy = 1.1;
        const oldScale = stage.scaleX();
        const pointer = stage.getPointerPosition();
        const mousePointTo = {
            x: (pointer.x - stage.x()) / oldScale,
            y: (pointer.y - stage.y()) / oldScale
        };
        const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
        stage.scale({ x: newScale, y: newScale });
        stage.position({
            x: pointer.x - mousePointTo.x * newScale,
            y: pointer.y - mousePointTo.y * newScale
        });
        drawDynamicAxes();
        updateLabelScale();
        hideOverlay();
        _updateMinimapIfVisible();
        updateStatusBar();
        _debouncedSaveView();
    });

    stage.on('dragmove', () => {
        drawDynamicAxes();
        hideOverlay();
        _updateMinimapIfVisible();
    });

    stage.on('dragend', () => {
        _debouncedSaveView();
    });

    stage.on('click tap', (e) => {
        if (e.target === stage || e.target.className === 'Rect') {
            hideOverlay();
            hideContextMenu();
        }
    });
}

// ═══════════════════════════════════════════════════════
//  ASSET LOADING
// ═══════════════════════════════════════════════════════
function loadAssetsAndRender() {
    initLogs();

    const ASSETS = {
        screenTexture: "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3Crect width='20' height='20' fill='%23cbd5e1'/%3E%3Ccircle cx='10' cy='10' r='2' fill='%2394a3b8'/%3E%3C/svg%3E",
        blankTexture: "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='50' height='50'%3E%3Crect width='50' height='50' fill='%23e2e8f0'/%3E%3C/svg%3E",
        packerImage: "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='85'%3E%3Crect width='100' height='85' fill='%231e293b'/%3E%3C/svg%3E",
        plugImage: "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='50' height='50'%3E%3Crect width='50' height='50' fill='%23880e4f'/%3E%3C/svg%3E"
    };

    const keys = Object.keys(ASSETS);
    imagesToLoad = keys.length;

    keys.forEach(key => {
        loadedImages[key] = new Image();
        loadedImages[key].onload = () => {
            imagesToLoad--;
            if (imagesToLoad === 0) generateVisuals();
        };
        loadedImages[key].src = ASSETS[key];
    });
}

// ═══════════════════════════════════════════════════════
//  GENERATE VISUALS (orchestrator)
// ═══════════════════════════════════════════════════════
function generateVisuals() {
    if (typeof Konva === 'undefined') return;
    bindLogTooltipEvents();
    syncDataFromUI();
    renderTable();
    renderVisuals();
    updateStatusBar();
}

// ═══════════════════════════════════════════════════════
//  DRAWING HELPERS
// ═══════════════════════════════════════════════════════
function cylGrad(native, h, stops) {
    const g = native.createLinearGradient(0, 0, 0, h);
    stops.forEach(([pos, col]) => g.addColorStop(pos, col));
    return g;
}

function drawPipe(grp, x, w, h) {
    grp.add(new Konva.Shape({
        x: x, y: 0, width: w, height: h, listening: false,
        sceneFunc: function (ctx) {
            const n = ctx._context;
            const g = cylGrad(n, h, [
                [0.00, '#8a9199'], [0.10, '#b8c0c8'], [0.22, '#f0f3f5'],
                [0.34, '#c8d0d8'], [0.46, '#8e979f'], [0.56, '#727c84'],
                [0.66, '#8c9499'], [0.78, '#626a70'], [0.90, '#555f68'],
                [1.00, '#727c84'],
            ]);
            n.beginPath(); n.rect(0, 0, w, h);
            n.fillStyle = g; n.fill();
            // Glint line
            n.beginPath();
            n.moveTo(0, h * 0.22); n.lineTo(w, h * 0.22);
            n.strokeStyle = 'rgba(255,255,255,0.30)';
            n.lineWidth = Math.max(0.4, h * 0.018);
            n.stroke();
            // Surface impurity streaks
            let seed = 42;
            function rand() { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; }
            for (let i = 0; i < 28; i++) {
                const yFrac = rand(), xStart = rand() * w * 0.3;
                const len = w * (0.3 + rand() * 0.7), alpha = 0.03 + rand() * 0.10;
                const color = rand() > 0.5
                    ? 'rgba(255,255,255,' + alpha.toFixed(3) + ')'
                    : 'rgba(0,0,0,' + alpha.toFixed(3) + ')';
                n.beginPath();
                n.moveTo(xStart, yFrac * h); n.lineTo(xStart + len, yFrac * h);
                n.strokeStyle = color;
                n.lineWidth = Math.max(0.3, h * (0.008 + rand() * 0.018));
                n.stroke();
            }
        }
    }));
}

// ═══════════════════════════════════════════════════════
//  TICK-SPACING HELPER
// ═══════════════════════════════════════════════════════
function calculateTickSpacing(range, minTicks, maxTicks) {
    if (minTicks === undefined) minTicks = 5;
    if (maxTicks === undefined) maxTicks = 15;
    const rawStep = range / maxTicks;
    const mag = Math.floor(Math.log10(rawStep));
    const magPow = Math.pow(10, mag);
    const ms = rawStep / magPow;
    let step;
    if (ms > 5) step = 10 * magPow;
    else if (ms > 2) step = 5 * magPow;
    else if (ms > 1) step = 2 * magPow;
    else step = magPow;
    return step;
}

// ═══════════════════════════════════════════════════════
//  TRUE-TRAJECTORY TOGGLE
// ═══════════════════════════════════════════════════════
function handleTrueTrajChange() {
    const isTrue = document.getElementById("true-traj").checked;
    document.getElementById("show-tvd").checked = !isTrue;
    if (!isTrue) document.getElementById("show-dev").checked = true;
    generateVisuals();
}

// ═══════════════════════════════════════════════════════
//  TRAJECTORY-AWARE WORLD-X HELPERS
// ═══════════════════════════════════════════════════════
// Builds a lookup table [{md, wx}] by walking wellData exactly as renderVisuals
// does: for each component, the inclination at the component START MD is used for
// the whole component (piecewise-constant). This guarantees tick positions align
// with visual element positions regardless of component length.
function buildMDWorldXTable(startMD, wellDataArr, trajectory, trueTraj) {
    const table = [{ md: startMD, wx: INITIAL_X }];
    let wx = INITIAL_X;
    let wy = CENTER_Y;
    let currentMD = startMD;
    wellDataArr.forEach(function(comp) {
        let devAngle = 90;
        if (trueTraj && trajectory && trajectory.length > 0) {
            const tData = getTrajectoryData(currentMD, trajectory);
            if (tData) devAngle = tData.dev;
        }
        const canvasAngle = trueTraj ? (90 - devAngle) : 0;
        const width = comp.length_m * PIXELS_PER_METER;
        wx += width * Math.cos(canvasAngle * Math.PI / 180);
        wy += width * Math.sin(canvasAngle * Math.PI / 180);
        currentMD += comp.length_m;
        table.push({ md: currentMD, wx });
    });
    return table;
}

// Linearly interpolates world-X from the table for an arbitrary MD value.
function interpMDWorldX(md, table) {
    if (table.length === 0) return INITIAL_X;
    if (md <= table[0].md) return table[0].wx;
    if (md >= table[table.length - 1].md) return table[table.length - 1].wx;
    let lo = 0, hi = table.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (table[mid].md <= md) lo = mid; else hi = mid;
    }
    const ratio = (md - table[lo].md) / (table[hi].md - table[lo].md);
    return table[lo].wx + ratio * (table[hi].wx - table[lo].wx);
}

// ═══════════════════════════════════════════════════════
//  DYNAMIC AXES
// ═══════════════════════════════════════════════════════
function drawDynamicAxes() {
    if (typeof Konva === 'undefined' || !axesLayer || !stage) return;
    axesLayer.destroyChildren();

    const showAxes = document.getElementById("show-dynamic-axes")?.checked;
    if (!showAxes) { axesLayer.draw(); return; }

    const trueTraj = document.getElementById("true-traj")?.checked;
    const startMD = parseFloat(document.getElementById("start-md").value) || 3119.32;
    const scale = stage.scaleX();
    const posX = stage.x();
    const posY = stage.y();
    const w = stage.width();
    const h = stage.height();

    axesLayer.x(-posX / scale);
    axesLayer.y(-posY / scale);
    axesLayer.scale({ x: 1 / scale, y: 1 / scale });

    const AXIS_COLOR = isDarkCanvas ? '#64748b' : '#334155';
    const AX_TEXT = isDarkCanvas ? '#94a3b8' : '#334155';
    const AX_BG = isDarkCanvas ? '#0f172a' : '#f8fafc';
    const AX_BORDER = isDarkCanvas ? '#1e293b' : '#e2e8f0';
    const FONT_SIZE = 12;
    const MARGIN_BOTTOM = 70;
    const MARGIN_LEFT = 75;

    // Background frames
    axesLayer.add(new Konva.Rect({ x: 0, y: 0, width: MARGIN_LEFT, height: h, fill: AX_BG, stroke: AX_BORDER, strokeWidth: 1 }));
    axesLayer.add(new Konva.Rect({ x: 0, y: h - MARGIN_BOTTOM, width: w, height: MARGIN_BOTTOM, fill: AX_BG, stroke: AX_BORDER, strokeWidth: 1 }));

    const logicLeftX = -posX / scale;
    const logicRightX = (w - posX) / scale;
    const logicTopY = -posY / scale;
    const logicBottomY = (h - posY) / scale;

    // Y-AXIS (TVD) — only in true-trajectory mode
    if (trueTraj) {
        axesLayer.add(new Konva.Line({ points: [MARGIN_LEFT, 0, MARGIN_LEFT, h - MARGIN_BOTTOM], stroke: AXIS_COLOR, strokeWidth: 2 }));

        const yMetersTop = (logicTopY - CENTER_Y) / PIXELS_PER_METER;
        const yMetersBottom = (logicBottomY - CENTER_Y) / PIXELS_PER_METER;
        const yMetersRange = yMetersBottom - yMetersTop;
        const yStep = calculateTickSpacing(yMetersRange, 5, Math.floor(h / 70));

        let startTVD = 2500;
        if (currentTrajectory.length > 0) {
            const tData = getTrajectoryData(startMD, currentTrajectory);
            if (tData) startTVD = tData.tvd;
        }

        const startYTickLogic = Math.floor(yMetersTop / yStep) * yStep;
        for (let t = startYTickLogic; t <= yMetersBottom; t += yStep) {
            const screenY = ((t * PIXELS_PER_METER) + CENTER_Y) * scale + posY;
            if (screenY > 0 && screenY < (h - MARGIN_BOTTOM)) {
                axesLayer.add(new Konva.Line({ points: [MARGIN_LEFT - 10, screenY, MARGIN_LEFT, screenY], stroke: AXIS_COLOR, strokeWidth: 2 }));
                const roundTo = yStep >= 10 ? 10 : yStep >= 5 ? 5 : 1;
                const labelVal = Math.round((startTVD + t) / roundTo) * roundTo;
                axesLayer.add(new Konva.Text({
                    x: 5, y: screenY - 5, text: labelVal.toString(),
                    fontSize: FONT_SIZE, fill: AX_TEXT, width: MARGIN_LEFT - 18, align: 'right', fontFamily: 'monospace'
                }));
            }
        }

        const yTitle = new Konva.Text({
            x: 15, y: h / 2 + 50, text: "True Vertical Depth [m TVD]",
            fontSize: 11, fontStyle: 'bold', fill: AX_TEXT, fontFamily: 'sans-serif'
        });
        yTitle.rotation(-90);
        axesLayer.add(yTitle);
    }

    // X-AXIS (MD / Departure)
    axesLayer.add(new Konva.Line({ points: [MARGIN_LEFT, h - MARGIN_BOTTOM, w, h - MARGIN_BOTTOM], stroke: AXIS_COLOR, strokeWidth: 2 }));

    const showTVD = document.getElementById("show-tvd")?.checked;
    const showDev = document.getElementById("show-dev")?.checked;

    const xMetersLeft = (logicLeftX - INITIAL_X) / PIXELS_PER_METER;
    const xMetersRight = (logicRightX - INITIAL_X) / PIXELS_PER_METER;
    const xMetersRange = xMetersRight - xMetersLeft;
    const xStep = calculateTickSpacing(xMetersRange, 5, Math.floor(w / 100));

    // Build the MD→worldX table once (mirrors renderVisuals' element walk exactly)
    const mdWXTable = (trueTraj && currentTrajectory.length > 0)
        ? buildMDWorldXTable(startMD, wellData, currentTrajectory, true)
        : null;

    // MD loop range: in true-traj mode cover full wellData span; linear mode uses screen bounds
    let loopStartMD, loopEndMD;
    if (mdWXTable) {
        loopStartMD = mdWXTable[0].md;
        loopEndMD   = mdWXTable[mdWXTable.length - 1].md;
    } else {
        loopStartMD = startMD + xMetersLeft;
        loopEndMD   = startMD + xMetersRight;
    }
    const firstTickMD = Math.ceil(loopStartMD / xStep) * xStep;

    for (let logicalMD = firstTickMD; logicalMD <= loopEndMD; logicalMD += xStep) {
        const worldX = mdWXTable
            ? interpMDWorldX(logicalMD, mdWXTable)
            : INITIAL_X + (logicalMD - startMD) * PIXELS_PER_METER;
        const screenX = worldX * scale + posX;
        if (screenX > MARGIN_LEFT && screenX < w) {
            axesLayer.add(new Konva.Line({ points: [screenX, h - MARGIN_BOTTOM, screenX, h - MARGIN_BOTTOM + 10], stroke: AXIS_COLOR, strokeWidth: 2 }));
            let labelText = logicalMD.toFixed(0);
            if (currentTrajectory.length > 0) {
                const trajData = getTrajectoryData(logicalMD, currentTrajectory);
                if (trajData) {
                    if (showTVD) labelText += '\n' + trajData.tvd.toFixed(1);
                    if (showDev) labelText += '\n' + trajData.dev.toFixed(1) + '\u00B0';
                }
            }
            axesLayer.add(new Konva.Text({ x: screenX - 40, y: h - MARGIN_BOTTOM + 15, text: labelText, fontSize: FONT_SIZE, fill: AX_TEXT, width: 80, align: 'center', lineHeight: 1.3, fontFamily: 'monospace' }));
        }
    }

    // X-AXIS LEGEND
    let legendText = "MD [m]";
    if (showTVD) legendText += "\nTVD [m]";
    if (showDev) legendText += "\nInc [\u00B0]";
    axesLayer.add(new Konva.Text({ x: 10, y: h - MARGIN_BOTTOM + 15, text: legendText, fontSize: 11, fontStyle: 'bold', fill: AX_TEXT, lineHeight: 1.4, fontFamily: 'sans-serif' }));

    // Pinned log track labels
    if (window.logTrackMeta && window.logTrackMeta.length > 0) {
        window.logTrackMeta.forEach((meta) => {
            const log = logsData[meta.logIdx];
            if (!log || !meta.stepMeta || meta.stepMeta.length === 0) return;
            const pt = meta.stepMeta[0];
            const canvNearY = pt.wy + pt.perpY * pt.trackNear;
            const canvFarY = pt.wy + pt.perpY * pt.trackFar;
            const screenNearY = canvNearY * scale + posY;
            const screenFarY = canvFarY * scale + posY;
            const screenTrackH = screenFarY - screenNearY;
            if (screenFarY < 0 || screenNearY > h) return;

            const labelText = log.name + '\n[' + log.min + '\u2013' + log.max + ']';
            const FONT_SIZE_LBL = 9;
            const pillW = Math.min(labelText.length * FONT_SIZE_LBL * 0.62, screenTrackH - 6);
            const labelX = MARGIN_LEFT + 5;
            const labelY = screenNearY + (screenTrackH - pillW) / 2 + pillW;

            const lbl = new Konva.Text({
                x: labelX + FONT_SIZE_LBL - 1, y: labelY, text: labelText,
                fontSize: FONT_SIZE_LBL, fontFamily: 'monospace', fontStyle: 'bold',
                fill: meta.pal.stroke, lineHeight: 1.5
            });
            lbl.rotation(-90);
            axesLayer.add(lbl);
        });
    }
    axesLayer.draw();
}

// ═══════════════════════════════════════════════════════
//  LABEL SCALE
// ═══════════════════════════════════════════════════════
function updateLabelScale() {
    if (!stage) return;
    const scale      = stage.scaleX();
    const HIDE_BELOW = 0.25; // hide all labels when very zoomed out

    const allGroups = stage.find('.comp-label-group');
    if (allGroups.length === 0) return;

    // Suppress labels when very zoomed out
    if (scale < HIDE_BELOW) {
        allGroups.forEach(function(grp) {
            const label  = grp.findOne('.comp-label');
            const leader = grp.findOne('.comp-leader');
            if (label)  label.visible(false);
            if (leader) leader.visible(false);
        });
        layer.batchDraw();
        return;
    }

    const fs         = Math.max(10, Math.min(28, 11 / scale)); // always ~11 screen-px
    const labelH     = fs * 1.25;                              // single-line height (world)
    const BASE_STEM  = Math.max(8, 12 / scale);               // shortest leader (world)
    const LANE_STEP  = labelH + Math.max(3, 3 / scale);       // extra height per lane (world)
    const SCREEN_GAP = 4;                                      // min screen-px gap between labels

    // Off-screen canvas for accurate single-line text measurement
    const _m = document.createElement('canvas').getContext('2d');

    // First pass: measure every label
    const items = [];
    allGroups.forEach(function(grp) {
        const label  = grp.findOne('.comp-label');
        const leader = grp.findOne('.comp-leader');
        if (!label) return;

        const elemW        = label.getAttr('elementWidth') || 0;
        const leaderStartY = grp.getAttr('leaderStartY') || -2;

        // Flatten to single line (idempotent)
        const flatText = label.text().replace(/\n/g, ' ');
        label.text(flatText);

        // Measure natural text width at current font size
        _m.font = 'bold ' + fs + 'px Arial';
        const textW = _m.measureText(flatText).width + 12; // 6px padding each side

        // Screen-space horizontal centre of the element
        const absPos     = grp.getAbsolutePosition();
        const screenCx   = absPos.x + (elemW / 2) * scale;
        const screenHalf = (textW / 2) * scale;

        items.push({
            label, leader, elemW, textW, leaderStartY,
            screenCx,
            screenL: screenCx - screenHalf,
            screenR: screenCx + screenHalf,
            lane: 0
        });
    });

    // Sort labels left-to-right by their screen centre
    items.sort((a, b) => a.screenCx - b.screenCx);

    // Assign each label to the lowest lane where it fits without overlapping
    const laneRights = [];
    items.forEach(function(it) {
        let placed = false;
        for (let li = 0; li < laneRights.length; li++) {
            if (it.screenL >= laneRights[li] + SCREEN_GAP) {
                it.lane = li;
                laneRights[li] = it.screenR;
                placed = true;
                break;
            }
        }
        if (!placed) {
            it.lane = laneRights.length;
            laneRights.push(it.screenR);
        }
    });

    // Second pass: position every label — all visible, staggered by lane
    items.forEach(function(it) {
        const stemH = BASE_STEM + it.lane * LANE_STEP;
        // leader runs from leaderStartY (at/above element) up to the label base
        const topY  = it.leaderStartY - stemH - labelH;

        it.label.visible(true);
        it.label.fontSize(fs);
        it.label.wrap('none');
        it.label.width(it.textW);
        it.label.x((it.elemW - it.textW) / 2);
        it.label.y(topY);

        if (it.leader) {
            it.leader.visible(true);
            it.leader.points([it.elemW / 2, it.leaderStartY, it.elemW / 2, topY + labelH]);
            it.leader.strokeWidth(Math.max(0.4, 0.5 / scale));
        }
    });
}

// ═══════════════════════════════════════════════════════
//  MAIN RENDER
// ═══════════════════════════════════════════════════════
function renderVisuals() {
    if (imagesToLoad > 0 || typeof Konva === 'undefined') return;
    layer.destroyChildren();
    layer.add(new Konva.Rect({
        x: -BG_RECT_HALF, y: -BG_RECT_HALF,
        width: BG_RECT_HALF * 2, height: BG_RECT_HALF * 2,
        fill: isDarkCanvas ? '#0f172a' : '#f8fafc', name: 'bg-rect'
    }));

    const showNames = document.getElementById("show-names")?.checked;
    const showLengths = document.getElementById("show-lengths")?.checked;
    const showTVD = document.getElementById("show-tvd")?.checked;
    const showDev = document.getElementById("show-dev")?.checked;
    const showDropLines = document.getElementById("show-drop-lines")?.checked;
    const trueTraj = document.getElementById("true-traj")?.checked;
    const showHole = document.getElementById("show-hole")?.checked;
    const showCasing = document.getElementById("show-casing")?.checked;
    const showID = document.getElementById("show-id")?.checked;
    const canvasTextColor = isDarkCanvas ? '#94a3b8' : TEXT_COLOR;
    const canvasPipeStroke = isDarkCanvas ? '#1e293b' : PIPE_STROKE;

    let currentX = INITIAL_X;
    let currentY = CENTER_Y;
    let startMD = parseFloat(document.getElementById("start-md").value) || 3119.32;
    let currentMD = startMD;
    let prevWidth = 0;
    let prevCanvasAngle = 0;
    let maxPipeY = CENTER_Y;

    wellData.forEach((comp) => {
        let devAngle = 90;
        if (trueTraj && currentTrajectory.length > 0) {
            const tData = getTrajectoryData(currentMD, currentTrajectory);
            if (tData) devAngle = tData.dev;
        }

        let canvasAngle = trueTraj ? (90 - devAngle) : 0;

        let width = comp.length_m * PIXELS_PER_METER;
        const height = comp.od_inch * PIXELS_PER_INCH;

        let xPos = currentX, yPos = currentY;

        const group = new Konva.Group({ x: xPos, y: yPos, rotation: canvasAngle, offsetY: height / 2 });

        // Open hole overlay
        if (showHole) {
            openHoleData.forEach(hole => {
                const oTop = Math.max(currentMD, hole.top);
                const oBot = Math.min(currentMD + comp.length_m, hole.bottom);
                if (oTop < oBot) {
                    const hLen = oBot - oTop;
                    const hHeight = hole.size * PIXELS_PER_INCH;
                    const hX = (oTop - currentMD) * PIXELS_PER_METER;
                    const hYTop = (height / 2) - (hHeight / 2);
                    const hYBot = (height / 2) + (hHeight / 2);
                    group.add(new Konva.Line({ points: [hX, hYTop, hX + hLen * PIXELS_PER_METER, hYTop], stroke: '#94a3b8', strokeWidth: 2, dash: [8, 6] }));
                    group.add(new Konva.Line({ points: [hX, hYBot, hX + hLen * PIXELS_PER_METER, hYBot], stroke: '#94a3b8', strokeWidth: 2, dash: [8, 6] }));
                }
            });
        }

        // Casing overlay
        if (showCasing) {
            casingData.forEach(casing => {
                const oTop = Math.max(currentMD, casing.top);
                const oBot = Math.min(currentMD + comp.length_m, casing.bottom);
                if (oTop < oBot) {
                    const cLen = oBot - oTop;
                    const cHeight = casing.size * PIXELS_PER_INCH;
                    const cX = (oTop - currentMD) * PIXELS_PER_METER;
                    const cYTop = (height / 2) - (cHeight / 2);
                    const cYBot = (height / 2) + (cHeight / 2);
                    const cWidth = cLen * PIXELS_PER_METER;
                    group.add(new Konva.Line({ points: [cX, cYTop, cX + cWidth, cYTop], stroke: '#475569', strokeWidth: 3 }));
                    group.add(new Konva.Line({ points: [cX, cYBot, cX + cWidth, cYBot], stroke: '#475569', strokeWidth: 3 }));
                    if (oBot === casing.bottom) {
                        group.add(new Konva.Line({ points: [cX + cWidth, cYTop - 2, cX + cWidth, cYBot + 2], stroke: '#475569', strokeWidth: 4 }));
                    }
                }
            });
        }

        let visualComponent;

        if (comp.type === "Screen") {
            const screenGroup = new Konva.Group();
            const blankW = width * 0.21;
            const jacketW = width * 0.42;
            const jacketX = blankW;
            const rightW = width * 0.37;
            const rightX = jacketX + jacketW;

            drawPipe(screenGroup, 0, blankW, height);
            screenGroup.add(new Konva.Rect({ x: blankW - 3, y: 0, width: 3, height: height, fill: '#374151' }));

            screenGroup.add(new Konva.Shape({
                x: jacketX, y: 0, width: jacketW, height: height, listening: false,
                sceneFunc: function (ctx) {
                    const n = ctx._context;
                    const g = cylGrad(n, height, [
                        [0.00, '#555f66'], [0.10, '#707a82'], [0.22, '#9ea8b0'],
                        [0.34, '#7a8490'], [0.46, '#555f68'], [0.56, '#434c54'],
                        [0.66, '#5a6268'], [0.78, '#3e4650'], [0.90, '#555f68'],
                        [1.00, '#727c84'],
                    ]);
                    n.beginPath(); n.rect(0, 0, jacketW, height);
                    n.fillStyle = g; n.fill();
                }
            }));

            const holesGroup = new Konva.Group({
                clipFunc: function (ctx) { ctx.rect(jacketX, 0, jacketW, height); }
            });
            holesGroup.add(new Konva.Shape({
                x: 0, y: 0, listening: false,
                sceneFunc: function (ctx) {
                    const n = ctx._context;
                    const slant = 0.65;
                    const stripeSpacing = Math.max(6, height * 0.28);
                    const stripeLineW = 1.2;
                    const r = Math.max(0.8, height * 0.016);
                    const gapX = r * 0.45;
                    const gapY = r * 0.40;
                    const colW = r * 2 + gapX;
                    const rowH = r * 2 + gapY;
                    const cols = Math.ceil(jacketW / colW) + 2;
                    const rows = Math.ceil(height / rowH) + 2;
                    const exclusionHalf = stripeLineW / 2 + r * 1.4;

                    for (let row = -1; row < rows; row++) {
                        const offsetX = (row % 2 === 0) ? 0 : colW * 0.5;
                        for (let col = -1; col < cols; col++) {
                            const cx = jacketX + col * colW + offsetX + r;
                            const cy = row * rowH + r;
                            const p = (cx - jacketX) - slant * cy;
                            const modP = ((p % stripeSpacing) + stripeSpacing) % stripeSpacing;
                            if (modP < exclusionHalf || modP > stripeSpacing - exclusionHalf) continue;

                            n.beginPath(); n.arc(cx, cy, r, 0, Math.PI * 2);
                            n.fillStyle = 'rgba(10,10,10,0.92)'; n.fill();
                            n.beginPath(); n.arc(cx, cy, r, Math.PI * 1.15, Math.PI * 1.85);
                            n.strokeStyle = 'rgba(200,210,220,0.40)';
                            n.lineWidth = Math.max(0.3, r * 0.20); n.stroke();
                        }
                    }

                    const stripeCount = Math.ceil(jacketW / stripeSpacing) + 6;
                    for (let i = -3; i < stripeCount; i++) {
                        const x0 = jacketX + i * stripeSpacing;
                        n.beginPath(); n.moveTo(x0, 0); n.lineTo(x0 + height * slant, height);
                        n.strokeStyle = 'rgba(10,14,20,0.75)'; n.lineWidth = stripeLineW; n.stroke();
                        n.beginPath(); n.moveTo(x0 + 1.0, 0); n.lineTo(x0 + height * slant + 1.0, height);
                        n.strokeStyle = 'rgba(255,255,255,0.15)'; n.lineWidth = 0.5; n.stroke();
                    }
                }
            }));
            screenGroup.add(holesGroup);

            screenGroup.add(new Konva.Rect({ x: jacketX, y: 0, width: 2, height: height, fill: '#2d3748' }));
            screenGroup.add(new Konva.Rect({ x: rightX - 2, y: 0, width: 2, height: height, fill: '#2d3748' }));
            drawPipe(screenGroup, rightX, rightW, height);
            screenGroup.add(new Konva.Rect({ x: rightX, y: 0, width: 3, height: height, fill: '#374151' }));
            screenGroup.add(new Konva.Rect({ x: 0, y: 0, width: width, height: height, stroke: PIPE_STROKE, strokeWidth: 1.5, fill: 'transparent' }));
            screenGroup.cache({ pixelRatio: 2 });
            visualComponent = screenGroup;
        }
        else if (comp.type === "Blank Pipe") {
            const bpGroup = new Konva.Group();
            drawPipe(bpGroup, 0, width, height);
            bpGroup.add(new Konva.Rect({ x: 0, y: 0, width: width, height: height, stroke: PIPE_STROKE, strokeWidth: 1.5, fill: 'transparent' }));
            bpGroup.cache({ pixelRatio: 2 });
            visualComponent = bpGroup;
        }
        else if (comp.type === "Swell Packer") {
            const spGroup = new Konva.Group();
            const centerYP = height / 2;
            const leftPxW = 2.5 * PIXELS_PER_METER;
            const rightPxW = 1.5 * PIXELS_PER_METER;
            const elemPxW = Math.max(10, width - leftPxW - rightPxW);
            const leftPxX = 0;
            const elemPxX = leftPxW;
            const rightPxX = leftPxW + elemPxW;
            const ringW = Math.min(12, elemPxW * 0.08);

            let holeID = 12;
            openHoleData.forEach(hole => {
                if (currentMD >= hole.top && currentMD <= hole.bottom) holeID = hole.size;
            });
            const elemH = holeID * PIXELS_PER_INCH;
            const elemTop = centerYP - elemH / 2;
            const elemBot = centerYP + elemH / 2;
            const pipeH = height;

            drawPipe(spGroup, leftPxX, leftPxW, pipeH);
            spGroup.add(new Konva.Rect({ x: leftPxX, y: 0, width: leftPxW, height: pipeH, stroke: PIPE_STROKE, strokeWidth: 1, fill: 'transparent' }));

            spGroup.add(new Konva.Shape({
                x: 0, y: 0, listening: false,
                sceneFunc: function (ctx) {
                    const n = ctx._context;
                    const cpX = elemPxX + elemPxW * 0.08;
                    const cpX2 = elemPxX + elemPxW * 0.92;
                    const bulge = elemH * 0.04;

                    n.beginPath();
                    n.moveTo(elemPxX, elemTop + bulge);
                    n.bezierCurveTo(cpX, elemTop - bulge, cpX2, elemTop - bulge, elemPxX + elemPxW, elemTop + bulge);
                    n.lineTo(elemPxX + elemPxW, elemBot - bulge);
                    n.bezierCurveTo(cpX2, elemBot + bulge, cpX, elemBot + bulge, elemPxX, elemBot - bulge);
                    n.closePath();

                    const grad = n.createLinearGradient(0, elemTop, 0, elemBot);
                    grad.addColorStop(0.00, '#2a2a2a'); grad.addColorStop(0.18, '#4a4a4a');
                    grad.addColorStop(0.30, '#5c5c5c'); grad.addColorStop(0.45, '#3a3a3a');
                    grad.addColorStop(0.55, '#222222'); grad.addColorStop(0.70, '#333333');
                    grad.addColorStop(0.85, '#1a1a1a'); grad.addColorStop(1.00, '#111111');
                    n.fillStyle = grad; n.fill();

                    n.beginPath();
                    n.moveTo(elemPxX + ringW + 4, elemTop + elemH * 0.20);
                    n.lineTo(elemPxX + elemPxW - ringW - 4, elemTop + elemH * 0.20);
                    n.strokeStyle = 'rgba(255,255,255,0.08)';
                    n.lineWidth = Math.max(1, elemH * 0.06); n.stroke();

                    n.beginPath();
                    n.moveTo(elemPxX, elemTop + bulge);
                    n.bezierCurveTo(cpX, elemTop - bulge, cpX2, elemTop - bulge, elemPxX + elemPxW, elemTop + bulge);
                    n.lineTo(elemPxX + elemPxW, elemBot - bulge);
                    n.bezierCurveTo(cpX2, elemBot + bulge, cpX, elemBot + bulge, elemPxX, elemBot - bulge);
                    n.closePath();
                    n.strokeStyle = '#0d0d0d'; n.lineWidth = 1.2; n.stroke();
                }
            }));

            function drawRing(grp, rx, rw, rh, cy2) {
                grp.add(new Konva.Shape({
                    x: rx, y: cy2 - rh / 2, width: rw, height: rh, listening: false,
                    sceneFunc: function (ctx) {
                        const n = ctx._context;
                        const grad = n.createLinearGradient(0, 0, 0, rh);
                        grad.addColorStop(0.00, '#6b7280'); grad.addColorStop(0.20, '#9ca3af');
                        grad.addColorStop(0.38, '#d1d5db'); grad.addColorStop(0.55, '#6b7280');
                        grad.addColorStop(0.75, '#4b5563'); grad.addColorStop(1.00, '#374151');
                        n.beginPath(); n.rect(0, 0, rw, rh);
                        n.fillStyle = grad; n.fill();
                        n.strokeStyle = '#1f2937'; n.lineWidth = 1; n.stroke();
                    }
                }));
            }
            drawRing(spGroup, elemPxX, ringW, pipeH, centerYP);
            drawRing(spGroup, elemPxX + elemPxW - ringW, ringW, pipeH, centerYP);

            drawPipe(spGroup, rightPxX, rightPxW, pipeH);
            spGroup.add(new Konva.Rect({ x: rightPxX, y: 0, width: rightPxW, height: pipeH, stroke: PIPE_STROKE, strokeWidth: 1, fill: 'transparent' }));

            const cacheOverflow = elemH / 2 - pipeH / 2 + 4;
            spGroup.cache({ x: 0, y: -cacheOverflow, width: width, height: pipeH + cacheOverflow * 2, pixelRatio: 2 });
            visualComponent = spGroup;
        }
        else if (comp.type === "Cross Over") {
            const xoGroup = new Konva.Group();
            const halfW = width / 2;
            const h = height;
            xoGroup.add(new Konva.Shape({
                x: 0, y: 0, width: width, height: h, listening: false,
                sceneFunc: function (ctx) {
                    const n = ctx._context;
                    const g = cylGrad(n, h, [
                        [0, '#6b7280'], [0.2, '#9ca3af'], [0.4, '#d1d5db'],
                        [0.55, '#9ca3af'], [0.75, '#6b7280'], [1, '#4b5563']
                    ]);
                    n.beginPath();
                    n.moveTo(0, 0);
                    n.lineTo(halfW, h * 0.15);
                    n.lineTo(width, 0);
                    n.lineTo(width, h);
                    n.lineTo(halfW, h * 0.85);
                    n.lineTo(0, h);
                    n.closePath();
                    n.fillStyle = g; n.fill();
                    n.strokeStyle = PIPE_STROKE; n.lineWidth = 1.2; n.stroke();
                }
            }));
            xoGroup.cache({ pixelRatio: 2 });
            visualComponent = xoGroup;
        }
        else if (comp.type === "Bull Nose") {
            const bnGroup = new Konva.Group();
            const bodyW = width * 0.7;
            const noseW = width * 0.3;
            drawPipe(bnGroup, 0, bodyW, height);
            bnGroup.add(new Konva.Shape({
                x: bodyW, y: 0, width: noseW, height: height, listening: false,
                sceneFunc: function (ctx) {
                    const n = ctx._context;
                    n.beginPath();
                    n.moveTo(0, 0);
                    n.lineTo(noseW * 0.6, height * 0.15);
                    n.quadraticCurveTo(noseW, height * 0.5, noseW * 0.6, height * 0.85);
                    n.lineTo(0, height);
                    n.closePath();
                    const g = cylGrad(n, height, [
                        [0, '#78909c'], [0.3, '#b0bec5'], [0.5, '#90a4ae'],
                        [0.7, '#607d8b'], [1, '#546e7a']
                    ]);
                    n.fillStyle = g; n.fill();
                    n.strokeStyle = PIPE_STROKE; n.lineWidth = 1.2; n.stroke();
                }
            }));
            bnGroup.add(new Konva.Rect({ x: 0, y: 0, width: bodyW, height: height, stroke: PIPE_STROKE, strokeWidth: 1.5, fill: 'transparent' }));
            bnGroup.cache({ pixelRatio: 2 });
            visualComponent = bnGroup;
        }
        else if (comp.type === "ME Plug") {
            visualComponent = new Konva.Image({ width: width, height: height, image: loadedImages.plugImage });
        }
        else if (comp.type === "SPM") {
            // Side Pocket Mandrel — pipe with an oval pocket bulge on one side
            const spmGroup = new Konva.Group();
            drawPipe(spmGroup, 0, width, height);
            const pocketW = Math.min(width * 0.4, 60);
            const pocketH = height * 0.35;
            const pocketX = (width - pocketW) / 2;
            const pocketY = -pocketH * 0.6;
            spmGroup.add(new Konva.Shape({
                x: pocketX, y: pocketY, width: pocketW, height: pocketH, listening: false,
                sceneFunc: function (ctx) {
                    const n = ctx._context;
                    const rx = pocketW / 2, ry = pocketH / 2;
                    n.beginPath();
                    n.ellipse(rx, ry, rx, ry, 0, 0, Math.PI * 2);
                    const grad = n.createLinearGradient(0, 0, 0, pocketH);
                    grad.addColorStop(0, '#4a5568'); grad.addColorStop(0.4, '#718096');
                    grad.addColorStop(0.6, '#2d3748'); grad.addColorStop(1, '#1a202c');
                    n.fillStyle = grad; n.fill();
                    n.strokeStyle = '#1a202c'; n.lineWidth = 1.2; n.stroke();
                    // Inner pocket circle
                    n.beginPath();
                    n.ellipse(rx, ry, rx * 0.5, ry * 0.5, 0, 0, Math.PI * 2);
                    n.fillStyle = '#0f1218'; n.fill();
                }
            }));
            spmGroup.add(new Konva.Rect({ x: 0, y: 0, width: width, height: height, stroke: PIPE_STROKE, strokeWidth: 1.5, fill: 'transparent' }));
            spmGroup.cache({ x: 0, y: pocketY - 2, width: width, height: height - pocketY + 4, pixelRatio: 2 });
            visualComponent = spmGroup;
        }
        else if (comp.type === "Safety Valve") {
            // TRSCSSV — darker pipe with two diagonal slashes indicating valve mechanism
            const svGroup = new Konva.Group();
            svGroup.add(new Konva.Shape({
                x: 0, y: 0, width: width, height: height, listening: false,
                sceneFunc: function (ctx) {
                    const n = ctx._context;
                    const g = cylGrad(n, height, [
                        [0.00, '#5c1a1a'], [0.15, '#8b3030'], [0.30, '#a04040'],
                        [0.45, '#7a2828'], [0.55, '#5a1818'], [0.70, '#6b2222'],
                        [0.85, '#4a1212'], [1.00, '#3a0e0e'],
                    ]);
                    n.beginPath(); n.rect(0, 0, width, height);
                    n.fillStyle = g; n.fill();
                    // Valve symbol: two diagonal lines
                    const cx = width / 2;
                    const symbolW = Math.min(width * 0.3, 30);
                    n.beginPath();
                    n.moveTo(cx - symbolW / 2, 0);
                    n.lineTo(cx + symbolW / 2, height);
                    n.strokeStyle = 'rgba(255,200,200,0.5)'; n.lineWidth = 2; n.stroke();
                    n.beginPath();
                    n.moveTo(cx + symbolW / 2, 0);
                    n.lineTo(cx - symbolW / 2, height);
                    n.strokeStyle = 'rgba(255,200,200,0.5)'; n.lineWidth = 2; n.stroke();
                    // Border
                    n.strokeStyle = '#2a0808'; n.lineWidth = 1.5;
                    n.strokeRect(0, 0, width, height);
                }
            }));
            svGroup.cache({ pixelRatio: 2 });
            visualComponent = svGroup;
        }
        else if (comp.type === "Gauge") {
            // Gauge Mandrel — pipe with a sensor diamond symbol
            const gaugeGroup = new Konva.Group();
            drawPipe(gaugeGroup, 0, width, height);
            const dSize = Math.min(height * 0.6, width * 0.3, 20);
            const cx = width / 2, cy = height / 2;
            gaugeGroup.add(new Konva.Shape({
                x: 0, y: 0, listening: false,
                sceneFunc: function (ctx) {
                    const n = ctx._context;
                    // Diamond
                    n.beginPath();
                    n.moveTo(cx, cy - dSize); n.lineTo(cx + dSize, cy);
                    n.lineTo(cx, cy + dSize); n.lineTo(cx - dSize, cy);
                    n.closePath();
                    n.fillStyle = '#0d9488'; n.fill();
                    n.strokeStyle = '#065f56'; n.lineWidth = 1.2; n.stroke();
                    // Inner dot
                    n.beginPath(); n.arc(cx, cy, dSize * 0.25, 0, Math.PI * 2);
                    n.fillStyle = '#ccfbf1'; n.fill();
                }
            }));
            gaugeGroup.add(new Konva.Rect({ x: 0, y: 0, width: width, height: height, stroke: PIPE_STROKE, strokeWidth: 1.5, fill: 'transparent' }));
            gaugeGroup.cache({ pixelRatio: 2 });
            visualComponent = gaugeGroup;
        }
        else if (comp.type === "Fishbone") {
            // Fishbone — pipe with angled barb lines
            const fbGroup = new Konva.Group();
            drawPipe(fbGroup, 0, width, height);
            fbGroup.add(new Konva.Shape({
                x: 0, y: 0, listening: false,
                sceneFunc: function (ctx) {
                    const n = ctx._context;
                    const barbSpacing = Math.max(12, height * 0.5);
                    const barbLen = height * 0.6;
                    const nBarbs = Math.floor(width / barbSpacing);
                    n.strokeStyle = '#059669'; n.lineWidth = 1.5;
                    for (let i = 1; i <= nBarbs; i++) {
                        const bx = i * barbSpacing;
                        // Top barbs
                        n.beginPath();
                        n.moveTo(bx, height * 0.15);
                        n.lineTo(bx - barbLen * 0.4, -barbLen * 0.4);
                        n.stroke();
                        // Bottom barbs
                        n.beginPath();
                        n.moveTo(bx, height * 0.85);
                        n.lineTo(bx - barbLen * 0.4, height + barbLen * 0.4);
                        n.stroke();
                    }
                }
            }));
            fbGroup.add(new Konva.Rect({ x: 0, y: 0, width: width, height: height, stroke: '#065f46', strokeWidth: 1.5, fill: 'transparent' }));
            const barbOverflow = height * 0.6 * 0.4 + 4;
            fbGroup.cache({ x: -barbOverflow, y: -barbOverflow, width: width + barbOverflow * 2, height: height + barbOverflow * 2, pixelRatio: 2 });
            visualComponent = fbGroup;
        }
        else if (comp.type === "ICV") {
            // Interval Control Valve — pipe with a valve gate symbol
            const icvGroup = new Konva.Group();
            drawPipe(icvGroup, 0, width, height);
            const gateW = Math.min(width * 0.4, 30);
            const cx2 = width / 2;
            icvGroup.add(new Konva.Shape({
                x: 0, y: 0, listening: false,
                sceneFunc: function (ctx) {
                    const n = ctx._context;
                    // Top triangle (valve gate)
                    n.beginPath();
                    n.moveTo(cx2 - gateW / 2, 0);
                    n.lineTo(cx2, height / 2);
                    n.lineTo(cx2 + gateW / 2, 0);
                    n.closePath();
                    n.fillStyle = 'rgba(59,130,246,0.7)'; n.fill();
                    n.strokeStyle = '#1e40af'; n.lineWidth = 1; n.stroke();
                    // Bottom triangle
                    n.beginPath();
                    n.moveTo(cx2 - gateW / 2, height);
                    n.lineTo(cx2, height / 2);
                    n.lineTo(cx2 + gateW / 2, height);
                    n.closePath();
                    n.fillStyle = 'rgba(59,130,246,0.7)'; n.fill();
                    n.strokeStyle = '#1e40af'; n.lineWidth = 1; n.stroke();
                }
            }));
            icvGroup.add(new Konva.Rect({ x: 0, y: 0, width: width, height: height, stroke: PIPE_STROKE, strokeWidth: 1.5, fill: 'transparent' }));
            icvGroup.cache({ pixelRatio: 2 });
            visualComponent = icvGroup;
        }
        else {
            // Fallback: render as blank pipe
            const fbGroup = new Konva.Group();
            drawPipe(fbGroup, 0, width, height);
            fbGroup.add(new Konva.Rect({ x: 0, y: 0, width: width, height: height, stroke: PIPE_STROKE, strokeWidth: 1.5, fill: 'transparent' }));
            fbGroup.cache({ pixelRatio: 2 });
            visualComponent = fbGroup;
        }

        if (showID) visualComponent.opacity(0.4);
        group.add(visualComponent);

        if (showID && comp.id_inch > 0) {
            const idHeight = comp.id_inch * PIXELS_PER_INCH;
            group.add(new Konva.Rect({
                x: 0, y: (height / 2) - (idHeight / 2),
                width: width, height: idHeight, fill: '#0ea5e9', opacity: 0.8
            }));
        }

        const thisTopMD = currentMD;
        const thisCompIndex = wellData.indexOf(comp);
        group.on('mouseenter', () => { document.body.style.cursor = 'pointer'; });
        group.on('mouseleave', () => { document.body.style.cursor = 'default'; });
        group.on('click tap', (evt) => {
            evt.cancelBubble = true;
            const botMD = thisTopMD + comp.length_m;
            showOverlay(evt, {
                type: comp.type,
                description: comp._csd?.description || '',
                topMD: thisTopMD.toFixed(2),
                botMD: botMD.toFixed(2),
                len: comp.length_m.toFixed(2),
                od: comp.od_inch.toFixed(3),
                id: comp.id_inch.toFixed(3)
            });
        });
        group.on('contextmenu', (evt) => {
            evt.evt.preventDefault();
            evt.cancelBubble = true;
            hideOverlay();
            showContextMenu(evt.evt.clientX, evt.evt.clientY, thisCompIndex);
        });

        if (showNames || showLengths) {
            let labelText = '';
            const shortName = comp.type;
            if (showNames && showLengths) labelText = shortName + ' (' + comp.length_m + 'm)';
            else if (showNames) labelText = shortName;
            else if (showLengths) labelText = comp.length_m + 'm';

            if (labelText !== '') {
                // Root the leader above any open hole lines that overlap this element
                let leaderStartY = -2;
                if (showHole) {
                    openHoleData.forEach(hole => {
                        const lTop = Math.max(currentMD, hole.top);
                        const lBot = Math.min(currentMD + comp.length_m, hole.bottom);
                        if (lTop < lBot) {
                            const lHH = hole.size * PIXELS_PER_INCH;
                            const lHYTop = (height / 2) - (lHH / 2);
                            leaderStartY = Math.min(leaderStartY, lHYTop - 2);
                        }
                    });
                }

                const calloutGrp = new Konva.Group({ name: 'comp-label-group', listening: false });
                calloutGrp.setAttr('leaderStartY', leaderStartY);
                if (canvasAngle > 90 || canvasAngle < -90) calloutGrp.rotation(180);

                // Leader line — endpoints updated by updateLabelScale
                calloutGrp.add(new Konva.Line({
                    points: [width / 2, leaderStartY, width / 2, -40],
                    stroke: canvasTextColor,
                    strokeWidth: 0.8,
                    opacity: 0.35,
                    name: 'comp-leader',
                    listening: false
                }));

                // Label text — size and position updated by updateLabelScale
                calloutGrp.add(new Konva.Text({
                    x: 0, y: -60,
                    text: labelText,
                    fontSize: 11,
                    fill: canvasTextColor,
                    width: Math.max(width, 100),
                    align: 'center',
                    fontStyle: 'bold',
                    name: 'comp-label',
                    listening: false,
                    elementWidth: width
                }));

                group.add(calloutGrp);
            }
        }

        layer.add(group);

        currentX += width * Math.cos(canvasAngle * Math.PI / 180);
        currentY += width * Math.sin(canvasAngle * Math.PI / 180);
        maxPipeY = Math.max(maxPipeY, currentY);
        currentMD += comp.length_m;
        prevWidth = width;
        prevCanvasAngle = canvasAngle;
    });

    // Ruler
    let maxRadPixels = 40;
    if (showHole && openHoleData.length > 0) maxRadPixels = Math.max(maxRadPixels, ...openHoleData.map(h => (h.size * PIXELS_PER_INCH) / 2));
    if (showCasing && casingData.length > 0) maxRadPixels = Math.max(maxRadPixels, ...casingData.map(c => (c.size * PIXELS_PER_INCH) / 2));

    const rulerY = maxPipeY + maxRadPixels + PIPE_CLEARANCE_PX;
    const totalLengthM = currentMD - startMD;
    let pX = INITIAL_X, pY = CENTER_Y;
    const showRuler = document.getElementById("show-ruler")?.checked;

    if (showRuler) {
        let _lastRulerLabelX = null;
        for (let m = 0; m <= totalLengthM; m += 1) {
            const cmd = startMD + m;
            let devAngle = 90;
            if (trueTraj && currentTrajectory.length > 0) {
                const tData = getTrajectoryData(cmd, currentTrajectory);
                if (tData) devAngle = tData.dev;
            }
            const cAngleRad = trueTraj ? (90 - devAngle) * Math.PI / 180 : 0;
            const isMajorTick = (m % 5 === 0);

            if (isMajorTick || !trueTraj) {
                const tickLen = isMajorTick ? 12 : 6;
                layer.add(new Konva.Line({ points: [pX, rulerY, pX, rulerY + tickLen], stroke: canvasTextColor, strokeWidth: isMajorTick ? 2 : 1 }));

                if (isMajorTick) {
                    if (showDropLines) layer.add(new Konva.Line({ points: [pX, pY, pX, rulerY], stroke: isDarkCanvas ? '#475569' : '#cbd5e1', strokeWidth: 1, dash: [4, 4] }));
                    // Skip label if too close to previous one (min 60px gap)
                    if (!_lastRulerLabelX || (pX - _lastRulerLabelX) >= 60) {
                        _lastRulerLabelX = pX;
                        let labelText = 'MD: ' + cmd + 'm';
                        if (currentTrajectory.length > 0) {
                            const trajData = getTrajectoryData(cmd, currentTrajectory);
                            if (trajData) {
                                if (showTVD) labelText += '\nTVD: ' + trajData.tvd.toFixed(1) + 'm';
                                if (showDev) labelText += '\nInc: ' + trajData.dev.toFixed(1) + '\u00B0';
                            }
                        }
                        layer.add(new Konva.Text({ x: pX - 40, y: rulerY + 15, text: labelText, fontSize: 10, fontFamily: 'monospace', fill: canvasTextColor, width: 80, align: 'center', lineHeight: 1.3 }));
                    }
                }
            }
            pX += PIXELS_PER_METER * Math.cos(cAngleRad);
            pY += PIXELS_PER_METER * Math.sin(cAngleRad);
        }
        layer.add(new Konva.Line({ points: [INITIAL_X, rulerY, pX, rulerY], stroke: canvasTextColor, strokeWidth: 2 }));
    }

    // Log tracks
    const showLogs = document.getElementById("show-logs")?.checked;
    window.logTrackMeta = [];
    if (showLogs && logsData && logsData.length > 0) {
        const PIPE_CLEAR = maxRadPixels + PIPE_CLEARANCE_PX;

        logsData.forEach((log, logIdx) => {
            if (!log.data || log.data.length < 2) return;
            const pal = LOG_PALETTE[logIdx % LOG_PALETTE.length];
            const trackNear = PIPE_CLEAR + logIdx * (LOG_TRACK_HEIGHT + LOG_TRACK_GAP);
            const trackFar = trackNear + LOG_TRACK_HEIGHT;

            const logMDstart = log.data[0].md;
            const logMDend = log.data[log.data.length - 1].md;

            let wx = INITIAL_X, wy = CENTER_Y;
            const fwdPts = [], nearPts = [], farPts = [], stepMeta = [];

            const steps = Math.round((currentMD - startMD) / LOG_WALK_STEP);
            for (let s = 0; s <= steps; s++) {
                const md = startMD + s * LOG_WALK_STEP;
                let devAngle = 90;
                if (trueTraj && currentTrajectory.length > 0) {
                    const td = getTrajectoryData(md, currentTrajectory);
                    if (td) devAngle = td.dev;
                }
                const rad = trueTraj ? (90 - devAngle) * Math.PI / 180 : 0;
                const perpX = -Math.sin(rad);
                const perpY = Math.cos(rad);

                if (md >= logMDstart && md <= logMDend) {
                    const nX = wx + perpX * trackNear, nY = wy + perpY * trackNear;
                    const fX = wx + perpX * trackFar, fY = wy + perpY * trackFar;
                    nearPts.push(nX, nY);
                    farPts.push(fX, fY);

                    const val = interpLogValue(log, md);
                    const norm = Math.max(0, Math.min(1, (val - log.min) / (log.max - log.min || 1)));
                    const flippedNorm = 1 - norm;
                    fwdPts.push(nX + perpX * flippedNorm * LOG_TRACK_HEIGHT, nY + perpY * flippedNorm * LOG_TRACK_HEIGHT);
                    stepMeta.push({ md, wx, wy, perpX, perpY, trackNear, trackFar });
                }

                wx += PIXELS_PER_METER * LOG_WALK_STEP * Math.cos(rad);
                wy += PIXELS_PER_METER * LOG_WALK_STEP * Math.sin(rad);
            }

            if (fwdPts.length < 4) return;
            window.logTrackMeta.push({ logIdx, stepMeta, TRACK_H: LOG_TRACK_HEIGHT, trackNear, trackFar, pal });

            layer.add(new Konva.Line({ points: nearPts, stroke: pal.stroke, strokeWidth: 0.6, opacity: 0.7 }));
            layer.add(new Konva.Line({ points: farPts, stroke: pal.stroke, strokeWidth: 0.6, opacity: 0.4 }));

            layer.add(new Konva.Shape({
                sceneFunc: function (ctx) {
                    ctx.beginPath();
                    for (let i = 0; i < fwdPts.length; i += 2) {
                        if (i === 0) ctx.moveTo(fwdPts[i], fwdPts[i + 1]);
                        else ctx.lineTo(fwdPts[i], fwdPts[i + 1]);
                    }
                    for (let i = farPts.length - 2; i >= 0; i -= 2) {
                        ctx.lineTo(farPts[i], farPts[i + 1]);
                    }
                    ctx.closePath();
                    ctx.fillStyle = pal.fill;
                    ctx.fill();
                }
            }));

            layer.add(new Konva.Line({ points: fwdPts, stroke: pal.stroke, strokeWidth: 1.5, lineJoin: 'round', lineCap: 'round' }));
        });
    }

    layer.draw();

    if (window.isFirstRender !== false) {
        window.isFirstRender = false;
        const saved = _loadSavedView();
        if (saved) {
            stage.scale({ x: saved.scale, y: saved.scale });
            stage.position({ x: saved.x, y: saved.y });
        } else {
            zoomToFit(true);
            return; // zoomToFit calls drawDynamicAxes etc.
        }
    }

    drawDynamicAxes();
    updateLabelScale();
    updateMinimap();
}

// ═══════════════════════════════════════════════════════
//  OVERLAY
// ═══════════════════════════════════════════════════════
function showOverlay(evt, data) {
    const overlay = document.getElementById('component-overlay');
    document.getElementById('overlay-title').textContent = data.type;
    const descRow = document.getElementById('overlay-desc-row');
    const descEl = document.getElementById('overlay-desc');
    if (data.description) {
        descEl.textContent = data.description;
        descRow.style.display = '';
    } else {
        descRow.style.display = 'none';
    }
    document.getElementById('overlay-top').textContent = data.topMD + " m";
    document.getElementById('overlay-bot').textContent = data.botMD + " m";
    document.getElementById('overlay-len').textContent = data.len + " m";
    document.getElementById('overlay-od').textContent = data.od + " in";
    document.getElementById('overlay-id').textContent = data.id + " in";

    overlay.style.display = 'block';
    let x = evt.evt.clientX + 15;
    let y = evt.evt.clientY + 15;
    const w = overlay.offsetWidth;
    const h = overlay.offsetHeight;
    if (x + w > window.innerWidth) x = window.innerWidth - w - 10;
    if (y + h > window.innerHeight) y = window.innerHeight - h - 10;
    overlay.style.left = x + 'px';
    overlay.style.top = y + 'px';
}

function hideOverlay() {
    document.getElementById('component-overlay').style.display = 'none';
}

// ═══════════════════════════════════════════════════════
//  LOG INTERPOLATION & TOOLTIP
// ═══════════════════════════════════════════════════════
function interpLogValue(log, md) {
    const pts = log.data;
    if (!pts || pts.length < 2) return log.min;
    if (md <= pts[0].md) return pts[0].val;
    if (md >= pts[pts.length - 1].md) return pts[pts.length - 1].val;
    // Binary search
    let lo = 0, hi = pts.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (pts[mid].md <= md) lo = mid;
        else hi = mid;
    }
    const dMD = pts[hi].md - pts[lo].md;
    if (dMD === 0) return pts[lo].val;
    const r = (md - pts[lo].md) / dMD;
    return pts[lo].val + r * (pts[hi].val - pts[lo].val);
}

let _logTooltipBound = false;
function bindLogTooltipEvents() {
    if (_logTooltipBound || !stage) return;
    _logTooltipBound = true;

    const tooltip = document.getElementById('log-tooltip');
    const container = document.getElementById('container');

    container.addEventListener('mousemove', function (e) {
        if (!window.logTrackMeta || window.logTrackMeta.length === 0 || !stage) {
            tooltip.style.display = 'none'; return;
        }
        const scale = stage.scaleX();
        const pos = stage.position();
        const rect = container.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const stageX = (screenX - pos.x) / scale;
        const stageY = (screenY - pos.y) / scale;

        let found = false;
        for (const meta of window.logTrackMeta) {
            const log = logsData[meta.logIdx];
            if (!log || !meta.stepMeta || meta.stepMeta.length === 0) continue;

            let closest = null, closestDist = Infinity;
            for (const pt of meta.stepMeta) {
                const dx = stageX - (pt.wx + pt.perpX * pt.trackNear);
                const dy = stageY - (pt.wy + pt.perpY * pt.trackNear);
                const projAlong = dx * pt.perpX + dy * pt.perpY;
                const projCross = dx * (-pt.perpY) + dy * pt.perpX;

                if (projAlong >= 0 && projAlong <= meta.TRACK_H && Math.abs(projCross) < 20) {
                    if (Math.abs(projCross) < closestDist) {
                        closestDist = Math.abs(projCross);
                        closest = pt;
                    }
                }
            }

            if (closest) {
                const val = interpLogValue(log, closest.md);
                document.getElementById('log-tt-name').textContent = log.name;
                document.getElementById('log-tt-name').style.color = meta.pal.stroke;
                document.getElementById('log-tt-md').textContent = 'MD: ' + closest.md.toFixed(2) + 'm';
                document.getElementById('log-tt-val').textContent = val.toFixed(2);
                tooltip.style.display = 'block';
                tooltip.style.left = (e.clientX + 14) + 'px';
                tooltip.style.top = (e.clientY - 30) + 'px';
                found = true;
                break;
            }
        }
        if (!found) tooltip.style.display = 'none';
    });

    container.addEventListener('mouseleave', function () {
        tooltip.style.display = 'none';
    });
}

// ═══════════════════════════════════════════════════════
//  VIEW PERSISTENCE
// ═══════════════════════════════════════════════════════
const _VIEW_KEY = 'completionview-viewport';
let _saveViewTimer = null;

function _debouncedSaveView() {
    clearTimeout(_saveViewTimer);
    _saveViewTimer = setTimeout(function() {
        try {
            const pos = stage.position();
            localStorage.setItem(_VIEW_KEY, JSON.stringify({
                scale: stage.scaleX(),
                x: pos.x,
                y: pos.y
            }));
        } catch (_) {}
    }, 2000);
}

function _loadSavedView() {
    try {
        const raw = localStorage.getItem(_VIEW_KEY);
        if (!raw) return null;
        const v = JSON.parse(raw);
        if (typeof v.scale === 'number' && typeof v.x === 'number' && typeof v.y === 'number') return v;
    } catch (_) {}
    return null;
}

// ═══════════════════════════════════════════════════════
//  ZOOM TO FIT
// ═══════════════════════════════════════════════════════
function zoomToFit(silent) {
    if (!stage || typeof Konva === 'undefined') return;
    const bounds = getContentBounds();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;

    const stageW = stage.width();
    const stageH = stage.height();
    const padding = 40;
    const scaleX = (stageW - padding * 2) / bounds.width;
    const scaleY = (stageH - padding * 2) / bounds.height;
    const newScale = Math.min(scaleX, scaleY, 2);

    const newX = padding - bounds.x * newScale + (stageW - padding * 2 - bounds.width * newScale) / 2;
    const newY = padding - bounds.y * newScale + (stageH - padding * 2 - bounds.height * newScale) / 2;

    stage.scale({ x: newScale, y: newScale });
    stage.position({ x: newX, y: newY });
    drawDynamicAxes();
    updateLabelScale();
    updateMinimap();
    _debouncedSaveView();
    if (!silent) showToast('Zoomed to fit', 'info');
}

/** Returns content bounding box in world space (scale=1, pos=0,0) — correct for fit/export */
function getWorldContentBounds() {
    return getContentBounds();
}

// ═══════════════════════════════════════════════════════
//  MINI-MAP
// ═══════════════════════════════════════════════════════
let _minimapRAF = null;

function updateMinimap() {
    if (_minimapRAF) cancelAnimationFrame(_minimapRAF);
    _minimapRAF = requestAnimationFrame(_renderMinimap);
}

function _renderMinimap() {
    _minimapRAF = null;
    const mapEl = document.getElementById('minimap');
    const canvas = document.getElementById('minimap-canvas');
    const vpEl = document.getElementById('minimap-viewport');
    if (!mapEl || !canvas || !vpEl || !stage || !layer) return;

    const bounds = getContentBounds();
    if (bounds.width <= 0 || bounds.height <= 0) return;

    const mapW = mapEl.clientWidth;
    const mapH = mapEl.clientHeight;
    canvas.width = mapW * 2;
    canvas.height = mapH * 2;

    const fitScale = Math.min(mapW / bounds.width, mapH / bounds.height) * 0.9;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(2, 2);

    const offX = (mapW - bounds.width * fitScale) / 2;
    const offY = (mapH - bounds.height * fitScale) / 2;
    ctx.translate(offX, offY);
    ctx.scale(fitScale, fitScale);
    ctx.translate(-bounds.x, -bounds.y);

    // Draw simplified content: iterate through layer children (skip bg-rect)
    layer.children.forEach(child => {
        if (child.name && child.name() === 'bg-rect') return;
        const absRect = child.getClientRect();
        if (absRect.width > 0 && absRect.height > 0) {
            ctx.fillStyle = isDarkCanvas ? '#334155' : '#94a3b8';
            ctx.fillRect(absRect.x, absRect.y, absRect.width, absRect.height);
        }
    });
    ctx.restore();

    // Viewport indicator
    const stageScale = stage.scaleX();
    const stagePos = stage.position();
    const vpLeft = (-stagePos.x / stageScale - bounds.x) * fitScale + offX;
    const vpTop = (-stagePos.y / stageScale - bounds.y) * fitScale + offY;
    const vpW = (stage.width() / stageScale) * fitScale;
    const vpH = (stage.height() / stageScale) * fitScale;

    vpEl.style.left = Math.max(0, vpLeft) + 'px';
    vpEl.style.top = Math.max(0, vpTop) + 'px';
    vpEl.style.width = Math.min(vpW, mapW) + 'px';
    vpEl.style.height = Math.min(vpH, mapH) + 'px';
}

function initMinimapClick() {
    const mapEl = document.getElementById('minimap');
    if (!mapEl) return;

    mapEl.addEventListener('click', function (e) {
        if (!stage || !layer) return;
        const rect = mapEl.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        const mapW = mapEl.clientWidth;
        const mapH = mapEl.clientHeight;

        const bounds = getContentBounds();
        if (bounds.width <= 0 || bounds.height <= 0) return;
        const fitScale = Math.min(mapW / bounds.width, mapH / bounds.height) * 0.9;
        const offX = (mapW - bounds.width * fitScale) / 2;
        const offY = (mapH - bounds.height * fitScale) / 2;

        const stageX = (clickX - offX) / fitScale + bounds.x;
        const stageY = (clickY - offY) / fitScale + bounds.y;
        const stageScale = stage.scaleX();

        stage.position({
            x: -stageX * stageScale + stage.width() / 2,
            y: -stageY * stageScale + stage.height() / 2
        });
        drawDynamicAxes();
        updateMinimap();
    });
}

// ═══════════════════════════════════════════════════════
//  EXPORT — content-area cropped
// ═══════════════════════════════════════════════════════
function getContentBounds() {
    // Always measure in world space (scale=1, pos=0,0) for correct results
    const oldPos = stage.position();
    const oldScale = stage.scale();
    stage.position({ x: 0, y: 0 });
    stage.scale({ x: 1, y: 1 });

    const bgRect = layer.findOne('.bg-rect');
    if (bgRect) bgRect.hide();
    const rect = layer.getClientRect({ skipShadow: true });
    if (bgRect) bgRect.show();

    stage.position(oldPos);
    stage.scale(oldScale);

    const pad = 60;
    return {
        x: rect.x - pad,
        y: rect.y - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2
    };
}

function exportPNG() {
    if (typeof Konva === 'undefined') return;
    hideOverlay();

    const oldPos = stage.position();
    const oldScale = stage.scale();
    stage.position({ x: 0, y: 0 });
    stage.scale({ x: 1, y: 1 });

    // Temporarily hide dynamic axes for a clean export
    axesLayer.hide();

    const bounds = getContentBounds();
    const dataURL = stage.toDataURL({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        pixelRatio: 3
    });

    axesLayer.show();
    stage.position(oldPos);
    stage.scale(oldScale);
    drawDynamicAxes();

    const link = document.createElement('a');
    link.download = 'CompletionView_' + new Date().getTime() + '.png';
    link.href = dataURL;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('PNG exported', 'success');
}

function exportSVG() {
    if (typeof Konva === 'undefined') return;
    hideOverlay();

    const oldPos = stage.position();
    const oldScale = stage.scale();
    stage.position({ x: 0, y: 0 });
    stage.scale({ x: 1, y: 1 });
    axesLayer.hide();

    const bounds = getContentBounds();
    const pixelRatio = 3;
    const dataURL = stage.toDataURL({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        pixelRatio: pixelRatio
    });

    axesLayer.show();
    stage.position(oldPos);
    stage.scale(oldScale);
    drawDynamicAxes();

    const svgW = bounds.width;
    const svgH = bounds.height;
    const startMD = parseFloat(document.getElementById("start-md").value) || 0;
    const wellboreName = window._csdMeta?.wellbore || 'Unknown';
    const revision = window._csdMeta?.revision || '';
    const bgColor = isDarkCanvas ? '#0f172a' : '#f8fafc';
    const textColor = isDarkCanvas ? '#94a3b8' : '#334155';
    const headerH = 40;
    const totalH = svgH + headerH;

    // Build vector SVG with metadata header + high-res raster content
    const svgParts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"',
        '  width="' + svgW + '" height="' + totalH + '"',
        '  viewBox="0 0 ' + svgW + ' ' + totalH + '">',
        '  <title>CompletionView — ' + escapeXml(wellboreName) + '</title>',
        '  <desc>Wellbore: ' + escapeXml(wellboreName) + ', Revision: ' + escapeXml(String(revision)) + ', Components: ' + wellData.length + '</desc>',
        '  <rect width="100%" height="100%" fill="' + bgColor + '"/>',
        '',
        '  <!-- Vector header -->',
        '  <rect x="0" y="0" width="' + svgW + '" height="' + headerH + '" fill="' + (isDarkCanvas ? '#1e293b' : '#e2e8f0') + '"/>',
        '  <text x="12" y="26" font-family="sans-serif" font-size="16" font-weight="bold" fill="' + textColor + '">',
        '    CompletionView — ' + escapeXml(wellboreName) + (revision ? ' (Rev ' + escapeXml(String(revision)) + ')' : '') + '',
        '  </text>',
        '  <text x="' + (svgW - 12) + '" y="26" font-family="monospace" font-size="11" fill="' + textColor + '" text-anchor="end">',
        '    ' + wellData.length + ' components · ' + wellData.reduce(function(s, c) { return s + c.length_m; }, 0).toFixed(1) + ' m · Start MD: ' + startMD.toFixed(1) + ' m',
        '  </text>',
        '',
        '  <!-- Raster content -->',
        '  <image x="0" y="' + headerH + '" width="' + svgW + '" height="' + svgH + '"',
        '    href="' + dataURL + '"/>',
        '',
    ];

    // Add vector text annotations for each component along the completion string
    let runMD = startMD;
    wellData.forEach(function(comp, i) {
        const xPx = ((runMD - startMD) * PIXELS_PER_METER + INITIAL_X) - bounds.x;
        const wPx = comp.length_m * PIXELS_PER_METER;
        const yAnnot = totalH - 5;
        svgParts.push('  <text x="' + (xPx + wPx / 2).toFixed(1) + '" y="' + yAnnot + '" font-family="monospace" font-size="7" fill="' + textColor + '" text-anchor="middle" opacity="0.6">' +
            escapeXml(comp.type) + ' ' + comp.length_m + 'm</text>');
        runMD += comp.length_m;
    });

    svgParts.push('</svg>');

    const blob = new Blob([svgParts.join('\n')], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = 'CompletionView_' + (wellboreName.replace(/[^a-zA-Z0-9_-]/g, '_')) + '_' + new Date().getTime() + '.svg';
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('SVG exported', 'success');
}

/** Escape XML special characters */
function escapeXml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// ═══════════════════════════════════════════════════════
//  PDF EXPORT (jsPDF)
// ═══════════════════════════════════════════════════════
function exportPDF() {
    if (typeof Konva === 'undefined') return;
    if (typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined') {
        showToast('PDF library not loaded — check your internet connection', 'error');
        return;
    }
    hideOverlay();

    const oldPos = stage.position();
    const oldScale = stage.scale();
    stage.position({ x: 0, y: 0 });
    stage.scale({ x: 1, y: 1 });
    axesLayer.hide();

    const bounds = getContentBounds();
    const pixelRatio = 3;
    const dataURL = stage.toDataURL({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        pixelRatio: pixelRatio,
        mimeType: 'image/jpeg',
        quality: 0.95
    });

    axesLayer.show();
    stage.position(oldPos);
    stage.scale(oldScale);
    drawDynamicAxes();

    const { jsPDF } = window.jspdf;
    // Determine PDF page size: landscape A3 for wide completions, A4 for shorter
    const aspectRatio = bounds.width / bounds.height;
    const isWide = aspectRatio > 3;
    const pageFormat = isWide ? 'a3' : 'a4';
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: pageFormat });

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 10;
    const headerH = 14;
    const footerH = 8;
    const contentW = pageW - margin * 2;
    const contentH = pageH - margin * 2 - headerH - footerH;

    // Header
    const wellboreName = window._csdMeta?.wellbore || 'Unknown Wellbore';
    const revision = window._csdMeta?.revision || '';
    const revType = window._csdMeta?.revisionType || '';
    const startMD = parseFloat(document.getElementById("start-md").value) || 0;

    doc.setFillColor(30, 41, 59);
    doc.rect(margin, margin, contentW, headerH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.text('CompletionView — ' + wellboreName + (revision ? '  (Rev ' + revision + ')' : ''), margin + 4, margin + 9);

    doc.setFont('courier', 'normal');
    doc.setFontSize(8);
    doc.text(
        wellData.length + ' components · ' +
        wellData.reduce(function(s, c) { return s + c.length_m; }, 0).toFixed(1) + ' m · Start MD: ' + startMD.toFixed(1) + ' m',
        pageW - margin - 4, margin + 9, { align: 'right' }
    );

    // Completion schematic image
    const imgY = margin + headerH + 2;
    const imgAspect = bounds.width / bounds.height;
    let imgW = contentW;
    let imgH = imgW / imgAspect;
    if (imgH > contentH) {
        imgH = contentH;
        imgW = imgH * imgAspect;
    }
    const imgX = margin + (contentW - imgW) / 2;

    doc.addImage(dataURL, 'JPEG', imgX, imgY, imgW, imgH);

    // Footer
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    const footerY = pageH - margin;
    doc.text('Generated by CompletionView 2.0 — ' + new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString(), margin, footerY);
    if (revType) doc.text('Revision Type: ' + revType, pageW - margin, footerY, { align: 'right' });

    // Component summary table on page 2
    if (wellData.length > 0) {
        doc.addPage();
        doc.setFillColor(30, 41, 59);
        doc.rect(margin, margin, contentW, headerH, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(255, 255, 255);
        doc.text('Component Summary — ' + wellboreName, margin + 4, margin + 9);

        const colWidths = [12, 30, 25, 25, 20, 20, contentW - 132];
        const colHeaders = ['#', 'Type', 'Top MD (m)', 'Length (m)', 'OD (in)', 'ID (in)', 'Description'];
        const colX = [margin];
        for (let i = 1; i < colWidths.length; i++) colX.push(colX[i - 1] + colWidths[i - 1]);

        let yRow = margin + headerH + 6;
        const rowH = 5;

        // Table header
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(30, 41, 59);
        doc.setFillColor(226, 232, 240);
        doc.rect(margin, yRow - 3.5, contentW, rowH, 'F');
        colHeaders.forEach(function(h, i) { doc.text(h, colX[i] + 1, yRow); });
        yRow += rowH + 1;

        doc.setFont('courier', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(51, 65, 85);

        let runningMD = startMD;
        wellData.forEach(function(comp, idx) {
            if (yRow > pageH - margin - footerH - 5) {
                doc.addPage();
                yRow = margin + 8;
            }

            // Alternating row background
            if (idx % 2 === 0) {
                doc.setFillColor(248, 250, 252);
                doc.rect(margin, yRow - 3.2, contentW, rowH, 'F');
            }

            const descText = comp._csd?.description || '';
            const truncDesc = descText.length > 80 ? descText.substring(0, 77) + '...' : descText;

            doc.text(String(idx + 1), colX[0] + 1, yRow);
            doc.text(comp.type, colX[1] + 1, yRow);
            doc.text(runningMD.toFixed(2), colX[2] + 1, yRow);
            doc.text(comp.length_m.toFixed(2), colX[3] + 1, yRow);
            doc.text(comp.od_inch.toFixed(3), colX[4] + 1, yRow);
            doc.text(comp.id_inch.toFixed(3), colX[5] + 1, yRow);
            doc.text(truncDesc, colX[6] + 1, yRow);

            runningMD += comp.length_m;
            yRow += rowH;
        });

        // Footer on last page
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.setFont('helvetica', 'normal');
        doc.text('Generated by CompletionView 2.0 — ' + new Date().toLocaleDateString(), margin, pageH - margin);
    }

    doc.save('CompletionView_' + wellboreName.replace(/[^a-zA-Z0-9_-]/g, '_') + '.pdf');
    showToast('PDF exported (' + (wellData.length > 0 ? '2 pages' : '1 page') + ')', 'success');
}
