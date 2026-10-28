/* CompletionView 2.0 — Excel Data Source (CSD-db.xlsx) */

// ═══════════════════════════════════════════════════════
//  DATA SOURCE MODE
// ═══════════════════════════════════════════════════════
let _dataSourceMode = 'local'; // 'local' | 'akerbp'

// ═══════════════════════════════════════════════════════
//  INDEXED-DB LOCAL WELL STORAGE
// ═══════════════════════════════════════════════════════
const IDB_NAME = 'CompletionViewDB';
const IDB_VERSION = 1;
const IDB_STORE = 'wells';

function _openDB() {
    return new Promise(function (resolve, reject) {
        var req = indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = function (e) {
            var db = e.target.result;
            if (!db.objectStoreNames.contains(IDB_STORE)) {
                db.createObjectStore(IDB_STORE, { keyPath: 'key' });
            }
        };
        req.onsuccess = function (e) { resolve(e.target.result); };
        req.onerror = function (e) { reject(e.target.error); };
    });
}

/** Build a storage key from field/well/wellbore */
function _wellKey(field, well, wellbore) {
    return field + '/' + well + '/' + wellbore + '/local';
}

/** Save a well record to IndexedDB */
async function localDB_save(field, well, wellbore, data) {
    var db = await _openDB();
    return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, 'readwrite');
        var store = tx.objectStore(IDB_STORE);
        var record = {
            key: _wellKey(field, well, wellbore),
            field: field,
            well: well,
            wellbore: wellbore,
            revision: 'local',
            savedAt: new Date().toISOString(),
            state: data
        };
        var req = store.put(record);
        req.onsuccess = function () { resolve(); };
        req.onerror = function (e) { reject(e.target.error); };
    });
}

/** Load a well record from IndexedDB */
async function localDB_load(field, well, wellbore) {
    var db = await _openDB();
    return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, 'readonly');
        var store = tx.objectStore(IDB_STORE);
        var req = store.get(_wellKey(field, well, wellbore));
        req.onsuccess = function (e) { resolve(e.target.result || null); };
        req.onerror = function (e) { reject(e.target.error); };
    });
}

/** Delete a well record from IndexedDB */
async function localDB_delete(field, well, wellbore) {
    var db = await _openDB();
    return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, 'readwrite');
        var store = tx.objectStore(IDB_STORE);
        var req = store.delete(_wellKey(field, well, wellbore));
        req.onsuccess = function () { resolve(); };
        req.onerror = function (e) { reject(e.target.error); };
    });
}

/** Get all saved well records — returns array of records */
async function localDB_getAll() {
    var db = await _openDB();
    return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, 'readonly');
        var store = tx.objectStore(IDB_STORE);
        var req = store.getAll();
        req.onsuccess = function (e) { resolve(e.target.result || []); };
        req.onerror = function (e) { reject(e.target.error); };
    });
}

/** Build a hierarchy object from local DB records */
function localDB_buildHierarchy(records) {
    var h = {};
    records.forEach(function (rec) {
        if (!h[rec.field]) h[rec.field] = {};
        if (!h[rec.field][rec.well]) h[rec.field][rec.well] = [];
        if (h[rec.field][rec.well].indexOf(rec.wellbore) === -1) {
            h[rec.field][rec.well].push(rec.wellbore);
        }
    });
    return h;
}

// ═══════════════════════════════════════════════════════
//  EXCEL DATA STORE
// ═══════════════════════════════════════════════════════
let _excelRows = [];           // All rows from main sheet
let _screenJointRows = [];     // Rows from segmented screens sheet (e.g. "A-10 (rev 1.12)-Screens")
let _wellHierarchy = null;     // { field: { well: [wellbore, ...] } }
const SCREEN_JOINTS_SHEET = 'A-10 (rev 1.12)-Screens'; // sheet name for segmented screens

// ═══════════════════════════════════════════════════════
//  LOAD EXCEL FILE
// ═══════════════════════════════════════════════════════

/** Handle file input change — reads the selected .xlsx and parses it. */
function handleExcelFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    loadExcelFromFile(file);
}

/** Auto-load CSD-db.xlsx from the same folder (works when served via HTTP). */
async function autoLoadExcel() {
    loadSymbolMap(); // async — overlaps with Excel fetch
    try {
        showLoadingBar('Loading CSD-db.xlsx...', 10);
        const response = await fetch('CSD-db.xlsx');
        if (!response.ok) {
            hideLoadingBar();
            promptExcelLoad();
            return false;
        }
        const arrayBuffer = await response.arrayBuffer();
        updateLoadingBar(50, 'Parsing spreadsheet...');
        parseExcelBuffer(arrayBuffer);
        return true;
    } catch (e) {
        hideLoadingBar();
        promptExcelLoad();
        return false;
    }
}

/** Show error if auto-load fails */
function promptExcelLoad() {
    showToast('Could not load CSD-db.xlsx — make sure the file is in the same folder and use a local web server (e.g. Live Server)', 'error');
}

function loadExcelFromFile(file) {
    showLoadingBar('Reading ' + file.name + '...', 10);
    const reader = new FileReader();
    reader.onload = function (e) {
        updateLoadingBar(50, 'Parsing spreadsheet...');
        parseExcelBuffer(e.target.result);
    };
    reader.onerror = function () {
        hideLoadingBar();
        showToast('Failed to read file', 'error');
    };
    reader.readAsArrayBuffer(file);
}

function parseExcelBuffer(buffer) {
    try {
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        _excelRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        // Load segmented screens sheet if present
        if (workbook.Sheets[SCREEN_JOINTS_SHEET]) {
            _screenJointRows = XLSX.utils.sheet_to_json(workbook.Sheets[SCREEN_JOINTS_SHEET], { defval: '' });
            console.info('[CompletionView] Screen joints sheet loaded: ' + _screenJointRows.length + ' rows');
        } else {
            _screenJointRows = [];
        }

        updateLoadingBar(80, 'Building well hierarchy...');
        _wellHierarchy = buildWellHierarchy(_excelRows);
        populateFieldDropdown(_wellHierarchy);

        updateLoadingBar(100, 'Ready');
        setTimeout(hideLoadingBar, 600);
        showToast(_excelRows.length + ' rows loaded from spreadsheet', 'success');
    } catch (err) {
        hideLoadingBar();
        showToast('Excel parse error: ' + err.message, 'error');
        console.error('Excel parse error:', err);
    }
}

// ═══════════════════════════════════════════════════════
//  HIERARCHY BUILDER
// ═══════════════════════════════════════════════════════

function buildWellHierarchy(rows) {
    const hierarchy = {};
    rows.forEach(row => {
        const field = (row.field_name || '').toString().trim() || 'Unknown';
        const well = (row.well_name || '').toString().trim() || 'Unknown';
        const wellbore = (row.wellbore_name || '').toString().trim() || well;
        if (!hierarchy[field]) hierarchy[field] = {};
        if (!hierarchy[field][well]) hierarchy[field][well] = [];
        if (!hierarchy[field][well].includes(wellbore)) {
            hierarchy[field][well].push(wellbore);
        }
    });
    const sorted = {};
    Object.keys(hierarchy).sort().forEach(field => {
        sorted[field] = {};
        Object.keys(hierarchy[field]).sort().forEach(well => {
            sorted[field][well] = hierarchy[field][well].sort();
        });
    });
    return sorted;
}

// ═══════════════════════════════════════════════════════
//  DESCRIPTION → COMPONENT TYPE MAPPING
//  Loaded from symbol-map.json at startup; hardcoded map
//  below acts as the built-in fallback.
// ═══════════════════════════════════════════════════════
let _symbolMapPriority = [
    'screen hanger packer', 'screen hanger', 'screen packer',
    'screen saver', 'fishbone', 'fishbones',
    'trscssv', 'trsv', 'safety valve', 'scssv',
    'side pocket mandrel', 'side pocket mandre', 'spm',
    'gas lift mandrel', 'chemical injection mandrel',
    'gauge mandrel', 'gauge carrier', 'dual gauge',
    'icv', 'interval control valve',
    'swell packer', 'swell right', 'wai packer', 'versa trieve packer',
    'annulus safety valve',
    'sliding sleeve', 'sliding side door',
];

/** Try loading symbol-map.json; updates live map silently on success */
function loadSymbolMap() {
    fetch('symbol-map.json')
        .then(r => { if (!r.ok) throw new Error('not found'); return r.json(); })
        .then(data => {
            if (data && data.keywords && typeof data.keywords === 'object') {
                // Merge: JSON entries override built-ins, unknown keys are added
                Object.assign(SYMBOL_TYPE_MAP, data.keywords);
            }
            if (data && Array.isArray(data._priority)) {
                _symbolMapPriority = data._priority;
            }
            console.info('[CompletionView] symbol-map.json loaded (' + Object.keys(data.keywords || {}).length + ' entries)');
        })
        .catch(() => {
            // No JSON file present — built-in map in use (silent)
        });
}

const SYMBOL_TYPE_MAP = {
    // ─── Screens ───
    'sand screen': 'Screen',
    'screen': 'Screen',
    'screen joint': 'Screen',
    'sand control screen': 'Screen',
    'wire wrapped screen': 'Screen',
    'wire wrap screen': 'Screen',
    'premium screen': 'Screen',
    'flowmax': 'Screen',
    'flosure': 'Screen',
    'floreg': 'Screen',
    'resflow': 'Screen',
    'rescheck': 'Screen',
    'icd screen': 'Screen',
    'icd': 'Screen',
    'inflow control device': 'Screen',
    'aicd': 'Screen',
    'sliding sleeve': 'Screen',
    'sliding side door': 'Screen',
    'ssd': 'Screen',
    'sand screens': 'Screen',
    // ─── Blank Pipe ───
    'generic pup joint': 'Blank Pipe',
    'pup joint': 'Blank Pipe',
    'blank pipe': 'Blank Pipe',
    'tubing': 'Blank Pipe',
    'tubing joint': 'Blank Pipe',
    'production tubing': 'Blank Pipe',
    'landing joint': 'Blank Pipe',
    'hanger pup joint': 'Blank Pipe',
    'liner hanger pup joint': 'Blank Pipe',
    'coupling': 'Blank Pipe',
    'collar': 'Blank Pipe',
    'handling pup joint': 'Blank Pipe',
    'spacer pup joint': 'Blank Pipe',
    'space out pup joint': 'Blank Pipe',
    'saver pup joint': 'Blank Pipe',
    'flush joint': 'Blank Pipe',
    'fjl joint': 'Blank Pipe',
    'stinger tubing': 'Blank Pipe',
    'splice sub': 'Blank Pipe',
    'sub assy': 'Blank Pipe',
    'spacer joint': 'Blank Pipe',
    'fast connector': 'Blank Pipe',
    'fast joint': 'Blank Pipe',
    'upper fast': 'Blank Pipe',
    'lower fast': 'Blank Pipe',
    'seal stem': 'Blank Pipe',
    'seal mandrel': 'Blank Pipe',
    'seal stinger': 'Blank Pipe',
    'pbr': 'Blank Pipe',
    'polished bore': 'Blank Pipe',
    'tubing hanger': 'Blank Pipe',
    'landing nipple': 'Blank Pipe',
    'profile nipple': 'Blank Pipe',
    'nipple': 'Blank Pipe',
    'locator nipple': 'Blank Pipe',
    'locator sub': 'Blank Pipe',
    'latch mandrel': 'Blank Pipe',
    'relief valve': 'Blank Pipe',
    'circulation valve': 'Blank Pipe',
    'float collar': 'Blank Pipe',
    'shroud': 'Blank Pipe',
    'torque sleeve': 'Blank Pipe',
    'swab cups': 'Blank Pipe',
    'bumper sub': 'Blank Pipe',
    'anchor': 'Blank Pipe',
    'backbone anchor': 'Blank Pipe',
    'rupture disc': 'Blank Pipe',
    'activation sub': 'Blank Pipe',
    'setting adapter': 'Blank Pipe',
    'time coupling': 'Blank Pipe',
    'crimp clamp': 'Blank Pipe',
    'tally': 'Blank Pipe',
    'space - space': 'Blank Pipe',
    'tracer carrier': 'Blank Pipe',
    'liner hanger': 'Blank Pipe',
    'versaflex': 'Blank Pipe',
    'stinger bullnose': 'Bull Nose',
    'optibarrier': 'Blank Pipe',
    'toolserv': 'Blank Pipe',
    'fluid loss': 'Blank Pipe',
    'screen saver': 'Blank Pipe',
    // ─── Swell Packer ───
    'swell packer': 'Swell Packer',
    'swellpacker': 'Swell Packer',
    'swell right': 'Swell Packer',
    'external casing packer': 'Swell Packer',
    'inflatable packer': 'Swell Packer',
    'packer': 'Swell Packer',
    'production packer': 'Swell Packer',
    'liner hanger packer': 'Swell Packer',
    'screen hanger packer': 'Swell Packer',
    'screen packer': 'Swell Packer',
    'screen hanger': 'Swell Packer',
    'wai packer': 'Swell Packer',
    'hhc packer': 'Swell Packer',
    'mft production packer': 'Swell Packer',
    'versa trieve packer': 'Swell Packer',
    'qmax packer': 'Swell Packer',
    'annulus safety valve': 'Swell Packer',
    // ─── ME Plug ───
    'plug': 'ME Plug',
    'bridge plug': 'ME Plug',
    'cement retainer': 'ME Plug',
    'no-go sub': 'ME Plug',
    'nogo sub': 'ME Plug',
    // ─── Bull Nose ───
    'bull nose': 'Bull Nose',
    'bullnose': 'Bull Nose',
    'solid bullnose': 'Bull Nose',
    'float shoe': 'Bull Nose',
    'guide shoe': 'Bull Nose',
    'guide pilot': 'Bull Nose',
    'guidepilot': 'Bull Nose',
    'mule shoe': 'Bull Nose',
    'muleshoe': 'Bull Nose',
    'self aligning mule shoe': 'Bull Nose',
    'self aligning muleshoe': 'Bull Nose',
    'self aligning guide shoe': 'Bull Nose',
    'scoophead': 'Bull Nose',
    'wireline re-entry guide': 'Bull Nose',
    'wireline entry guide': 'Bull Nose',
    'wl re-entry guide': 'Bull Nose',
    're-entry guide shoe': 'Bull Nose',
    'reamer shoe': 'Bull Nose',
    'penotrator reamer shoe': 'Bull Nose',
    // ─── Cross Over ───
    'cross over': 'Cross Over',
    'crossover': 'Cross Over',
    'x-over': 'Cross Over',
    'xo': 'Cross Over',
    'xover': 'Cross Over',
    'cross-over sub': 'Cross Over',
    'x-over joint': 'Cross Over',
    'xo pup': 'Cross Over',
    'x-over pup': 'Cross Over',
    'xo pup joint': 'Cross Over',
    'x-over pup joint': 'Cross Over',
    'x-over for mlt': 'Cross Over',
    // ─── Side Pocket Mandrel (SPM) ───
    'side pocket mandrel': 'SPM',
    'side pocket mandre': 'SPM',
    'spm': 'SPM',
    'gas lift mandrel': 'SPM',
    'chemical injection mandrel': 'SPM',
    // ─── Safety Valve (TRSCSSV) ───
    'trscssv': 'Safety Valve',
    'trsv': 'Safety Valve',
    'safety valve': 'Safety Valve',
    'scssv': 'Safety Valve',
    // ─── Gauge Mandrel ───
    'gauge mandrel': 'Gauge',
    'gauge carrier': 'Gauge',
    'dual gauge mandrel': 'Gauge',
    'dual gauge': 'Gauge',
    'tubing/annulus gauge': 'Gauge',
    'opsis gauge': 'Gauge',
    // ─── Fishbone ───
    'fishbone': 'Fishbone',
    'fishbones': 'Fishbone',
    'fishbone drilling sub': 'Fishbone',
    'fishbones sub': 'Fishbone',
    'fishbone catcher': 'Fishbone',
    // ─── ICV ───
    'icv': 'ICV',
    'interval control valve': 'ICV',
};

function mapComponentType(description) {
    const desc = (description || '').toLowerCase().trim();

    // Try exact match
    if (SYMBOL_TYPE_MAP[desc]) return SYMBOL_TYPE_MAP[desc];

    // Priority-ordered partial match to avoid false positives
    // (e.g. "screen hanger" should match packer before screen)
    for (const key of _symbolMapPriority) {
        if (desc.includes(key) && SYMBOL_TYPE_MAP[key]) return SYMBOL_TYPE_MAP[key];
    }

    // General partial match
    for (const [key, type] of Object.entries(SYMBOL_TYPE_MAP)) {
        if (desc.includes(key)) return type;
    }

    return 'Blank Pipe';
}

// ═══════════════════════════════════════════════════════
//  SEGMENTED SCREEN SPLITTER
// ═══════════════════════════════════════════════════════
/**
 * For each Screen component in wellDataArr, check whether _screenJointRows
 * contains individual joints whose MD range falls within (or overlaps) the
 * grouped screen's MD range (with a small tolerance). If matching joints are
 * found they replace the single grouped entry; otherwise the original entry
 * is kept unchanged.
 *
 * Screen sheet columns expected (same as main sheet):
 *   mdtoptorkb_m  length_m  minid_in  maxod_in  description  matspec  threads  comments  serial_no
 */
function splitScreensByJoints(wellDataArr, startMD) {
    if (!_screenJointRows || _screenJointRows.length === 0) return wellDataArr;

    const TOLERANCE = 0.5; // metres — allowed MD boundary mismatch
    const result = [];
    let runMD = startMD;

    wellDataArr.forEach(function(comp) {
        const compBotMD = runMD + comp.length_m;

        if (comp.type === 'Screen') {
            // Find joints from the screen sheet whose top MD falls within this grouped screen
            const joints = _screenJointRows.filter(function(r) {
                const jTop = num(r.mdtoptorkb_m);
                return jTop >= (runMD - TOLERANCE) && jTop < (compBotMD + TOLERANCE);
            });

            // Sort by top MD
            joints.sort((a, b) => num(a.mdtoptorkb_m) - num(b.mdtoptorkb_m));

            if (joints.length > 1) {
                // Replace grouped screen with individual joints
                joints.forEach(function(r) {
                    let od = num(r.maxod_in);
                    const id = num(r.minid_in);
                    const length = num(r.length_m);
                    if (od === 0) od = parseODFromDescription(r.description) || comp.od_inch;
                    if (od === 0 && id > 0) od = id + 1.0;

                    result.push({
                        type: 'Screen',
                        length_m: Math.round(length * 100) / 100,
                        od_inch: Math.round((od || comp.od_inch) * 1000) / 1000,
                        id_inch: Math.round((id || comp.id_inch) * 1000) / 1000,
                        hasSP: comp.hasSP,
                        hasTracerCarrier: comp.hasTracerCarrier,
                        hasICD: comp.hasICD,
                        _csd: {
                            description: (r.description || comp._csd.description),
                            mdTop: num(r.mdtoptorkb_m),
                            matSpec: r.matspec || comp._csd.matSpec,
                            threads: r.threads || comp._csd.threads,
                            comments: r.comments || '',
                            serialNo: r.serial_no || '',
                            zone: comp._csd.zone,
                            sequence: comp._csd.sequence,
                        }
                    });
                });
            } else {
                // No segmented data — keep grouped entry as-is
                result.push(comp);
            }
        } else {
            result.push(comp);
        }

        runMD = compBotMD;
    });

    return result;
}

// ═══════════════════════════════════════════════════════
//  EXCEL ROWS → CompletionView DATA
// ═══════════════════════════════════════════════════════

function num(val, fallback) {
    const n = parseFloat(val);
    return isNaN(n) ? (fallback || 0) : n;
}

/**
 * Parse nominal pipe size from a CSD description string.
 * Looks for patterns like 7", 5 1/2", 5-1/2", 5.5", 6 5/8", 3,5"
 * Returns OD in inches or 0 if not found.
 */
function parseODFromDescription(description) {
    const desc = (description || '').toString();

    // Common OD lookup: nominal size → typical OD
    const nominalToOD = {
        '3.5': 3.5, '3-1/2': 3.5, '3 1/2': 3.5, '3,5': 3.5,
        '4': 4.0, '4"': 4.0,
        '4.5': 4.5, '4-1/2': 4.5, '4 1/2': 4.5, '4,5': 4.5,
        '5': 5.0,
        '5.5': 5.5, '5-1/2': 5.5, '5 1/2': 5.5, '5,5': 5.5,
        '6.625': 6.625, '6-5/8': 6.625, '6 5/8': 6.625, '6,625': 6.625,
        '7': 7.0,
        '7.625': 7.625, '7-5/8': 7.625, '7 5/8': 7.625,
        '9.625': 9.625, '9-5/8': 9.625, '9 5/8': 9.625,
        '10.75': 10.75, '10-3/4': 10.75, '10 3/4': 10.75,
    };

    // Try matching fraction patterns: X-Y/Z" or X Y/Z"
    const fracPattern = /(\d+)[-\s](\d+)\/(\d+)["\u201d]/;
    const fracMatch = desc.match(fracPattern);
    if (fracMatch) {
        const val = parseInt(fracMatch[1]) + parseInt(fracMatch[2]) / parseInt(fracMatch[3]);
        if (val >= 2 && val <= 15) return Math.round(val * 1000) / 1000;
    }

    // Try matching decimal with comma: X,Y"
    const commaPattern = /(\d+),(\d+)["\u201d]/;
    const commaMatch = desc.match(commaPattern);
    if (commaMatch) {
        const val = parseFloat(commaMatch[1] + '.' + commaMatch[2]);
        if (val >= 2 && val <= 15) return val;
    }

    // Try matching simple decimal: X.Y" or just X"
    const decPattern = /(\d+\.?\d*)["\u201d]\s*\d/;
    const decMatch = desc.match(decPattern);
    if (decMatch) {
        const val = parseFloat(decMatch[1]);
        if (val >= 2 && val <= 15) return val;
    }

    // Try leading pipe size: starts with number + quote
    const leadPattern = /^(\d+\.?\d*)["\u201d]/;
    const leadMatch = desc.match(leadPattern);
    if (leadMatch) {
        const val = parseFloat(leadMatch[1]);
        if (val >= 2 && val <= 15) return val;
    }

    return 0;
}

/**
 * Get available revisions for a well/wellbore, sorted ascending.
 * Returns array of { revision, revisionType, lastUpdate } objects.
 */
function getRevisionsForWellbore(well, wellbore) {
    const rows = _excelRows.filter(r =>
        (r.well_name || '').toString().trim() === well &&
        (r.wellbore_name || '').toString().trim() === wellbore
    );
    const revMap = {};
    rows.forEach(r => {
        const rev = (r.revision || '').toString().trim();
        if (!rev) return;
        if (!revMap[rev]) {
            revMap[rev] = {
                revision: rev,
                revisionType: (r.revision_type || '').toString().trim(),
                lastUpdate: (r.last_update_date || '').toString().trim(),
            };
        }
    });
    return Object.values(revMap).sort((a, b) => parseFloat(a.revision) - parseFloat(b.revision));
}

/**
 * Load completion data for a given well/wellbore from cached Excel rows.
 * If revision is provided, only load rows matching that revision.
 */
function loadCompletionFromExcel(well, wellbore, revision) {
    let rows = _excelRows.filter(r =>
        (r.well_name || '').toString().trim() === well &&
        (r.wellbore_name || '').toString().trim() === wellbore
    );

    // Filter by revision if specified
    if (revision) {
        rows = rows.filter(r => (r.revision || '').toString().trim() === revision);
    }

    if (rows.length === 0) {
        showToast('No data found for ' + wellbore, 'warning');
        return null;
    }

    // Sort by element_sequence
    rows.sort((a, b) => num(a.element_sequence) - num(b.element_sequence));

    const mapped = {
        wellData: [],
        startMD: 0,
        metadata: {
            wellbore: wellbore,
            revision: rows[0].revision || '',
            revisionType: rows[0].revision_type || '',
            lastUpdate: rows[0].last_update_date || '',
        }
    };

    mapped.wellData = rows.map(row => {
        const compType = mapComponentType(row.description);
        const mdTop = num(row.mdtoptorkb_m);
        const length = num(row.length_m);
        let od = num(row.maxod_in);
        const id = num(row.minid_in);

        // Infer OD from description if missing
        if (od === 0) {
            od = parseODFromDescription(row.description);
        }
        // If still missing but we have ID, estimate OD (typical tubing wall ~0.5-1")
        if (od === 0 && id > 0) {
            od = id + 1.0;
        }

        const desc = (row.description || '').toLowerCase();
        const hasSP = desc.includes('swell') || (desc.includes('packer') && compType === 'Screen');
        const hasTC = desc.includes('tracer');
        const hasICD = desc.includes('icd') || desc.includes('inflow control');

        return {
            type: compType,
            length_m: Math.round(length * 100) / 100,
            od_inch: Math.round(od * 1000) / 1000,
            id_inch: Math.round(id * 1000) / 1000,
            hasSP: hasSP,
            hasTracerCarrier: hasTC,
            hasICD: hasICD,
            _csd: {
                description: row.description || '',
                mdTop: mdTop,
                tvdTop: num(row.tvdtoptorkb_m),
                angle: num(row.angle_deg),
                drift: num(row.drift_in),
                matSpec: row.matspec || '',
                threads: row.threads || '',
                comments: row.comments || '',
                serialNo: row.serial_no || '',
                zone: row.zone || '',
                installDate: row.install_date || '',
                guid: row.guid || '',
                sequence: num(row.element_sequence),
            }
        };
    });

    // Start MD from first element
    if (rows.length > 0) {
        mapped.startMD = num(rows[0].mdtoptorkb_m);
    }

    // Optionally replace grouped Screen entries with individual joints
    const splitToggle = document.getElementById('split-screens');
    if (splitToggle && splitToggle.checked && _screenJointRows.length > 0) {
        mapped.wellData = splitScreensByJoints(mapped.wellData, mapped.startMD);
    }

    return mapped;
}

// ═══════════════════════════════════════════════════════
//  DROPDOWN HELPERS
// ═══════════════════════════════════════════════════════

function populateFieldDropdown(hierarchy) {
    const fieldSel = document.getElementById('field-select');
    if (!fieldSel) return;

    const currentField = fieldSel.value;
    fieldSel.innerHTML = '<option value="">\u2014 Field \u2014</option>';

    Object.keys(hierarchy).forEach(field => {
        const o = document.createElement('option');
        o.value = field;
        o.textContent = field;
        if (field === currentField) o.selected = true;
        fieldSel.appendChild(o);
    });

    if (currentField && hierarchy[currentField]) {
        onFieldChange();
    }
}

// ═══════════════════════════════════════════════════════
//  LOADING BAR
// ═══════════════════════════════════════════════════════

function showLoadingBar(message, progress) {
    const bar = document.getElementById('loading-bar');
    const barFill = document.getElementById('loading-bar-fill');
    const barText = document.getElementById('loading-bar-text');
    if (bar) {
        bar.style.display = 'flex';
        barFill.style.width = Math.min(100, Math.max(0, progress || 0)) + '%';
        barText.textContent = message || 'Loading...';
    }
}

function updateLoadingBar(progress, message) {
    const barFill = document.getElementById('loading-bar-fill');
    const barText = document.getElementById('loading-bar-text');
    if (barFill) barFill.style.width = Math.min(100, progress) + '%';
    if (barText && message) barText.textContent = message;
}

function hideLoadingBar() {
    const bar = document.getElementById('loading-bar');
    if (bar) bar.style.display = 'none';
}
