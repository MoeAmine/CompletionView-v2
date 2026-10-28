/* CompletionView 1.0 — Application Logic */

// ═══════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════
const PIXELS_PER_METER = 30;
const PIXELS_PER_INCH = 10;
const CENTER_Y = 160;
const INITIAL_X = 50;
const PIPE_CLEARANCE_PX = 90;
const LOG_TRACK_HEIGHT = 65;
const LOG_TRACK_GAP = 15;
const LOG_WALK_STEP = 0.5;
const BG_RECT_HALF = 100000;
const TEXT_COLOR = '#334155';
const PIPE_STROKE = '#0f172a';
const MAX_UNDO = 50;
const LOCALSTORAGE_KEY = 'completionview-state';

// ═══════════════════════════════════════════════════════
//  DEBOUNCE / THROTTLE UTILITIES
// ═══════════════════════════════════════════════════════
function _debounce(fn, ms) {
    let timer;
    return function () {
        clearTimeout(timer);
        timer = setTimeout(fn, ms);
    };
}

function _throttle(fn, ms) {
    let last = 0, timer;
    return function () {
        const now = Date.now();
        clearTimeout(timer);
        if (now - last >= ms) { last = now; fn(); }
        else { timer = setTimeout(function () { last = Date.now(); fn(); }, ms - (now - last)); }
    };
}

// Dark canvas mode
let isDarkCanvas = false;

// ═══════════════════════════════════════════════════════
//  DATA SOURCE MODE SWITCHING
// ═══════════════════════════════════════════════════════
function onModeChange() {
    _dataSourceMode = document.getElementById('data-mode').value;
    const isLocal = _dataSourceMode === 'local';

    // Toggle local-only buttons
    document.getElementById('btn-save-local').style.display = isLocal ? '' : 'none';
    document.getElementById('btn-add-well').style.display = isLocal ? '' : 'none';
    document.getElementById('btn-add-wellbore').style.display = isLocal ? '' : 'none';
    document.getElementById('btn-del-well').style.display = isLocal ? '' : 'none';
    document.getElementById('btn-del-wellbore').style.display = isLocal ? '' : 'none';

    // In local mode: revision is always "local"
    document.getElementById('revision-group').style.display = isLocal ? 'none' : '';

    // Reset dropdowns
    document.getElementById('field-select').innerHTML = '<option value="">\u2014 Field \u2014</option><option value="Edvard Grieg">Edvard Grieg</option><option value="Ivar Aasen">Ivar Aasen</option>';
    document.getElementById('well-select').innerHTML = '<option value="">\u2014 Well \u2014</option>';
    document.getElementById('wellbore-select').innerHTML = '<option value="">\u2014 Wellbore \u2014</option>';

    if (isLocal) {
        refreshLocalDropdowns();
    } else {
        if (_wellHierarchy) populateFieldDropdown(_wellHierarchy);
    }
}

/** Refresh field/well/wellbore dropdowns from IndexedDB */
async function refreshLocalDropdowns() {
    try {
        const records = await localDB_getAll();
        const hierarchy = localDB_buildHierarchy(records);
        const fieldSel = document.getElementById('field-select');
        fieldSel.innerHTML = '<option value="">\u2014 Field \u2014</option><option value="Edvard Grieg">Edvard Grieg</option><option value="Ivar Aasen">Ivar Aasen</option>';
        Object.keys(hierarchy).sort().forEach(function (f) {
            if (f === 'Edvard Grieg' || f === 'Ivar Aasen') return; // skip duplicates
            const o = document.createElement('option');
            o.value = f; o.textContent = f;
            fieldSel.appendChild(o);
        });
        window._localHierarchy = hierarchy;
    } catch (e) {
        console.error('IndexedDB error:', e);
        showToast('Could not read local database', 'error');
    }
}

// ═══════════════════════════════════════════════════════
//  FIELD / WELL / WELLBORE SELECTION
// ═══════════════════════════════════════════════════════
function onFieldChange() {
    const field = document.getElementById('field-select').value;
    const wellSel = document.getElementById('well-select');
    const wbSel = document.getElementById('wellbore-select');
    wellSel.innerHTML = '<option value="">\u2014 Well \u2014</option>';
    wbSel.innerHTML = '<option value="">\u2014 Wellbore \u2014</option>';

    const hierarchy = (_dataSourceMode === 'local') ? (window._localHierarchy || {}) : _wellHierarchy;
    if (!hierarchy || !hierarchy[field]) return;

    Object.keys(hierarchy[field]).sort().forEach(well => {
        const o = document.createElement('option');
        o.value = well;
        o.textContent = well;
        wellSel.appendChild(o);
    });
}

function onWellChange() {
    const field = document.getElementById('field-select').value;
    const well = document.getElementById('well-select').value;
    const wbSel = document.getElementById('wellbore-select');
    wbSel.innerHTML = '<option value="">\u2014 Wellbore \u2014</option>';

    const hierarchy = (_dataSourceMode === 'local') ? (window._localHierarchy || {}) : _wellHierarchy;
    if (!hierarchy || !hierarchy[field] || !hierarchy[field][well]) return;

    hierarchy[field][well].sort().forEach(wb => {
        const o = document.createElement('option');
        o.value = wb;
        o.textContent = wb;
        wbSel.appendChild(o);
    });

    if (hierarchy[field][well].length === 1) {
        wbSel.value = hierarchy[field][well][0];
        onWellboreChange();
    }
}

function onWellboreChange() {
    if (_dataSourceMode === 'local') return;

    const well = document.getElementById('well-select').value;
    const wellbore = document.getElementById('wellbore-select').value;
    const revSel = document.getElementById('revision-select');
    revSel.innerHTML = '<option value="">— Rev —</option>';

    if (!well || !wellbore || _excelRows.length === 0) return;

    const revisions = getRevisionsForWellbore(well, wellbore);
    revisions.forEach(rev => {
        const o = document.createElement('option');
        o.value = rev.revision;
        o.textContent = rev.revision;
        revSel.appendChild(o);
    });

    if (revisions.length > 0) {
        revSel.value = revisions[revisions.length - 1].revision;
    }
}

/** Load — dispatches to local DB or Excel based on mode */
function loadSelectedCompletion() {
    if (_dataSourceMode === 'local') { loadLocalWell(); updateWellSelectorLabel(); return; }
    loadSelectedCompletionFromExcel();
    updateWellSelectorLabel();
}

/** Re-run the current wellbore load (used by toggles that change data, e.g. Segmented Screens). */
function reloadCurrentWellbore() {
    if (_dataSourceMode === 'local') {
        onWellboreChange();
    } else {
        loadSelectedCompletionFromExcel();
    }
}

/** Load from CSD Excel (original behavior) */
function loadSelectedCompletionFromExcel() {    const well = document.getElementById('well-select').value;
    const wellbore = document.getElementById('wellbore-select').value || well;
    if (!well) {
        showToast('Select a well first', 'warning');
        return;
    }
    if (_excelRows.length === 0) {
        showToast('Load an Excel file first', 'warning');
        return;
    }

    const mapped = loadCompletionFromExcel(well, wellbore, document.getElementById('revision-select')?.value || '');
    if (!mapped) return;

    pushUndoState();

    // Apply completion scope filter
    const scope = document.getElementById('completion-scope')?.value || 'all';
    if (scope === 'lower') {
        // Lower completion starts from the first packer-type component
        const packerTypes = ['Swell Packer'];
        const packerKeywords = ['packer', 'production packer', 'screen hanger packer', 'screen packer'];
        let startIdx = -1;
        for (let i = 0; i < mapped.wellData.length; i++) {
            const comp = mapped.wellData[i];
            const desc = (comp._csd?.description || '').toLowerCase();
            const isPacker = packerTypes.includes(comp.type) &&
                packerKeywords.some(kw => desc.includes(kw));
            if (isPacker) { startIdx = i; break; }
        }
        if (startIdx >= 0) {
            const trimmedMD = mapped.wellData[startIdx]._csd?.mdTop || mapped.startMD;
            mapped.wellData = mapped.wellData.slice(startIdx);
            mapped.startMD = trimmedMD;
        }
    }

    wellData = mapped.wellData;
    if (mapped.startMD > 0) {
        document.getElementById('start-md').value = mapped.startMD;
    }

    window._csdMeta = mapped.metadata;

    renderWellboreTables();
    renderTable();
    saveToLocalStorage();
    generateVisuals();

    showToast('Loaded ' + mapped.wellData.length + ' components for ' + wellbore, 'success');
}

// ═══════════════════════════════════════════════════════
//  LOCAL WELL CRUD (IndexedDB)
// ═══════════════════════════════════════════════════════

/** Save current app state to local DB under selected field/well/wellbore */
async function saveLocalWell() {
    const field = document.getElementById('field-select').value;
    const well = document.getElementById('well-select').value;
    const wellbore = document.getElementById('wellbore-select').value;
    if (!field || !well || !wellbore) {
        showToast('Select field, well & wellbore first (or create a new well)', 'warning');
        return;
    }
    try {
        await localDB_save(field, well, wellbore, getAppState());
        showToast('Saved ' + well + ' / ' + wellbore + ' to local DB', 'success');
    } catch (e) {
        console.error('Save error:', e);
        showToast('Failed to save: ' + e.message, 'error');
    }
}

/** Load selected well from local DB */
async function loadLocalWell() {
    const field = document.getElementById('field-select').value;
    const well = document.getElementById('well-select').value;
    const wellbore = document.getElementById('wellbore-select').value;
    if (!field || !well || !wellbore) {
        showToast('Select a local well to load', 'warning');
        return;
    }
    try {
        const rec = await localDB_load(field, well, wellbore);
        if (!rec || !rec.state) {
            showToast('No saved data found for ' + well + ' / ' + wellbore, 'warning');
            return;
        }
        pushUndoState();
        setAppState(rec.state);
        saveToLocalStorage();
        showToast('Loaded ' + well + ' / ' + wellbore + ' from local DB', 'success');
    } catch (e) {
        console.error('Load error:', e);
        showToast('Failed to load: ' + e.message, 'error');
    }
}

/** Delete selected local well from IndexedDB */
async function deleteLocalWell() {
    const field = document.getElementById('field-select').value;
    const well = document.getElementById('well-select').value;
    const wellbore = document.getElementById('wellbore-select').value;
    if (!field || !well || !wellbore) {
        showToast('Select a local well to delete', 'warning');
        return;
    }
    if (!confirm('Delete local well "' + well + ' / ' + wellbore + '"? This cannot be undone.')) return;
    try {
        await localDB_delete(field, well, wellbore);
        showToast('Deleted ' + well + ' / ' + wellbore, 'info');
        refreshLocalDropdowns();
    } catch (e) {
        console.error('Delete error:', e);
        showToast('Failed to delete: ' + e.message, 'error');
    }
}

/** Delete a well and ALL its wellbores from IndexedDB */
async function deleteLocalWellAll() {
    const field = document.getElementById('field-select').value;
    const well = document.getElementById('well-select').value;
    if (!field || !well) { showToast('Select a well to delete', 'warning'); return; }
    if (!confirm('Delete well "' + well + '" and ALL its wellbores? This cannot be undone.')) return;
    try {
        const records = await localDB_getAll();
        const toDelete = records.filter(function(r) { return r.field === field && r.well === well; });
        for (var i = 0; i < toDelete.length; i++) {
            await localDB_delete(toDelete[i].field, toDelete[i].well, toDelete[i].wellbore);
        }
        showToast('Deleted well "' + well + '" (' + toDelete.length + ' wellbore' + (toDelete.length !== 1 ? 's' : '') + ')', 'info');
        refreshLocalDropdowns();
    } catch (e) {
        console.error('Delete error:', e);
        showToast('Failed to delete: ' + e.message, 'error');
    }
}

/** Delete only the currently selected wellbore */
async function deleteLocalWellboreSingle() {
    const field = document.getElementById('field-select').value;
    const well = document.getElementById('well-select').value;
    const wellbore = document.getElementById('wellbore-select').value;
    if (!field || !well || !wellbore) { showToast('Select a wellbore to delete', 'warning'); return; }
    if (!confirm('Delete wellbore "' + wellbore + '"? This cannot be undone.')) return;
    try {
        await localDB_delete(field, well, wellbore);
        showToast('Deleted wellbore "' + wellbore + '"', 'info');
        refreshLocalDropdowns();
    } catch (e) {
        console.error('Delete error:', e);
        showToast('Failed to delete: ' + e.message, 'error');
    }
}

/** Prompt user to create a new local well entry */
function promptNewLocalWell() {
    const currentField = document.getElementById('field-select').value;
    const field = currentField || prompt('Field name:', '');
    if (!field) return;
    const well = prompt('Well name:', '');
    if (!well) return;
    const wellbore = prompt('Wellbore name:', well);
    if (!wellbore) return;

    // Set dropdowns to the new values (may not exist yet in hierarchy)
    const fieldSel = document.getElementById('field-select');
    const wellSel = document.getElementById('well-select');
    const wbSel = document.getElementById('wellbore-select');

    // Add options if they don't exist
    if (![...fieldSel.options].some(o => o.value === field)) {
        const o = document.createElement('option'); o.value = field; o.textContent = field;
        fieldSel.appendChild(o);
    }
    fieldSel.value = field;

    wellSel.innerHTML = '<option value="">\u2014 Well \u2014</option>';
    const wo = document.createElement('option'); wo.value = well; wo.textContent = well;
    wellSel.appendChild(wo);
    wellSel.value = well;

    wbSel.innerHTML = '<option value="">\u2014 Wellbore \u2014</option>';
    const wbo = document.createElement('option'); wbo.value = wellbore; wbo.textContent = wellbore;
    wbSel.appendChild(wbo);
    wbSel.value = wellbore;

    showToast('Created well entry: ' + well + ' / ' + wellbore + '. Edit data then click Save.', 'success');
}

/** Add a new wellbore under the currently selected field + well */
function promptNewLocalWellbore() {
    const field = document.getElementById('field-select').value;
    const well = document.getElementById('well-select').value;
    if (!field || !well) { showToast('Select a field and well first', 'warning'); return; }
    const wellbore = prompt('Wellbore name:', '');
    if (!wellbore) return;

    const wbSel = document.getElementById('wellbore-select');
    if (![...wbSel.options].some(o => o.value === wellbore)) {
        const o = document.createElement('option'); o.value = wellbore; o.textContent = wellbore;
        wbSel.appendChild(o);
    }
    wbSel.value = wellbore;
    showToast('Added wellbore: ' + wellbore + '. Edit data then click Save.', 'success');
}

// ═══════════════════════════════════════════════════════
//  JSON EXPORT / IMPORT
// ═══════════════════════════════════════════════════════

/** Export current state as a downloadable JSON file */
function exportLocalWellJSON() {
    const field = document.getElementById('field-select').value || 'unknown';
    const well = document.getElementById('well-select').value || 'unknown';
    const wellbore = document.getElementById('wellbore-select').value || well;
    const data = {
        _format: 'CompletionView-v2',
        field: field,
        well: well,
        wellbore: wellbore,
        exportedAt: new Date().toISOString(),
        state: getAppState()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (well + '_' + wellbore + '.json').replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Exported ' + well + ' / ' + wellbore + ' as JSON', 'success');
}

/** Import a well from a JSON file */
function importLocalWellJSON(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.state || !data.state.wellData) {
                showToast('Invalid JSON — missing well state data', 'error');
                return;
            }

            pushUndoState();
            setAppState(data.state);
            saveToLocalStorage();

            // If in local mode, also save to IndexedDB
            if (_dataSourceMode === 'local' && data.field && data.well) {
                const wb = data.wellbore || data.well;
                await localDB_save(data.field, data.well, wb, data.state);
                refreshLocalDropdowns();
                showToast('Imported & saved ' + data.well + ' / ' + wb + ' to local DB', 'success');
            } else {
                showToast('Imported ' + (data.well || 'well') + ' from JSON', 'success');
            }
        } catch (err) {
            console.error('JSON import error:', err);
            showToast('Failed to parse JSON: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = ''; // reset file input
}

const componentOptions = [
    "Blank Pipe", "Screen", "Swell Packer",
    "ME Plug", "Bull Nose", "Cross Over",
    "SPM", "Safety Valve", "Gauge", "Fishbone", "ICV"
];

const LOG_PALETTE = [
    { fill: 'rgba(22,163,74,0.22)', stroke: '#16a34a', bg: 'rgba(22,163,74,0.05)' },
    { fill: 'rgba(20,100,160,0.22)', stroke: '#1d7ab4', bg: 'rgba(20,100,160,0.05)' },
    { fill: 'rgba(180,80,20,0.22)', stroke: '#c2541a', bg: 'rgba(180,80,20,0.05)' },
    { fill: 'rgba(120,50,160,0.22)', stroke: '#8b30b4', bg: 'rgba(120,50,160,0.05)' },
    { fill: 'rgba(180,140,0,0.22)', stroke: '#b49000', bg: 'rgba(180,140,0,0.05)' },
];

// ═══════════════════════════════════════════════════════
//  DEFAULT DATA
// ═══════════════════════════════════════════════════════
const defaultOpenHoleData = [
    { size: 32, top: 181.02, bottom: 216.91 }, { size: 24, top: 216.91, bottom: 564.41 },
    { size: 16, top: 564.41, bottom: 1579 }, { size: 12.25, top: 1579, bottom: 3157 },
    { size: 8.5, top: 3157, bottom: 4312 }
];

const defaultCasingData = [
    { size: 26, top: 40.79, bottom: 206.72 }, { size: 18.625, top: 206.72, bottom: 558.30 },
    { size: 13.625, top: 40.03, bottom: 1573.94 }, { size: 10.75, top: 39.63, bottom: 342.00 },
    { size: 9.625, top: 342.00, bottom: 3149.97 }
];

const defaultWellData = [
    { type: "Blank Pipe", length_m: 59.59, od_inch: 5.5, id_inch: 4 },
    { type: "Screen", length_m: 11.90, od_inch: 5.5, id_inch: 4 },
    { type: "Blank Pipe", length_m: 12.23, od_inch: 5.5, id_inch: 4 },
    { type: "Screen", length_m: 11.31, od_inch: 5.5, id_inch: 4 },
    { type: "Swell Packer", length_m: 11.27, od_inch: 5.5, id_inch: 4 },
    { type: "Screen", length_m: 11.90, od_inch: 5.5, id_inch: 4 },
    { type: "Screen", length_m: 11.51, od_inch: 5.5, id_inch: 4 },
    { type: "Blank Pipe", length_m: 72.26, od_inch: 5.5, id_inch: 4 }
];

const initialTrajectoryRaw = `39.21 39.21\n41.99 41.99\n43 43\n64.903 64.903\n76.273 76.273\n277.407 277.407\n280.607 280.607\n283.247 283.246\n286.677 286.676\n296.944 296.941\n299.834 299.83\n301.354 301.35\n307.144 307.137\n309.864 309.855\n310.664 310.655\n311.364 311.355\n311.908 311.898\n316.068 316.055\n316.798 316.784\n319.678 319.662\n320.138 320.121\n322.904 322.885\n1336.75 1243.97\n1339.81 1246.08\n1340.14 1246.31\n1341.65 1247.35\n1342.45 1247.9\n1348.46 1252.04\n1354.51 1256.21\n1357.16 1258.04\n1361.33 1260.92\n1365.5 1263.79\n1368.51 1265.87\n1369.24 1266.37\n1372.25 1268.45\n1372.71 1268.77\n1375.31 1270.57\n2702.12 2286.29\n2705.18 2288.33\n2705.53 2288.55\n2707.03 2289.55\n2707.82 2290.08\n2713.83 2294.05\n2719.84 2297.98\n2722.49 2299.71\n2726.66 2302.41\n2730.83 2305.08\n2733.84 2307.01\n2734.57 2307.47\n2737.42 2309.28\n2737.88 2309.57\n2740.64 2311.31\n2891.4 2392.59\n2894.46 2393.95\n2894.8 2394.11\n2896.31 2394.77\n2897.11 2395.12\n2903.13 2397.76\n2926.66 2407.66\n2929.67 2408.88\n2932.32 2409.94\n2935.33 2411.14\n2936.91 2411.76\n2939.92 2412.95\n2940.63 2413.22\n2941.18 2413.44\n2953.26 2418.05\n3034.35 2442.76\n3045.54 2445.3\n3048.55 2445.94\n3049.28 2446.1\n3053.44 2446.97\n3057 2447.69\n3059.01 2448.09\n3071.17 2450.39\n3077.18 2451.45\n3078.2 2451.63\n3081.21 2452.13\n3082.43 2452.34\n3091.03 2453.71\n3094.93 2454.32\n3096 2454.48\n3100.16 2455.12\n3100.96 2455.24\n3105.12 2455.87\n3109.28 2456.5\n3114.3 2457.24\n3119.32 2457.97\n3178.91 2466.05\n3190.81 2467.26\n3203.04 2468.28\n3214.35 2469.01\n3225.62 2469.55\n3237.52 2469.91\n3249.03 2470.05\n3321.29 2467.29\n3332.9 2466.69\n3425.27 2463.53\n3436.8 2463.45\n3437.81 2463.45\n3461.14 2463.47\n3472.69 2463.52\n3518.61 2463.73\n3529.86 2463.78\n3535.87 2463.81\n3569.66 2463.96\n3581.11 2464.02\n3765.3 2464.85\n3768.31 2464.86\n3779.85 2464.92\n3825.35 2465.8\n3836.84 2466.04\n3848.53 2466.29\n3918.2 2467.79\n3924.21 2467.92\n3935.47 2468.16\n4005.05 2469.65\n4016.69 2469.9\n4027.66 2470.14\n4039.09 2470.38\n4176.71 2473.34\n4188.39 2473.59\n4199.73 2473.83\n4303.08 2476.05`;

// ═══════════════════════════════════════════════════════
//  MUTABLE STATE
// ═══════════════════════════════════════════════════════
let openHoleData = JSON.parse(JSON.stringify(defaultOpenHoleData));
let casingData = JSON.parse(JSON.stringify(defaultCasingData));
let wellData = JSON.parse(JSON.stringify(defaultWellData));
let logsData = [];
let currentTrajectory = [];
let lastTrajFormat = "md-tvd";

// Konva references (initialized in renderer.js)
let stage, layer, axesLayer;
let imagesToLoad = 0;
const loadedImages = {};

// ═══════════════════════════════════════════════════════
//  UNDO / REDO
// ═══════════════════════════════════════════════════════
let undoStack = [];
let redoStack = [];

function getAppState() {
    return {
        openHoleData: openHoleData,
        casingData: casingData,
        wellData: wellData,
        currentTrajectory: currentTrajectory,
        logsData: logsData,
        startMD: parseFloat(document.getElementById('start-md')?.value) || 3119.32,
        lastTrajFormat: lastTrajFormat,
        selectedMode: document.getElementById('data-mode')?.value || 'local',
        selectedField: document.getElementById('field-select')?.value || '',
        selectedWell: document.getElementById('well-select')?.value || '',
        selectedWellbore: document.getElementById('wellbore-select')?.value || ''
    };
}

function setAppState(state) {
    openHoleData = state.openHoleData;
    casingData = state.casingData;
    wellData = state.wellData;
    currentTrajectory = state.currentTrajectory;
    logsData = state.logsData;
    lastTrajFormat = state.lastTrajFormat;
    const el = document.getElementById('start-md');
    if (el) el.value = state.startMD;
    renderWellboreTables();
    renderTrajectoryTable();
    renderTable();
    renderLogsUI();
    generateVisuals();
}

function pushUndoState() {
    undoStack.push(JSON.parse(JSON.stringify(getAppState())));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack = [];
    updateUndoRedoButtons();
}

function undo() {
    if (undoStack.length === 0) return;
    redoStack.push(JSON.parse(JSON.stringify(getAppState())));
    const state = undoStack.pop();
    setAppState(state);
    updateUndoRedoButtons();
    saveToLocalStorage();
    showToast('Undo applied', 'info');
}

function redo() {
    if (redoStack.length === 0) return;
    undoStack.push(JSON.parse(JSON.stringify(getAppState())));
    const state = redoStack.pop();
    setAppState(state);
    updateUndoRedoButtons();
    saveToLocalStorage();
    showToast('Redo applied', 'info');
}

function updateUndoRedoButtons() {
    const ub = document.getElementById('undo-btn');
    const rb = document.getElementById('redo-btn');
    if (ub) ub.disabled = undoStack.length === 0;
    if (rb) rb.disabled = redoStack.length === 0;
}

// ═══════════════════════════════════════════════════════
//  SIDEBAR TOGGLE
// ═══════════════════════════════════════════════════════
let _sidebarCustomWidth = null;

function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const isCollapsing = !sidebar.classList.contains('collapsed');

    if (isCollapsing) {
        // Save current width before collapsing
        _sidebarCustomWidth = sidebar.style.width || null;
        sidebar.classList.add('collapsed');
        sidebar.style.width = '';
    } else {
        sidebar.classList.remove('collapsed');
        // Restore custom width if user had resized
        if (_sidebarCustomWidth) {
            // Apply after a frame so the transition from 0 works
            requestAnimationFrame(() => { sidebar.style.width = _sidebarCustomWidth; });
        }
    }

    // Trigger Konva resize after transition
    setTimeout(() => {
        if (stage) {
            const c = document.getElementById('container');
            stage.width(c.offsetWidth);
            stage.height(c.offsetHeight);
            drawDynamicAxes();
        }
    }, 300);
}

// ═══════════════════════════════════════════════════════
//  MINI-MAP TOGGLE
// ═══════════════════════════════════════════════════════
function toggleMinimap() {
    const map = document.getElementById('minimap');
    const btn = document.getElementById('minimap-toggle');
    const visible = map.style.display !== 'none';
    map.style.display = visible ? 'none' : 'block';
    btn.classList.toggle('active', !visible);
    if (!visible) updateMinimap();
}

// ═══════════════════════════════════════════════════════
//  DARK CANVAS TOGGLE
// ═══════════════════════════════════════════════════════
function toggleDarkCanvas() {
    isDarkCanvas = !isDarkCanvas;
    const btn = document.getElementById('dark-mode-btn');
    const container = document.getElementById('container');
    btn.classList.toggle('active', isDarkCanvas);
    container.classList.toggle('dark-canvas', isDarkCanvas);
    generateVisuals();
}

// ═══════════════════════════════════════════════════════
//  WELL SELECTOR POPOVER
// ═══════════════════════════════════════════════════════
function toggleWellSelector() {
    const popover = document.getElementById('well-popover');
    const trigger = document.getElementById('well-selector-trigger');
    const isOpen = popover.classList.toggle('open');
    trigger.classList.toggle('open', isOpen);
}

// Close popover when clicking outside
document.addEventListener('click', function(e) {
    const popover = document.getElementById('well-popover');
    const trigger = document.getElementById('well-selector-trigger');
    if (popover && trigger && !popover.contains(e.target) && !trigger.contains(e.target)) {
        popover.classList.remove('open');
        trigger.classList.remove('open');
    }
    // Close export dropdown when clicking outside
    const expDrop = document.getElementById('export-dropdown');
    if (expDrop && !expDrop.contains(e.target)) {
        expDrop.classList.remove('open');
    }
});

// ═══════════════════════════════════════════════════════
//  EXPORT DROPDOWN
// ═══════════════════════════════════════════════════════
function toggleExportMenu() {
    document.getElementById('export-dropdown').classList.toggle('open');
}

/** Update the well selector label with the current well name */
function updateWellSelectorLabel() {
    var label = document.getElementById('well-selector-label');
    if (!label) return;
    var wb = document.getElementById('wellbore-select');
    var w = document.getElementById('well-select');
    if (wb && wb.value) {
        label.textContent = wb.value;
    } else if (w && w.value) {
        label.textContent = w.value;
    } else {
        label.textContent = 'Select Wellbore';
    }
}

// ═══════════════════════════════════════════════════════
//  APP LIGHT/DARK THEME
// ═══════════════════════════════════════════════════════
let isLightApp = false;

function toggleAppTheme() {
    isLightApp = !isLightApp;
    document.documentElement.classList.toggle('light-theme', isLightApp);
    const btn = document.getElementById('app-theme-btn');
    btn.classList.toggle('active', isLightApp);
    try { localStorage.setItem('completionview-app-theme', isLightApp ? 'light' : 'dark'); } catch(e) {}
}

(function restoreAppTheme() {
    try {
        if (localStorage.getItem('completionview-app-theme') === 'light') {
            isLightApp = true;
            document.documentElement.classList.add('light-theme');
            document.addEventListener('DOMContentLoaded', function() {
                var btn = document.getElementById('app-theme-btn');
                if (btn) { btn.classList.add('active'); }
            });
        }
    } catch(e) {}
})();

// ═══════════════════════════════════════════════════════
//  TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════════════
function showToast(message, type) {
    if (!type) type = 'info';
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('toast-out');
        toast.addEventListener('animationend', () => toast.remove());
    }, 3000);
}

// ═══════════════════════════════════════════════════════
//  LOCAL-STORAGE PERSISTENCE
// ═══════════════════════════════════════════════════════
function saveToLocalStorage() {
    _debouncedSave();
}
const _debouncedSave = _debounce(function () {
    try {
        localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(getAppState()));
    } catch (_) { /* storage full or unavailable */ }
    updateStatusBar();
}, 500);

function loadFromLocalStorage() {
    try {
        const raw = localStorage.getItem(LOCALSTORAGE_KEY);
        if (!raw) return false;
        const s = JSON.parse(raw);
        if (s.openHoleData) openHoleData = s.openHoleData;
        if (s.casingData) casingData = s.casingData;
        if (s.wellData) {
            wellData = s.wellData.map(c => {
                // Migrate legacy types
                if (c.type === 'Swell Packer (Standard)') c.type = 'Swell Packer';
                if (c.type === 'Swell Packer (Slip-on)') c.type = 'Swell Packer';
                return c;
            });
        }
        if (s.logsData) logsData = s.logsData;
        if (s.lastTrajFormat) lastTrajFormat = s.lastTrajFormat;
        if (s.currentTrajectory) {
            currentTrajectory = s.currentTrajectory;
            // Migrate: ensure angles exist
            if (currentTrajectory.length > 0 && currentTrajectory[0].angle === undefined) {
                recalculateTrajectory(currentTrajectory, "md-tvd");
            }
        }
        if (s.startMD != null) {
            const el = document.getElementById('start-md');
            if (el) el.value = s.startMD;
        }
        // Restore selected wellbore dropdowns after DOM is ready
        if (s.selectedMode || s.selectedField || s.selectedWell || s.selectedWellbore) {
            window._pendingSelection = {
                mode: s.selectedMode || 'local',
                field: s.selectedField || '',
                well: s.selectedWell || '',
                wellbore: s.selectedWellbore || ''
            };
        }
        return true;
    } catch (_) { return false; }
}

// ═══════════════════════════════════════════════════════
//  HTML ESCAPING HELPER (XSS prevention)
// ═══════════════════════════════════════════════════════
function escapeAttr(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// ═══════════════════════════════════════════════════════
//  INPUT VALIDATION
// ═══════════════════════════════════════════════════════
function validateAllInputs() {
    // Casing rows
    document.querySelectorAll('.casing-size').forEach(inp => {
        inp.classList.toggle('invalid', parseFloat(inp.value) <= 0);
    });
    const cTops = document.querySelectorAll('.casing-top');
    const cBots = document.querySelectorAll('.casing-bottom');
    cTops.forEach((top, i) => {
        const t = parseFloat(top.value), b = parseFloat(cBots[i]?.value);
        const bad = !isNaN(t) && !isNaN(b) && (t !== 0 || b !== 0) && t >= b;
        top.classList.toggle('invalid', bad);
        if (cBots[i]) cBots[i].classList.toggle('invalid', bad);
    });
    // Open hole rows
    document.querySelectorAll('.hole-size').forEach(inp => {
        inp.classList.toggle('invalid', parseFloat(inp.value) <= 0);
    });
    const hTops = document.querySelectorAll('.hole-top');
    const hBots = document.querySelectorAll('.hole-bottom');
    hTops.forEach((top, i) => {
        const t = parseFloat(top.value), b = parseFloat(hBots[i]?.value);
        const bad = !isNaN(t) && !isNaN(b) && (t !== 0 || b !== 0) && t >= b;
        top.classList.toggle('invalid', bad);
        if (hBots[i]) hBots[i].classList.toggle('invalid', bad);
    });
    // Completion components
    const compODs = document.querySelectorAll('.comp-od');
    const compIDs = document.querySelectorAll('.comp-id');
    const compLens = document.querySelectorAll('.comp-length');
    compODs.forEach((od, i) => {
        const odv = parseFloat(od.value), idv = parseFloat(compIDs[i]?.value);
        od.classList.toggle('invalid', odv <= 0);
        if (compIDs[i]) compIDs[i].classList.toggle('invalid', !isNaN(idv) && !isNaN(odv) && idv >= odv);
    });
    compLens.forEach(len => {
        len.classList.toggle('invalid', parseFloat(len.value) < 0);
    });
}

// ═══════════════════════════════════════════════════════
//  SHARED COMPONENT ROW PARSING
// ═══════════════════════════════════════════════════════
// Type alias map for flexible matching
const TYPE_ALIASES = {
    'bp': 'Blank Pipe', 'blank': 'Blank Pipe', 'blank pipe': 'Blank Pipe',
    'screen': 'Screen', 'scr': 'Screen',
    'swell packer': 'Swell Packer', 'sp': 'Swell Packer', 'packer': 'Swell Packer',
    'me plug': 'ME Plug', 'mep': 'ME Plug', 'plug': 'ME Plug',
    'bull nose': 'Bull Nose', 'bn': 'Bull Nose', 'bullnose': 'Bull Nose',
    'cross over': 'Cross Over', 'xo': 'Cross Over', 'crossover': 'Cross Over', 'x-over': 'Cross Over',
    'spm': 'SPM', 'side pocket mandrel': 'SPM', 'gas lift mandrel': 'SPM',
    'safety valve': 'Safety Valve', 'trscssv': 'Safety Valve', 'sv': 'Safety Valve',
    'gauge': 'Gauge', 'gauge mandrel': 'Gauge',
    'fishbone': 'Fishbone', 'fishbones': 'Fishbone', 'fb': 'Fishbone',
    'icv': 'ICV', 'interval control valve': 'ICV'
};

function matchComponentType(raw) {
    const lower = raw.trim().toLowerCase();
    // Exact match first
    const exact = componentOptions.find(opt => opt.toLowerCase() === lower);
    if (exact) return exact;
    // Alias match
    if (TYPE_ALIASES[lower]) return TYPE_ALIASES[lower];
    // Partial match
    const partial = componentOptions.find(opt => lower.includes(opt.toLowerCase()) || opt.toLowerCase().includes(lower));
    if (partial) return partial;
    return 'Blank Pipe';
}

function parseBoolFlag(val) {
    if (val === undefined || val === null) return false;
    const s = String(val).trim().toLowerCase();
    return s === '1' || s === 'x' || s === 'yes' || s === 'true' || s === 'y';
}

// Staged import data (populated by paste, consumed by processImport)
let _importStagedData = null;

function parseImportRows(text) {
    const rows = text.trim().split('\n');
    const result = [];
    rows.forEach((row, idx) => {
        const cols = row.split(/\t/);
        if (cols.length < 4) return;

        const rawType = cols[0] ? cols[0].trim() : '';
        const description = cols[1] ? cols[1].trim() : '';
        const jointLength = cols[2] ? parseFloat(cols[2]) : NaN;
        const depthTop = cols[3] ? parseFloat(cols[3]) : NaN;
        const id_inch = cols[4] ? parseFloat(cols[4]) : NaN;
        const od_inch = cols[5] ? parseFloat(cols[5]) : NaN;
        const spFlag = parseBoolFlag(cols[6]);
        const tcFlag = parseBoolFlag(cols[7]);
        const icdFlag = parseBoolFlag(cols[8]);

        result.push({
            rawType,
            type: matchComponentType(rawType),
            description,
            jointLength: isNaN(jointLength) ? 0 : jointLength,
            depthTop: isNaN(depthTop) ? 0 : depthTop,
            id_inch: isNaN(id_inch) ? 0 : id_inch,
            od_inch: isNaN(od_inch) ? 0 : od_inch,
            hasSP: spFlag,
            hasTracerCarrier: tcFlag,
            hasICD: icdFlag
        });
    });

    // Sort shallow-to-deep regardless of paste order
    result.sort((a, b) => a.depthTop - b.depthTop);

    // Calculate lengths from depth differences
    const warnings = [];
    for (let i = 0; i < result.length; i++) {
        let calcLen;
        if (i < result.length - 1) {
            calcLen = Math.max(0, result[i + 1].depthTop - result[i].depthTop);
        } else {
            // Last row: use joint length as-is (no next row to diff)
            calcLen = result[i].jointLength;
        }
        result[i].calcLength = Math.round(calcLen * 100) / 100;

        // Check discrepancy
        if (result[i].jointLength > 0 && Math.abs(result[i].calcLength - result[i].jointLength) > 0.5) {
            warnings.push({
                row: i + 1,
                pasted: result[i].jointLength,
                calculated: result[i].calcLength
            });
        }
    }

    return { rows: result, warnings };
}

function handleImportPaste(e) {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (!text || !text.trim()) return;

    const { rows, warnings } = parseImportRows(text);
    if (rows.length === 0) {
        showToast('No valid rows found in pasted data', 'warning');
        return;
    }

    _importStagedData = rows;

    // Build preview table
    const tbody = document.getElementById('import-preview-body');
    tbody.innerHTML = '';
    rows.forEach((r, i) => {
        const tr = document.createElement('tr');
        const hasLen = r.jointLength > 0;
        const mismatch = hasLen && Math.abs(r.calcLength - r.jointLength) > 0.5;

        tr.innerHTML =
            '<td style="text-align:center;color:var(--text-500);font-size:0.72rem">' + (i + 1) + '</td>' +
            '<td>' + escapeAttr(r.type) + '</td>' +
            '<td style="color:var(--text-500);font-size:0.75rem">' + escapeAttr(r.description) + '</td>' +
            '<td' + (mismatch ? ' style="color:var(--accent-orange)"' : '') + '>' + r.jointLength.toFixed(2) + '</td>' +
            '<td style="color:var(--brand-400)">' + r.depthTop.toFixed(2) + '</td>' +
            '<td' + (mismatch ? ' style="color:var(--accent-orange);font-weight:600"' : '') + '>' + r.calcLength.toFixed(2) + '</td>' +
            '<td>' + r.id_inch.toFixed(3) + '</td>' +
            '<td>' + r.od_inch.toFixed(3) + '</td>' +
            '<td style="text-align:center">' + (r.type === 'Screen' && r.hasSP ? '&#10003;' : '') + '</td>' +
            '<td style="text-align:center">' + (r.type === 'Screen' && r.hasTracerCarrier ? '&#10003;' : '') + '</td>' +
            '<td style="text-align:center">' + (r.type === 'Screen' && r.hasICD ? '&#10003;' : '') + '</td>' +
            '<td></td>';

        tbody.appendChild(tr);
    });

    document.getElementById('import-raw-textarea').style.display = 'none';
    document.getElementById('import-preview-wrap').style.display = '';
    document.getElementById('import-confirm-btn').disabled = false;

    // Status message
    let statusMsg = rows.length + ' rows parsed';
    if (warnings.length > 0) {
        statusMsg += ' · ' + warnings.length + ' length discrepanc' + (warnings.length === 1 ? 'y' : 'ies');
        showToast(warnings.length + ' row(s) have joint length \u2260 depth-based length (highlighted in orange)', 'warning');
    }
    document.getElementById('import-status').textContent = statusMsg;
}

// Legacy paste format support (Type, Length, OD, ID)
function parseComponentRows(text) {
    const rows = text.trim().split('\n');
    const result = [];
    rows.forEach(row => {
        const cols = row.split(/[\t,]+/);
        if (cols.length < 4) return;
        const rawType = cols[0].trim();
        let lengthIdx = 1, odIdx = 2, idIdx = 3;
        if (cols.length >= 5 && !isNaN(parseFloat(cols[1])) && !isNaN(parseFloat(cols[2]))) {
            lengthIdx = 2; odIdx = 3; idIdx = 4;
        }
        const length = parseFloat(cols[lengthIdx]);
        const od = parseFloat(cols[odIdx]);
        const id = parseFloat(cols[idIdx]);
        const matchedType = matchComponentType(rawType);
        result.push({
            type: matchedType,
            length_m: isNaN(length) ? 0 : length,
            od_inch: isNaN(od) ? 0 : od,
            id_inch: isNaN(id) ? 0 : id,
            hasSP: false,
            hasTracerCarrier: false,
            hasICD: false
        });
    });
    return result;
}

// ═══════════════════════════════════════════════════════
//  TRAJECTORY (binary-search interpolation)
// ═══════════════════════════════════════════════════════
function recalculateTrajectory(parsed, format) {
    parsed.sort((a, b) => a.md - b.md);
    if (parsed.length > 0) {
        if (format === "md-tvd") {
            for (let i = 0; i < parsed.length; i++) {
                if (i < parsed.length - 1) {
                    const dMD = parsed[i + 1].md - parsed[i].md;
                    const dTVD = parsed[i + 1].tvd - parsed[i].tvd;
                    let ratio = dMD === 0 ? 0 : dTVD / dMD;
                    ratio = Math.max(-1, Math.min(1, ratio));
                    parsed[i].angle = Math.acos(ratio) * (180 / Math.PI);
                } else {
                    parsed[i].angle = i > 0 ? parsed[i - 1].angle : 90;
                }
            }
        } else if (format === "md-angle") {
            let startTVD = 2500;
            if (currentTrajectory.length > 0 && Math.abs(currentTrajectory[0].md - parsed[0].md) < 0.1) {
                startTVD = currentTrajectory[0].tvd;
            }
            parsed[0].tvd = startTVD;
            for (let i = 1; i < parsed.length; i++) {
                const dMD = parsed[i].md - parsed[i - 1].md;
                const prevRad = parsed[i - 1].angle * (Math.PI / 180);
                parsed[i].tvd = parsed[i - 1].tvd + dMD * Math.cos(prevRad);
            }
        }
    }
    currentTrajectory = parsed;
}

function getTrajectoryData(md, trajectory) {
    if (!trajectory || trajectory.length === 0) return null;
    if (md <= trajectory[0].md) return { tvd: trajectory[0].tvd, dev: trajectory[0].angle };
    const last = trajectory[trajectory.length - 1];
    if (md >= last.md) return { tvd: last.tvd, dev: last.angle };

    // Binary search for the interval containing md
    let lo = 0, hi = trajectory.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (trajectory[mid].md <= md) lo = mid;
        else hi = mid;
    }
    const p1 = trajectory[lo], p2 = trajectory[hi];
    const deltaMD = p2.md - p1.md;
    const ratio = deltaMD === 0 ? 0 : (md - p1.md) / deltaMD;
    return {
        tvd: p1.tvd + ratio * (p2.tvd - p1.tvd),
        dev: p1.angle + ratio * (p2.angle - p1.angle)
    };
}

// ═══════════════════════════════════════════════════════
//  DEBOUNCED RENDER
// ═══════════════════════════════════════════════════════
let _renderRAF = null;
function scheduleRender() {
    if (_renderRAF) cancelAnimationFrame(_renderRAF);
    _renderRAF = requestAnimationFrame(() => {
        _renderRAF = null;
        generateVisuals();
    });
}

// ═══════════════════════════════════════════════════════
//  SAFE DOM TABLE BUILDERS
// ═══════════════════════════════════════════════════════

function buildNumericInput(className, value, step, onChangeFn, extraStyle) {
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.inputMode = 'decimal';
    inp.className = className + ' input-field';
    inp.value = value;
    inp.setAttribute('data-step', step || '0.1');
    if (extraStyle) inp.style.cssText = extraStyle;
    inp.addEventListener('change', onChangeFn);
    inp.addEventListener('keydown', handleTableKeyNav);
    // Prevent non-numeric input (allow digits, dot, minus, navigation keys)
    inp.addEventListener('keypress', (e) => {
        if (!/[\d.\-]/.test(e.key) && !e.ctrlKey && !e.metaKey) e.preventDefault();
    });
    return inp;
}

function buildDeleteButton(label, onClickFn) {
    const btn = document.createElement('button');
    btn.className = 'btn-danger';
    btn.textContent = '\u2715';
    btn.setAttribute('aria-label', label);
    btn.addEventListener('click', onClickFn);
    return btn;
}

// ─── Wellbore Tables ─────────────────────────────────
function renderWellboreTables() {
    casingData.sort((a, b) => b.size - a.size);
    openHoleData.sort((a, b) => b.size - a.size);

    const cBody = document.getElementById("casing-tbody");
    cBody.innerHTML = "";
    if (casingData.length === 0) {
        const tr = document.createElement('tr'); tr.className = 'table-empty-row';
        const td = document.createElement('td'); td.colSpan = 4;
        td.textContent = 'No casing rows — click + to add';
        tr.appendChild(td); cBody.appendChild(tr);
    }
    casingData.forEach((row, i) => {
        const tr = document.createElement('tr');
        const mkTd = (child) => { const td = document.createElement('td'); td.appendChild(child); tr.appendChild(td); };
        mkTd(buildNumericInput('casing-size', row.size, '0.1', syncWellboreData));
        mkTd(buildNumericInput('casing-top', row.top, '0.1', syncWellboreData));
        mkTd(buildNumericInput('casing-bottom', row.bottom, '0.1', syncWellboreData));
        const delTd = document.createElement('td');
        delTd.style.cssText = 'width:32px;text-align:center;';
        delTd.appendChild(buildDeleteButton('Delete casing row ' + (i + 1), () => deleteWellboreRow('casing', i)));
        tr.appendChild(delTd);
        cBody.appendChild(tr);
    });

    const oBody = document.getElementById("open-hole-tbody");
    oBody.innerHTML = "";
    if (openHoleData.length === 0) {
        const tr = document.createElement('tr'); tr.className = 'table-empty-row';
        const td = document.createElement('td'); td.colSpan = 4;
        td.textContent = 'No open hole rows — click + to add';
        tr.appendChild(td); oBody.appendChild(tr);
    }
    openHoleData.forEach((row, i) => {
        const tr = document.createElement('tr');
        const mkTd = (child) => { const td = document.createElement('td'); td.appendChild(child); tr.appendChild(td); };
        mkTd(buildNumericInput('hole-size', row.size, '0.1', syncWellboreData));
        mkTd(buildNumericInput('hole-top', row.top, '0.1', syncWellboreData));
        mkTd(buildNumericInput('hole-bottom', row.bottom, '0.1', syncWellboreData));
        const delTd = document.createElement('td');
        delTd.style.cssText = 'width:32px;text-align:center;';
        delTd.appendChild(buildDeleteButton('Delete open hole row ' + (i + 1), () => deleteWellboreRow('hole', i)));
        tr.appendChild(delTd);
        oBody.appendChild(tr);
    });
    validateAllInputs();
    updateBadgeCounts();
}

// ─── Trajectory Table ────────────────────────────────
function renderTrajectoryTable() {
    currentTrajectory.sort((a, b) => a.md - b.md);

    const tbody = document.getElementById("traj-tbody");
    tbody.innerHTML = "";
    const format = document.getElementById("traj-format").value;
    document.getElementById("traj-col2").textContent = format === 'md-angle' ? 'Angle (\u00B0)' : 'TVD (m)';

    if (currentTrajectory.length === 0) {
        const tr = document.createElement('tr'); tr.className = 'table-empty-row';
        const td = document.createElement('td'); td.colSpan = 3;
        td.textContent = 'No deviation data — click + to add';
        tr.appendChild(td); tbody.appendChild(tr);
    }

    currentTrajectory.forEach((pt, i) => {
        const val2 = format === 'md-angle' ? pt.angle : pt.tvd;
        const tr = document.createElement('tr');

        const td1 = document.createElement('td');
        td1.appendChild(buildNumericInput('traj-md', pt.md.toFixed(2), '0.1', syncTrajectoryData, 'color:var(--brand-400);'));
        tr.appendChild(td1);

        const td2 = document.createElement('td');
        td2.appendChild(buildNumericInput('traj-val', val2.toFixed(2), '0.1', syncTrajectoryData));
        tr.appendChild(td2);

        const td3 = document.createElement('td');
        td3.style.cssText = 'width:32px;text-align:center;';
        td3.appendChild(buildDeleteButton('Delete trajectory row ' + (i + 1), () => deleteTrajRow(i)));
        tr.appendChild(td3);

        tbody.appendChild(tr);
    });
    updateBadgeCounts();
}

// ─── Completion String Table ─────────────────────────
function renderTable() {
    const tbody = document.getElementById("table-body");
    tbody.innerHTML = "";

    if (wellData.length === 0) {
        const tr = document.createElement('tr'); tr.className = 'table-empty-row';
        const td = document.createElement('td'); td.colSpan = 10;
        td.textContent = 'No components \u2014 click + Add Component or paste data';
        tr.appendChild(td); tbody.appendChild(tr);
    }

    let runningMD = parseFloat(document.getElementById("start-md").value) || 3119.32;
    const mdList = [];

    wellData.forEach((comp) => {
        mdList.push(runningMD);
        runningMD += comp.length_m;
    });

    wellData.forEach((comp, index) => {
        const tr = document.createElement("tr");
        tr.setAttribute("data-index", index);

        // Seq / drag handle
        const td0 = document.createElement('td');
        td0.style.cssText = 'width:50px;text-align:center;';
        const handle = document.createElement('div');
        handle.className = 'drag-handle';
        handle.draggable = true;
        handle.textContent = '\u2807 ' + (index + 1);
        handle.setAttribute('aria-label', 'Drag to reorder component ' + (index + 1));
        handle.addEventListener('dragstart', handleDragStart, false);
        td0.appendChild(handle);
        tr.appendChild(td0);

        // Component Type select
        const td1 = document.createElement('td');
        const sel = document.createElement('select');
        sel.className = 'comp-type input-field';
        sel.style.textAlign = 'left';
        sel.addEventListener('change', handleTypeChange);
        componentOptions.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt;
            o.textContent = opt;
            if (comp.type === opt) o.selected = true;
            sel.appendChild(o);
        });
        td1.appendChild(sel);
        tr.appendChild(td1);

        // Top MD
        const td2 = document.createElement('td');
        const mdInp = buildNumericInput('', mdList[index].toFixed(2), '0.1',
            function () { handleMDChange(index, this.value); },
            'color:var(--brand-400);');
        td2.appendChild(mdInp);
        tr.appendChild(td2);

        // Length
        const td3 = document.createElement('td');
        const lenInp = buildNumericInput('comp-length', comp.length_m, '0.5', onCompInputChange);
        lenInp.min = '0';
        td3.appendChild(lenInp);
        tr.appendChild(td3);

        // OD
        const td4 = document.createElement('td');
        td4.appendChild(buildNumericInput('comp-od', comp.od_inch, '0.1', onCompInputChange));
        tr.appendChild(td4);

        // ID
        const td5 = document.createElement('td');
        td5.appendChild(buildNumericInput('comp-id', comp.id_inch, '0.1', onCompInputChange));
        tr.appendChild(td5);

        // SP checkbox
        const tdSP = document.createElement('td');
        tdSP.className = 'screen-opt-td';
        tdSP.style.cssText = 'width:38px;text-align:center;';
        const cbSP = document.createElement('input');
        cbSP.type = 'checkbox';
        cbSP.className = 'screen-check screen-sp';
        cbSP.checked = !!comp.hasSP;
        cbSP.addEventListener('change', onCompInputChange);
        if (comp.type !== 'Screen') { cbSP.disabled = true; cbSP.style.visibility = 'hidden'; }
        tdSP.appendChild(cbSP);
        tr.appendChild(tdSP);

        // TC checkbox
        const tdTC = document.createElement('td');
        tdTC.className = 'screen-opt-td';
        tdTC.style.cssText = 'width:38px;text-align:center;';
        const cbTC = document.createElement('input');
        cbTC.type = 'checkbox';
        cbTC.className = 'screen-check screen-tc';
        cbTC.checked = !!comp.hasTracerCarrier;
        cbTC.addEventListener('change', onCompInputChange);
        if (comp.type !== 'Screen') { cbTC.disabled = true; cbTC.style.visibility = 'hidden'; }
        tdTC.appendChild(cbTC);
        tr.appendChild(tdTC);

        // ICD checkbox
        const tdICD = document.createElement('td');
        tdICD.className = 'screen-opt-td';
        tdICD.style.cssText = 'width:38px;text-align:center;';
        const cbICD = document.createElement('input');
        cbICD.type = 'checkbox';
        cbICD.className = 'screen-check screen-icd';
        cbICD.checked = !!comp.hasICD;
        cbICD.addEventListener('change', onCompInputChange);
        if (comp.type !== 'Screen') { cbICD.disabled = true; cbICD.style.visibility = 'hidden'; }
        tdICD.appendChild(cbICD);
        tr.appendChild(tdICD);

        // Delete
        const td6 = document.createElement('td');
        td6.style.cssText = 'width:50px;text-align:center;';
        td6.appendChild(buildDeleteButton('Delete component ' + (index + 1), () => deleteComponent(index)));
        tr.appendChild(td6);

        tr.addEventListener('dragenter', handleDragEnter, false);
        tr.addEventListener('dragover', handleDragOver, false);
        tr.addEventListener('dragleave', handleDragLeave, false);
        tr.addEventListener('drop', handleDrop, false);
        tr.addEventListener('dragend', handleDragEnd, false);
        tbody.appendChild(tr);
    });
    validateAllInputs();
}

// ─── Logs UI ─────────────────────────────────────────
function renderLogsUI() {
    const container = document.getElementById("logs-container");
    if (!container) return;
    container.innerHTML = "";

    logsData.forEach((log, index) => {
        const isPopulated = log.data && log.data.length > 0;
        const pointCount = isPopulated ? log.data.length : 0;

        // Card wrapper
        const card = document.createElement('div');
        card.style.cssText = 'background:var(--bg-900);border:1px solid var(--border-color);border-radius:6px;padding:10px;';

        // Header row
        const headerDiv = document.createElement('div');
        headerDiv.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';

        const leftDiv = document.createElement('div');
        leftDiv.style.cssText = 'display:flex;gap:8px;align-items:center;';

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'input-field log-name-input';
        nameInput.value = log.name;
        nameInput.placeholder = 'Name';
        nameInput.style.cssText = 'width:80px;padding:2px 4px;font-weight:bold;';
        nameInput.addEventListener('change', syncLogsData);
        leftDiv.appendChild(nameInput);

        const statusSpan = document.createElement('span');
        statusSpan.style.fontSize = '0.7rem';
        if (isPopulated) {
            statusSpan.style.color = 'var(--accent-green)';
            statusSpan.textContent = '(\u2713 ' + pointCount + ' points)';
        } else {
            statusSpan.style.color = 'var(--brand-400)';
            statusSpan.textContent = '(Empty)';
        }
        leftDiv.appendChild(statusSpan);
        headerDiv.appendChild(leftDiv);

        const delBtn = document.createElement('button');
        delBtn.className = 'btn-danger';
        delBtn.style.cssText = 'font-size:0.8rem;padding:2px 6px;';
        delBtn.textContent = '\u2715';
        delBtn.setAttribute('aria-label', 'Delete log ' + escapeAttr(log.name));
        delBtn.addEventListener('click', () => { pushUndoState(); deleteLog(index); });
        headerDiv.appendChild(delBtn);
        card.appendChild(headerDiv);

        // Min / Max scale row
        const scaleRow = document.createElement('div');
        scaleRow.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;';

        const minWrap = document.createElement('div');
        minWrap.style.flex = '1';
        const minLabel = document.createElement('span');
        minLabel.style.cssText = 'font-size:0.65rem;color:var(--text-muted);display:block;margin-bottom:2px;';
        minLabel.textContent = 'Min Scale';
        const minInput = document.createElement('input');
        minInput.type = 'number';
        minInput.className = 'input-field log-min-input';
        minInput.value = log.min;
        minInput.style.cssText = 'width:100%;padding:2px 4px;';
        minInput.addEventListener('change', syncLogsData);
        minWrap.appendChild(minLabel);
        minWrap.appendChild(minInput);
        scaleRow.appendChild(minWrap);

        const maxWrap = document.createElement('div');
        maxWrap.style.flex = '1';
        const maxLabel = document.createElement('span');
        maxLabel.style.cssText = 'font-size:0.65rem;color:var(--text-muted);display:block;margin-bottom:2px;';
        maxLabel.textContent = 'Max Scale';
        const maxInput = document.createElement('input');
        maxInput.type = 'number';
        maxInput.className = 'input-field log-max-input';
        maxInput.value = log.max;
        maxInput.style.cssText = 'width:100%;padding:2px 4px;';
        maxInput.addEventListener('change', syncLogsData);
        maxWrap.appendChild(maxLabel);
        maxWrap.appendChild(maxInput);
        scaleRow.appendChild(maxWrap);
        card.appendChild(scaleRow);

        // Data table
        const tableWrap = document.createElement('div');
        tableWrap.className = 'data-table-wrapper';
        tableWrap.style.cssText = isPopulated ? 'height:160px;min-height:100px;' : 'height:40px;min-height:40px;';

        const table = document.createElement('table');
        table.className = 'data-table';
        table.style.cssText = 'height:100%;display:flex;flex-direction:column;';

        const thead = document.createElement('thead');
        thead.style.flexShrink = '0';
        const headTr = document.createElement('tr');
        const th1 = document.createElement('th'); th1.textContent = 'MD (m)';
        const th2 = document.createElement('th'); th2.textContent = 'Value';
        headTr.appendChild(th1); headTr.appendChild(th2);
        thead.appendChild(headTr);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        tbody.style.cssText = 'flex:1;overflow-y:auto;';
        tbody.addEventListener('paste', function (e) { handleLogPaste(e, index); });

        if (isPopulated) {
            log.data.forEach(pt => {
                const row = document.createElement('tr');
                const td1 = document.createElement('td');
                td1.style.cssText = 'text-align:center;font-size:0.65rem;padding:2px 4px;color:var(--text-main);font-family:Consolas,Monaco,monospace;';
                td1.textContent = pt.md;
                const td2 = document.createElement('td');
                td2.style.cssText = 'text-align:center;font-size:0.65rem;padding:2px 4px;color:var(--text-main);font-family:Consolas,Monaco,monospace;';
                td2.textContent = pt.val;
                row.appendChild(td1);
                row.appendChild(td2);
                tbody.appendChild(row);
            });
        } else {
            const infoTr = document.createElement('tr');
            const infoTd = document.createElement('td');
            infoTd.colSpan = 2;
            infoTd.style.cssText = 'text-align:center;color:var(--text-faint);font-size:0.65rem;padding:8px 4px;';
            infoTd.innerHTML = '<span style="opacity:0.5;">No data \u00B7</span> <span style="color:var(--text-muted);">Ctrl+V to import</span>';
            infoTr.appendChild(infoTd);
            tbody.appendChild(infoTr);
        }

        table.appendChild(tbody);
        tableWrap.appendChild(table);
        card.appendChild(tableWrap);

        container.appendChild(card);
    });
    updateBadgeCounts();
}

// ═══════════════════════════════════════════════════════
//  DATA SYNC FUNCTIONS
// ═══════════════════════════════════════════════════════
function onCompInputChange() {
    _debouncedCompChange();
}
const _debouncedCompChange = _debounce(function () {
    pushUndoState();
    scheduleRender();
}, 250);

function syncWellboreData() {
    pushUndoState();
    const cSizes = document.querySelectorAll(".casing-size");
    const cTops = document.querySelectorAll(".casing-top");
    const cBots = document.querySelectorAll(".casing-bottom");
    casingData = Array.from(cSizes).map((s, i) => ({
        size: parseFloat(s.value) || 0,
        top: parseFloat(cTops[i].value) || 0,
        bottom: parseFloat(cBots[i].value) || 0
    }));
    casingData.sort((a, b) => b.size - a.size);

    const hSizes = document.querySelectorAll(".hole-size");
    const hTops = document.querySelectorAll(".hole-top");
    const hBots = document.querySelectorAll(".hole-bottom");
    openHoleData = Array.from(hSizes).map((s, i) => ({
        size: parseFloat(s.value) || 0,
        top: parseFloat(hTops[i].value) || 0,
        bottom: parseFloat(hBots[i].value) || 0
    }));
    openHoleData.sort((a, b) => b.size - a.size);

    validateAllInputs();
    saveToLocalStorage();
    renderWellboreTables();
    scheduleRender();
}

function syncDataFromUI() {
    const types = document.querySelectorAll(".comp-type");
    const lengths = document.querySelectorAll(".comp-length");
    const ods = document.querySelectorAll(".comp-od");
    const ids = document.querySelectorAll(".comp-id");
    const sps = document.querySelectorAll(".screen-sp");
    const tcs = document.querySelectorAll(".screen-tc");
    const icds = document.querySelectorAll(".screen-icd");
    wellData = Array.from(types).map((typeSelect, i) => {
        return {
            type: typeSelect.value,
            length_m: parseFloat(lengths[i].value) || 0,
            od_inch: parseFloat(ods[i].value) || 0,
            id_inch: parseFloat(ids[i].value) || 0,
            hasSP: sps[i] ? sps[i].checked : false,
            hasTracerCarrier: tcs[i] ? tcs[i].checked : false,
            hasICD: icds[i] ? icds[i].checked : false
        };
    });
}

function syncTrajectoryData() {
    pushUndoState();
    const mds = document.querySelectorAll(".traj-md");
    const vals = document.querySelectorAll(".traj-val");
    const format = document.getElementById("traj-format").value;
    const parsed = [];
    for (let i = 0; i < mds.length; i++) {
        const m = parseFloat(mds[i].value), v = parseFloat(vals[i].value);
        if (!isNaN(m) && !isNaN(v)) {
            parsed.push(format === "md-angle" ? { md: m, angle: v } : { md: m, tvd: v });
        }
    }
    recalculateTrajectory(parsed, format);
    saveToLocalStorage();
    generateVisuals();
}

function syncLogsData() {
    pushUndoState();
    const nameInputs = document.querySelectorAll('.log-name-input');
    const minInputs = document.querySelectorAll('.log-min-input');
    const maxInputs = document.querySelectorAll('.log-max-input');
    nameInputs.forEach((input, i) => {
        logsData[i].name = input.value;
        logsData[i].min = parseFloat(minInputs[i].value) || 0;
        logsData[i].max = parseFloat(maxInputs[i].value) || 0;
    });
    saveToLocalStorage();
    generateVisuals();
}

// ═══════════════════════════════════════════════════════
//  PASTE HANDLERS
// ═══════════════════════════════════════════════════════
function handleGridPaste(e, gridType) {
    e.preventDefault();
    pushUndoState();
    const text = (e.clipboardData || window.clipboardData).getData('text');
    const rows = text.trim().split('\n');
    const newData = [];
    rows.forEach(row => {
        const cols = row.trim().split(/[,\t ]+/);
        if (cols.length >= 3) {
            newData.push({
                size: parseFloat(cols[0]) || 0,
                top: parseFloat(cols[1]) || 0,
                bottom: parseFloat(cols[2]) || 0
            });
        }
    });
    if (newData.length > 0) {
        if (gridType === 'casing') casingData = newData; else openHoleData = newData;
        renderWellboreTables();
        saveToLocalStorage();
        generateVisuals();
        showToast('Pasted ' + newData.length + ' rows', 'success');
    }
}

function handleTrajPaste(e) {
    e.preventDefault();
    pushUndoState();
    const text = (e.clipboardData || window.clipboardData).getData('text');
    const rows = text.trim().split('\n');
    const format = document.getElementById("traj-format").value;
    const parsed = [];
    rows.forEach(row => {
        const cols = row.trim().split(/[,\t ]+/);
        if (cols.length >= 2) {
            const md = parseFloat(cols[0]), val = parseFloat(cols[1]);
            if (!isNaN(md) && !isNaN(val)) {
                parsed.push(format === "md-angle" ? { md, angle: val } : { md, tvd: val });
            }
        }
    });
    if (parsed.length > 0) {
        recalculateTrajectory(parsed, format);
        renderTrajectoryTable();
        saveToLocalStorage();
        generateVisuals();
        showToast('Pasted ' + parsed.length + ' trajectory points', 'success');
    }
}

function handleComponentPaste(e) {
    e.preventDefault();
    pushUndoState();
    const text = (e.clipboardData || window.clipboardData).getData('text');
    const cols = (text.trim().split('\n')[0] || '').split(/\t/);

    // Detect new format (>= 6 tab-separated columns with depth in col 4)
    if (cols.length >= 6) {
        const { rows, warnings } = parseImportRows(text);
        if (rows.length > 0) {
            const firstDepth = rows[0].depthTop;
            if (firstDepth > 0) document.getElementById('start-md').value = firstDepth;

            wellData = rows.map(r => ({
                type: r.type,
                length_m: r.calcLength,
                od_inch: r.od_inch,
                id_inch: r.id_inch,
                hasSP: r.hasSP,
                hasTracerCarrier: r.hasTracerCarrier,
                hasICD: r.hasICD
            }));
            renderTable();
            saveToLocalStorage();
            generateVisuals();
            let msg = 'Imported ' + wellData.length + ' components';
            if (warnings.length > 0) msg += ' (' + warnings.length + ' length discrepancies)';
            showToast(msg, warnings.length > 0 ? 'warning' : 'success');
            return;
        }
    }

    // Legacy format fallback (Type, Length, OD, ID)
    const newData = parseComponentRows(text);
    if (newData.length > 0) {
        wellData = newData;
        renderTable();
        saveToLocalStorage();
        generateVisuals();
        showToast('Imported ' + newData.length + ' components', 'success');
    }
}

function handleLogPaste(e, logIndex) {
    e.preventDefault();
    pushUndoState();
    const text = (e.clipboardData || window.clipboardData).getData('text');
    const rows = text.trim().split('\n');
    const parsed = [];
    rows.forEach(row => {
        const cols = row.trim().split(/[,\t ]+/);
        if (cols.length >= 2) {
            const md = parseFloat(cols[0]), val = parseFloat(cols[1]);
            if (!isNaN(md) && !isNaN(val)) parsed.push({ md, val });
        }
    });
    if (parsed.length > 0) {
        logsData[logIndex].data = parsed;
        // Auto-set max scale: max value + 5%, rounded to nearest 10 if > 10
        const maxVal = Math.max(...parsed.map(p => p.val));
        let smartMax = maxVal * 1.05;
        if (smartMax > 10) smartMax = Math.ceil(smartMax / 10) * 10;
        else smartMax = Math.ceil(smartMax * 10) / 10;
        logsData[logIndex].max = smartMax;
        renderLogsUI();
        saveToLocalStorage();
        generateVisuals();
        showToast('Loaded ' + parsed.length + ' log points', 'success');
    }
}

// ═══════════════════════════════════════════════════════
//  ROW ADD / DELETE
// ═══════════════════════════════════════════════════════
function addCasingRow() {
    pushUndoState();
    casingData.push({ size: 0, top: 0, bottom: 0 });
    renderWellboreTables();
    saveToLocalStorage();
}

function addOpenHoleRow() {
    pushUndoState();
    openHoleData.push({ size: 0, top: 0, bottom: 0 });
    renderWellboreTables();
    saveToLocalStorage();
}

function deleteWellboreRow(type, index) {
    pushUndoState();
    if (type === 'casing') casingData.splice(index, 1); else openHoleData.splice(index, 1);
    renderWellboreTables();
    saveToLocalStorage();
    generateVisuals();
}

function addTrajRow() {
    pushUndoState();
    const lastMD = currentTrajectory.length > 0 ? currentTrajectory[currentTrajectory.length - 1].md + 30 : 3000;
    const lastTVD = currentTrajectory.length > 0 ? currentTrajectory[currentTrajectory.length - 1].tvd : 2500;
    const lastAng = currentTrajectory.length > 0 ? currentTrajectory[currentTrajectory.length - 1].angle : 90;
    currentTrajectory.push({ md: lastMD, tvd: lastTVD, angle: lastAng });
    renderTrajectoryTable();
    saveToLocalStorage();
    generateVisuals();
}

function deleteTrajRow(i) {
    pushUndoState();
    currentTrajectory.splice(i, 1);
    renderTrajectoryTable();
    saveToLocalStorage();
    generateVisuals();
}

function addComponent() {
    pushUndoState();
    syncDataFromUI();
    wellData.push({ type: "Screen", length_m: 12, od_inch: 5.5, id_inch: 4.0, hasSP: false, hasTracerCarrier: false, hasICD: false });
    renderTable();
    saveToLocalStorage();
    generateVisuals();
}

function deleteComponent(index) {
    pushUndoState();
    syncDataFromUI();
    wellData.splice(index, 1);
    renderTable();
    saveToLocalStorage();
    generateVisuals();
    showToast('Component deleted', 'warning');
}

function addLog() {
    pushUndoState();
    logsData.push({ name: "New Log", min: 0, max: 100, data: [] });
    renderLogsUI();
    saveToLocalStorage();
    generateVisuals();
}

function deleteLog(index) {
    logsData.splice(index, 1);
    renderLogsUI();
    saveToLocalStorage();
    generateVisuals();
}

// ═══════════════════════════════════════════════════════
//  DRAG & DROP
// ═══════════════════════════════════════════════════════
let dragSrcIndex = null;

function handleDragStart(e) {
    dragSrcIndex = parseInt(this.closest('tr').getAttribute('data-index'));
    e.dataTransfer.effectAllowed = 'move';
    this.closest('tr').style.opacity = '0.4';
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // Determine if hovering top or bottom half of the row
    const tr = this.closest('tr');
    const rect = tr.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    tr.classList.remove('over-below');
    if (e.clientY > midY) tr.classList.add('over-below');
    return false;
}

function handleDragEnter() {
    // Clear indicator from other rows first
    document.querySelectorAll('#table-body tr.over').forEach(r => {
        if (r !== this.closest('tr')) r.classList.remove('over', 'over-below');
    });
    this.closest('tr').classList.add('over');
}

function handleDragLeave(e) {
    const tr = this.closest('tr');
    // Only remove if actually leaving the row (not entering a child)
    if (!tr.contains(e.relatedTarget)) {
        tr.classList.remove('over', 'over-below');
    }
}

function handleDrop(e) {
    e.stopPropagation();
    const tr = this.closest('tr');
    const dropIndex = parseInt(tr.getAttribute('data-index'));
    const isBelow = tr.classList.contains('over-below');
    let targetIndex = isBelow ? dropIndex + 1 : dropIndex;

    // Adjust if dragging from before the target
    if (dragSrcIndex < targetIndex) targetIndex--;

    if (dragSrcIndex !== targetIndex) {
        pushUndoState();
        syncDataFromUI();
        const movedItem = wellData.splice(dragSrcIndex, 1)[0];
        wellData.splice(targetIndex, 0, movedItem);
        renderTable();
        saveToLocalStorage();
        generateVisuals();
    }
    document.querySelectorAll('#table-body tr').forEach(row => row.classList.remove('over', 'over-below'));
    return false;
}

function handleDragEnd() {
    this.closest('tr').style.opacity = '1';
    document.querySelectorAll('#table-body tr').forEach(row => row.classList.remove('over', 'over-below'));
}

// ═══════════════════════════════════════════════════════
//  MD / TYPE / START HANDLERS
// ═══════════════════════════════════════════════════════
function handleMDChange(index, value) {
    pushUndoState();
    syncDataFromUI();
    const newMD = parseFloat(value);
    if (!isNaN(newMD)) {
        if (index === 0) {
            document.getElementById('start-md').value = newMD;
        } else {
            let prevIndex = index - 1;
            if (prevIndex >= 0) {
                let start = parseFloat(document.getElementById('start-md').value) || 3119.32;
                let current = start;
                for (let i = 0; i < prevIndex; i++) {
                    current += wellData[i].length_m;
                }
                wellData[prevIndex].length_m = Math.max(0, newMD - current);
            }
        }
    }
    renderTable();
    saveToLocalStorage();
    renderVisuals();
}

function handleStartMDChange() {
    pushUndoState();
    saveToLocalStorage();
    generateVisuals();
}

function handleTypeChange() {
    pushUndoState();
    syncDataFromUI();
    renderTable();
    saveToLocalStorage();
    generateVisuals();
}

// ═══════════════════════════════════════════════════════
//  TABS / PANELS / IMPORT
// ═══════════════════════════════════════════════════════
function switchTab(tabId, btn) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    btn.classList.add('active');
}

// ═══════════════════════════════════════════════════════
//  STATUS BAR
// ═══════════════════════════════════════════════════════
function updateStatusBar() {
    const countEl = document.getElementById('status-count');
    const lengthEl = document.getElementById('status-length');
    const zoomEl = document.getElementById('status-zoom');
    const savedEl = document.getElementById('status-saved');
    const dotEl = document.querySelector('.status-dot');

    if (countEl) countEl.textContent = wellData.length;
    if (lengthEl) {
        const total = wellData.reduce((sum, c) => sum + c.length_m, 0);
        lengthEl.textContent = total.toFixed(1) + ' m';
    }
    if (zoomEl && stage) {
        zoomEl.textContent = Math.round(stage.scaleX() * 100) + '%';
    }
    if (savedEl) {
        const now = new Date();
        savedEl.textContent = 'Saved ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (dotEl) {
        dotEl.style.background = 'var(--accent-green)';
    }

    // Data quality warnings
    const warnSpan = document.getElementById('status-warnings');
    const warnCount = document.getElementById('status-warn-count');
    if (warnSpan && warnCount) {
        const issues = validateCompletionData();
        window._dataQualityIssues = issues;
        if (issues.length > 0) {
            warnCount.textContent = issues.length;
            warnSpan.style.display = 'inline';
        } else {
            warnSpan.style.display = 'none';
        }
    }
}

// ═══════════════════════════════════════════════════════
//  DATA QUALITY VALIDATION
// ═══════════════════════════════════════════════════════

/** Validate current wellData and return array of { seq, type, field, message } */
function validateCompletionData() {
    const issues = [];
    const startMD = parseFloat(document.getElementById('start-md').value) || 0;
    let runMD = startMD;

    wellData.forEach((comp, idx) => {
        const seq = idx + 1;
        const desc = comp._csd?.description || '';

        if (comp.length_m === 0) {
            issues.push({ seq, type: comp.type, field: 'Length', message: 'Zero length' });
        }
        if (comp.od_inch === 0) {
            issues.push({ seq, type: comp.type, field: 'OD', message: 'Zero OD — check CSD description' });
        }
        if (comp.id_inch === 0) {
            issues.push({ seq, type: comp.type, field: 'ID', message: 'Zero ID — check CSD description' });
        }
        if (comp.type === 'Blank Pipe' && desc) {
            // Blank Pipe is the fallback — flag if description doesn't match typical blank pipe patterns
            const lowerDesc = desc.toLowerCase();
            const blankPipePatterns = ['blank pipe', 'blank', 'tbg', 'tubing', 'joint', 'liner', 'casing', 'pipe'];
            if (!blankPipePatterns.some(p => lowerDesc.includes(p))) {
                issues.push({ seq, type: comp.type, field: 'Type', message: 'Unmapped type — CSD: "' + (desc.length > 50 ? desc.substring(0, 47) + '...' : desc) + '"' });
            }
        }
        if (comp.length_m < 0) {
            issues.push({ seq, type: comp.type, field: 'Length', message: 'Negative length (' + comp.length_m + ' m)' });
        }
        if (comp.od_inch > 0 && comp.id_inch > 0 && comp.id_inch >= comp.od_inch) {
            issues.push({ seq, type: comp.type, field: 'OD/ID', message: 'ID (' + comp.id_inch.toFixed(3) + '") >= OD (' + comp.od_inch.toFixed(3) + '")' });
        }

        runMD += comp.length_m;
    });

    return issues;
}

/** Show data quality report in a modal-style overlay */
function showDataQualityReport() {
    const issues = window._dataQualityIssues || validateCompletionData();
    if (issues.length === 0) {
        showToast('No data quality issues found', 'success');
        return;
    }

    // Remove existing report if any
    let existing = document.getElementById('dq-report-overlay');
    if (existing) { existing.remove(); return; }

    const overlay = document.createElement('div');
    overlay.id = 'dq-report-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';

    const card = document.createElement('div');
    card.style.cssText = 'background:var(--surface);color:var(--text);border-radius:12px;padding:24px;max-width:700px;width:90%;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.4);font-family:var(--font);';

    let html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">';
    html += '<h3 style="margin:0;">⚠ Data Quality Report (' + issues.length + ' issue' + (issues.length !== 1 ? 's' : '') + ')</h3>';
    html += '<button onclick="document.getElementById(\'dq-report-overlay\').remove()" style="background:none;border:none;color:var(--text);font-size:20px;cursor:pointer;">✕</button>';
    html += '</div>';

    html += '<table style="width:100%;border-collapse:collapse;font-size:13px;">';
    html += '<tr style="border-bottom:2px solid var(--border);text-align:left;">';
    html += '<th style="padding:6px 8px;">#</th><th style="padding:6px 8px;">Type</th><th style="padding:6px 8px;">Field</th><th style="padding:6px 8px;">Issue</th>';
    html += '</tr>';

    issues.forEach(issue => {
        const fieldColor = issue.field === 'Type' ? '#f59e0b' : (issue.field === 'OD' || issue.field === 'ID' || issue.field === 'OD/ID') ? '#ef4444' : '#3b82f6';
        html += '<tr style="border-bottom:1px solid var(--border);">';
        html += '<td style="padding:6px 8px;font-weight:600;">' + issue.seq + '</td>';
        html += '<td style="padding:6px 8px;">' + escapeAttr(issue.type) + '</td>';
        html += '<td style="padding:6px 8px;"><span style="background:' + fieldColor + ';color:#fff;padding:1px 6px;border-radius:4px;font-size:11px;">' + escapeAttr(issue.field) + '</span></td>';
        html += '<td style="padding:6px 8px;">' + escapeAttr(issue.message) + '</td>';
        html += '</tr>';
    });

    html += '</table>';
    card.innerHTML = html;
    overlay.appendChild(card);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
}

// ═══════════════════════════════════════════════════════
//  PANEL RESIZE (drag-handle)
// ═══════════════════════════════════════════════════════
function initPanelResize() {
    const handle = document.getElementById('panel-resize-handle');
    const panel = document.getElementById('bottom-panel');
    if (!handle || !panel) return;

    let startY, startH, dragging = false;

    handle.addEventListener('mousedown', (e) => {
        if (panel.classList.contains('hidden')) return;
        e.preventDefault();
        dragging = true;
        startY = e.clientY;
        startH = panel.offsetHeight;
        panel.classList.remove('collapsed');
        panel.style.transition = 'none';
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const delta = startY - e.clientY;
        const newH = Math.max(60, Math.min(window.innerHeight * 0.85, startH + delta));
        panel.style.height = newH + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging = false;
        panel.style.transition = '';
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        // Trigger Konva resize
        if (stage) {
            const c = document.getElementById('container');
            stage.width(c.offsetWidth);
            stage.height(c.offsetHeight);
            drawDynamicAxes();
        }
    });
}

function toggleBottomPanel() {
    const panel = document.getElementById('bottom-panel');
    const wasHidden = panel.classList.contains('hidden');
    if (wasHidden) {
        panel.classList.remove('hidden');
        // Restore previous height if it was resized before hiding
        if (panel.dataset.prevHeight) {
            panel.style.height = panel.dataset.prevHeight;
        }
    } else {
        // Store current height so we can restore it
        panel.dataset.prevHeight = panel.style.height || '';
        panel.classList.add('hidden');
    }
    // Trigger Konva resize after transition
    setTimeout(() => {
        if (stage) {
            const c = document.getElementById('container');
            stage.width(c.offsetWidth);
            stage.height(c.offsetHeight);
            drawDynamicAxes();
        }
    }, 300);
}

function toggleImport() {
    const section = document.getElementById('import-section');
    const isOpening = section.style.display !== 'flex';
    section.style.display = isOpening ? 'flex' : 'none';

    if (isOpening) {
        // Reset preview
        _importStagedData = null;
        document.getElementById('import-preview-body').innerHTML = '';
        document.getElementById('import-preview-wrap').style.display = 'none';
        document.getElementById('import-confirm-btn').disabled = true;
        document.getElementById('import-status').textContent = '';

        // Populate textarea with current wellData as TSV
        const ta = document.getElementById('import-raw-textarea');
        ta.value = wellDataToTSV();
        ta.style.display = '';
        ta.focus();
        ta.select();
    }
}

/** Convert current wellData to tab-separated text matching import format:
 *  Type \t Description \t Joint Length \t Depth Top \t ID \t OD \t SP \t TC \t ICD */
function wellDataToTSV() {
    if (!wellData || wellData.length === 0) return '';
    const startMD = parseFloat(document.getElementById('start-md').value) || 0;
    let depthTop = startMD;
    const lines = [];
    for (let i = 0; i < wellData.length; i++) {
        const d = wellData[i];
        const type = d.type || '';
        const desc = d.description || '';
        const len = d.length_m || 0;
        const id_in = d.id_inch || 0;
        const od_in = d.od_inch || 0;
        const sp = (d.hasSP ? '1' : '');
        const tc = (d.hasTracerCarrier ? '1' : '');
        const icd = (d.hasICD ? '1' : '');
        lines.push([type, desc, len.toFixed(2), depthTop.toFixed(2), id_in.toFixed(3), od_in.toFixed(3), sp, tc, icd].join('\t'));
        depthTop += len;
    }
    return lines.join('\n');
}

function processImport() {
    if (!_importStagedData || _importStagedData.length === 0) {
        showToast("No data to import. Paste data first.", "warning");
        return;
    }
    pushUndoState();

    // Also update Tie-In Depth from first row's depth
    const firstDepth = _importStagedData[0].depthTop;
    if (firstDepth > 0) {
        document.getElementById('start-md').value = firstDepth;
    }

    wellData = _importStagedData.map(r => ({
        type: r.type,
        length_m: r.calcLength,
        od_inch: r.od_inch,
        id_inch: r.id_inch,
        hasSP: r.hasSP,
        hasTracerCarrier: r.hasTracerCarrier,
        hasICD: r.hasICD
    }));

    _importStagedData = null;
    renderTable();
    saveToLocalStorage();
    generateVisuals();
    toggleImport();
    showToast('Imported ' + wellData.length + ' components', 'success');
}

function updateTrajFormat() {
    const newFormat = document.getElementById("traj-format").value;
    if (newFormat === lastTrajFormat) return;
    lastTrajFormat = newFormat;
    renderTrajectoryTable();
    generateVisuals();
}

function initLogs() {
    if (logsData.length === 0) {
        logsData.push({ name: "GR", min: 0, max: 150, data: [] });
    }
    renderLogsUI();
}

// ═══════════════════════════════════════════════════════
//  EXCEL-STYLE TABLE KEYBOARD NAVIGATION
// ═══════════════════════════════════════════════════════
function handleTableKeyNav(e) {
    const navKeys = ['Enter', 'Escape', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Tab'];
    if (!navKeys.includes(e.key)) return;

    if (e.key === 'Escape') { e.target.blur(); return; }

    const td = e.target.closest('td');
    const tr = td?.closest('tr');
    const tbody = tr?.closest('tbody');
    if (!td || !tr || !tbody) return;

    const colIndex = Array.from(tr.children).indexOf(td);
    const rows = Array.from(tbody.querySelectorAll('tr'));
    const rowIndex = rows.indexOf(tr);

    let targetRow, targetCol = colIndex;

    if (e.key === 'Enter' || e.key === 'ArrowDown') {
        e.preventDefault();
        targetRow = e.shiftKey && e.key === 'Enter' ? rows[rowIndex - 1] : rows[rowIndex + 1];
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        targetRow = rows[rowIndex - 1];
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        // Only navigate if cursor is at edge of text
        const inp = e.target;
        if (e.key === 'ArrowLeft' && inp.selectionStart === 0 && inp.selectionEnd === 0) {
            e.preventDefault();
            targetRow = tr;
            targetCol = colIndex - 1;
        } else if (e.key === 'ArrowRight' && inp.selectionStart === inp.value.length) {
            e.preventDefault();
            targetRow = tr;
            targetCol = colIndex + 1;
        } else {
            return; // let default cursor movement happen
        }
    } else if (e.key === 'Tab') {
        e.preventDefault();
        targetRow = tr;
        targetCol = e.shiftKey ? colIndex - 1 : colIndex + 1;
        // Wrap to next/prev row
        const maxCol = tr.children.length - 2; // exclude delete column
        if (targetCol > maxCol) { targetRow = rows[rowIndex + 1]; targetCol = 0; }
        else if (targetCol < 0) { targetRow = rows[rowIndex - 1]; targetCol = maxCol; }
    } else {
        return;
    }

    if (targetRow) {
        const targetTd = targetRow.children[targetCol];
        const targetInput = targetTd?.querySelector('input');
        if (targetInput) { targetInput.focus(); targetInput.select(); }
    }
}

// ═══════════════════════════════════════════════════════
//  CONTEXT MENU
// ═══════════════════════════════════════════════════════
let contextMenuTargetIndex = -1;

function showContextMenu(x, y, compIndex) {
    contextMenuTargetIndex = compIndex;
    const menu = document.getElementById('context-menu');
    menu.style.display = 'block';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    // Clamp to viewport
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 8) + 'px';
}

function hideContextMenu() {
    document.getElementById('context-menu').style.display = 'none';
    contextMenuTargetIndex = -1;
}

function handleContextMenuAction(action) {
    const idx = contextMenuTargetIndex;
    if (idx < 0 || idx >= wellData.length) { hideContextMenu(); return; }
    hideContextMenu();

    if (action === 'edit') {
        // Expand panel if small, then scroll to row
        const panel = document.getElementById('bottom-panel');
        if (panel.offsetHeight < 300) {
            panel.style.height = '400px';
            panel.classList.remove('collapsed');
        }
        setTimeout(() => {
            const rows = document.querySelectorAll('#table-body tr');
            if (rows[idx]) {
                rows[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
                rows[idx].style.background = 'var(--bg-600)';
                setTimeout(() => { rows[idx].style.background = ''; }, 1500);
            }
        }, 100);
    } else if (action === 'duplicate') {
        pushUndoState();
        syncDataFromUI();
        const copy = JSON.parse(JSON.stringify(wellData[idx]));
        wellData.splice(idx + 1, 0, copy);
        renderTable();
        saveToLocalStorage();
        generateVisuals();
        showToast('Component duplicated', 'success');
    } else if (action === 'insert-before') {
        pushUndoState();
        syncDataFromUI();
        wellData.splice(idx, 0, { type: "Blank Pipe", length_m: 12, od_inch: 5.5, id_inch: 4.0 });
        renderTable();
        saveToLocalStorage();
        generateVisuals();
        showToast('Component inserted', 'success');
    } else if (action === 'insert-after') {
        pushUndoState();
        syncDataFromUI();
        wellData.splice(idx + 1, 0, { type: "Blank Pipe", length_m: 12, od_inch: 5.5, id_inch: 4.0 });
        renderTable();
        saveToLocalStorage();
        generateVisuals();
        showToast('Component inserted', 'success');
    } else if (action === 'delete') {
        pushUndoState();
        syncDataFromUI();
        wellData.splice(idx, 1);
        renderTable();
        saveToLocalStorage();
        generateVisuals();
        showToast('Component deleted', 'warning');
    }
}

// ═══════════════════════════════════════════════════════
//  KEYBOARD SHORTCUTS
// ═══════════════════════════════════════════════════════
function handleKeyboard(e) {
    const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        if (isInput) return; // let browser handle undo in inputs
        e.preventDefault();
        undo();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        if (isInput) return;
        e.preventDefault();
        redo();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        exportPNG();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
        e.preventDefault();
        document.getElementById('goto-md-input')?.focus();
        document.getElementById('goto-md-input')?.select();
    }
}

// ═══════════════════════════════════════════════════════
//  GO-TO-MD DEPTH JUMP
// ═══════════════════════════════════════════════════════
function goToMD(mdVal) {
    if (!stage || typeof Konva === 'undefined') return;
    const startMD = parseFloat(document.getElementById('start-md').value) || 0;
    const md = mdVal != null ? mdVal : parseFloat(document.getElementById('goto-md-input')?.value);
    if (isNaN(md)) { showToast('Enter a valid MD depth', 'warning'); return; }

    const scale = stage.scaleX();
    const t = md - startMD;
    const canvasX = t * PIXELS_PER_METER + INITIAL_X;
    const stageW = stage.width();
    const stageH = stage.height();

    // Pan so the target MD is horizontally centred
    const newX = stageW / 2 - canvasX * scale;
    const newY = stageH / 2 - CENTER_Y * scale;
    stage.position({ x: newX, y: newY });
    drawDynamicAxes();
    updateMinimap();

    // Flash a brief vertical highlight line
    if (layer) {
        const marker = new Konva.Line({
            points: [canvasX, 0, canvasX, stageH / scale],
            stroke: '#f59e0b', strokeWidth: 2, dash: [8, 4], opacity: 1
        });
        layer.add(marker);
        layer.draw();
        let opacity = 1;
        const fade = setInterval(() => {
            opacity -= 0.05;
            if (opacity <= 0) { clearInterval(fade); marker.destroy(); layer.draw(); return; }
            marker.opacity(opacity);
            layer.draw();
        }, 40);
    }
    showToast('Jumped to MD ' + md.toFixed(1) + ' m', 'info');
}

// ═══════════════════════════════════════════════════════
//  ACCORDION
// ═══════════════════════════════════════════════════════
function toggleAccordion(headerEl) {
    const acc = headerEl.closest('.accordion');
    if (acc) acc.classList.toggle('open');
}

// ═══════════════════════════════════════════════════════
//  BADGE COUNTS
// ═══════════════════════════════════════════════════════
function updateBadgeCounts() {
    const cb = document.getElementById('casing-count');
    const ob = document.getElementById('openhole-count');
    const tb = document.getElementById('traj-count');
    const lb = document.getElementById('logs-count');
    if (cb) cb.textContent = casingData.length;
    if (ob) ob.textContent = openHoleData.length;
    if (tb) tb.textContent = currentTrajectory.length;
    if (lb) lb.textContent = logsData.length;
}

// ═══════════════════════════════════════════════════════
//  SIDEBAR RESIZE (drag right edge)
// ═══════════════════════════════════════════════════════
function initSidebarResize() {
    const handle = document.getElementById('sidebar-resize-handle');
    const sidebar = document.querySelector('.sidebar');
    if (!handle || !sidebar) return;

    let startX, startW, dragging = false;

    handle.addEventListener('mousedown', (e) => {
        if (sidebar.classList.contains('collapsed')) return;
        e.preventDefault();
        dragging = true;
        startX = e.clientX;
        startW = sidebar.offsetWidth;
        handle.classList.add('dragging');
        sidebar.style.transition = 'none';
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const delta = e.clientX - startX;
        const newW = Math.max(280, Math.min(800, startW + delta));
        sidebar.style.width = newW + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging = false;
        handle.classList.remove('dragging');
        sidebar.style.transition = '';
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        // Persist width
        try { localStorage.setItem('cv2_sidebar_width', sidebar.offsetWidth); } catch (_) {}
        if (stage) {
            const c = document.getElementById('container');
            stage.width(c.offsetWidth);
            stage.height(c.offsetHeight);
            drawDynamicAxes();
        }
    });

    // Restore persisted width
    try {
        const saved = localStorage.getItem('cv2_sidebar_width');
        if (saved && !sidebar.classList.contains('collapsed')) {
            sidebar.style.width = saved + 'px';
        }
    } catch (_) {}
}

// ═══════════════════════════════════════════════════════
//  INITIALIZATION
// ═══════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
    const hasState = loadFromLocalStorage();

    if (!hasState) {
        // Parse default trajectory
        const parsed = [];
        initialTrajectoryRaw.split('\n').forEach(line => {
            const parts = line.trim().split(/[,\t ]+/);
            if (parts.length >= 2) parsed.push({ md: parseFloat(parts[0]), tvd: parseFloat(parts[1]) });
        });
        recalculateTrajectory(parsed, "md-tvd");
    }

    // Initialize Konva (defined in renderer.js)
    if (typeof Konva !== 'undefined') {
        initKonva();
        loadAssetsAndRender();
        initMinimapClick();
    } else {
        alert("Error: Konva drawing library blocked. Try opening outside of strict environments.");
    }

    renderWellboreTables();
    renderTrajectoryTable();
    renderTable();
    initLogs();
    updateUndoRedoButtons();
    initPanelResize();
    initSidebarResize();
    updateStatusBar();

    document.addEventListener('keydown', handleKeyboard);

    // Attach paste handler to import textarea
    var importTA = document.getElementById('import-raw-textarea');
    if (importTA) importTA.addEventListener('paste', handleImportPaste);

    // Context menu: close on click elsewhere
    document.addEventListener('click', hideContextMenu);
    // Context menu: item actions
    document.getElementById('context-menu').addEventListener('click', (e) => {
        const item = e.target.closest('.context-menu-item');
        if (item) handleContextMenuAction(item.dataset.action);
    });

    // v2: Try auto-loading CSD-db.xlsx from same folder
    autoLoadExcel();

    // Initialize data source mode UI, then restore saved selection
    if (window._pendingSelection) {
        const sel = window._pendingSelection;
        document.getElementById('data-mode').value = sel.mode;
        _dataSourceMode = sel.mode;
        onModeChange();
        // Wait for refreshLocalDropdowns (async) to finish, then restore
        restoreSelectionAfterRefresh(sel);
    } else {
        onModeChange();
    }
});

/** Wait until _localHierarchy is populated (or timeout), then restore dropdowns */
async function restoreSelectionAfterRefresh(sel) {
    // Wait for refreshLocalDropdowns to complete (up to 2s)
    var attempts = 0;
    while (!window._localHierarchy && attempts < 40) {
        await new Promise(function(r) { setTimeout(r, 50); });
        attempts++;
    }

    var fieldEl = document.getElementById('field-select');
    if (sel.field && fieldEl) {
        if (![...fieldEl.options].some(function(o) { return o.value === sel.field; })) {
            var o = document.createElement('option'); o.value = sel.field; o.textContent = sel.field;
            fieldEl.appendChild(o);
        }
        fieldEl.value = sel.field;
        onFieldChange();
    }

    var wellEl = document.getElementById('well-select');
    if (sel.well && wellEl) {
        if (![...wellEl.options].some(function(o) { return o.value === sel.well; })) {
            var o = document.createElement('option'); o.value = sel.well; o.textContent = sel.well;
            wellEl.appendChild(o);
        }
        wellEl.value = sel.well;
        onWellChange();
    }

    var wbEl = document.getElementById('wellbore-select');
    if (sel.wellbore && wbEl) {
        if (![...wbEl.options].some(function(o) { return o.value === sel.wellbore; })) {
            var o = document.createElement('option'); o.value = sel.wellbore; o.textContent = sel.wellbore;
            wbEl.appendChild(o);
        }
        wbEl.value = sel.wellbore;
    }

    updateWellSelectorLabel();
    delete window._pendingSelection;
}
