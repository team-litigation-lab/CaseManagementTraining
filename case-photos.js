/* =========================================================
   LSH CMS — MOCK PHOTOS FOR THE TRAINING LIBRARY'S FILES
   ---------------------------------------------------------
   Drawn here (SVG), from each file in mock-cases.js, so they always match
   the file; every one is marked as a mock training photo. The library's
   clients are fictional: nothing here is a photo of a real person or car.
   Once an Admin has made a realistic photo for one (library-photos.js),
   it is shown instead (href below), with the same labels.
     - portrait(mc): the photo on the client's mock ID (client-id.js): a
       head-and-shoulders portrait; its look (she or he as the file says,
       age from the date of birth, skin tone and hair) is fixed per client
       (looksOf, which also describes the client for a realistic photo).
     - scene(mc, href): the crash scene of a vehicle-crash file: the
       vehicles where they stopped, the debris, the signal or stop sign,
       the street.
     - vehiclePhoto(mc, p, n, href): a photo of one vehicle and its damage
       (pd-photos.js: the file's pdPhotos, or CRASH[id].photos for a file
       without a property damage block, e.g. a pedestrian or a passenger).
   CRASH below says, for every MVA file (and the motorcycle and pedestrian
   files), how the crash happened, where, and each vehicle's body and
   color; the year, make and model come from the file's pd block when it
   has one. .github/scripts/check-data.mjs checks it against the files.
   ========================================================= */
(function (root) {
    'use strict';
    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    function hash(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
    function rng(seed) { let s = seed >>> 0 || 1; return () => { s = Math.imul(s ^ (s >>> 15), 2246822507) >>> 0; s = Math.imul(s ^ (s >>> 13), 3266489909) >>> 0; return ((s ^ (s >>> 16)) >>> 0) / 4294967296; }; }
    const f1 = (n) => (Math.round(n * 10) / 10).toString();

    /* ---------- how each MVA file's crash happened ---------- */
    // type: rear-end | t-bone | head-on | sideswipe | backing | pedestrian | chain | hit-and-run | left-turn (the other
    //       vehicle turned across the client's path: its side was hit)
    // setting: intersection | highway | road | parking | gas station | crosswalk
    // client / other / third: the vehicles (body and label only when the file has no pd block for it); hit: where it was hit
    // photos: the vehicle photos of a file without a pd block (pdPhotos' shape)
    const CRASH = {
        'MC-01': { type: 'rear-end', place: 'Peachtree Ave', setting: 'intersection', signal: 'red', client: { color: 'blue', hit: 'rear' }, other: { color: 'white', hit: 'front' } },
        'MC-04': { type: 't-bone', place: 'Oak St & 5th Ave', setting: 'intersection', signal: 'stop', client: { color: 'gray', hit: 'right side' }, other: { color: 'red', hit: 'front' } },
        'MC-06': { type: 'sideswipe', place: 'I-85', setting: 'highway', client: { color: 'silver', hit: 'left side' }, other: { color: 'white', hit: 'front right' } },
        'MC-07': { type: 'hit-and-run', place: 'Riverton (hit-and-run: a dark SUV, no plate)', setting: 'road',
            client: { body: 'sedan', label: 'RideNow rideshare car', color: 'black', hit: 'rear left' },
            photos: [{ vehicle: 'client', area: 'rear left', caption: 'The rideshare car: rear door and quarter panel pushed in (the SUV drove off)' }] },
        'MC-08': { type: 'left-turn', place: 'an intersection (the SUV turned left across his lane)', setting: 'intersection', signal: 'red',
            client: { color: 'black', hit: 'front' }, other: { color: 'silver', hit: 'right side' } },
        'MC-11': { type: 't-bone', place: 'Summit & 3rd', setting: 'intersection', signal: 'red', client: { color: 'red', hit: 'left side' }, other: { color: 'black', hit: 'front' } },
        'MC-12': { type: 'backing', place: 'grocery store parking lot', setting: 'parking', client: { color: 'maroon', hit: 'rear left' }, other: { color: 'white', hit: 'rear' }, items: 'groceries' },
        'MC-14': { type: 'rear-end', place: 'I-75 (stopped traffic)', setting: 'highway', client: { color: 'white', hit: 'rear' }, other: { color: 'blue', hit: 'front' } },
        'MC-15': { type: 'pedestrian', place: 'Riverton Plaza parking lot', setting: 'parking', items: 'cane',
            other: { body: 'suv', label: "Heather Coyle's SUV", color: 'gray', hit: 'rear', reversing: true },
            photos: [{ vehicle: 'other', area: 'rear', caption: 'The SUV that was backing out: rear bumper and tailgate' }] },
        'MC-16': { type: 'rear-end', place: 'Highway 20', setting: 'highway', client: { color: 'white', hit: 'rear' }, other: { color: 'black', hit: 'front' } },
        'MC-19': { type: 'pedestrian', place: 'crosswalk (Riverton Transit, Route 4)', setting: 'crosswalk', signal: 'walk', items: 'bag',
            other: { body: 'bus', label: 'Riverton Transit bus · Route 4', color: 'white', hit: 'front right' },
            photos: [{ vehicle: 'other', area: 'front right', caption: 'Riverton Transit bus (Route 4): the front right corner that turned into the crosswalk' }] },
        'MC-20': { type: 'head-on', place: 'Route 9 (wrong-way driver)', setting: 'road', client: { color: 'gray', hit: 'front' }, other: { color: 'black', hit: 'front' } },
        'MC-25': { type: 't-bone', place: 'Brookside Ave & 12th St', setting: 'intersection', signal: 'red', client: { color: 'beige', hit: 'left side' }, other: { color: 'white', hit: 'front', decal: 'SWIFT PARCEL' } },
        'MC-26': { type: 't-bone', place: 'Brookside Ave & 12th St', setting: 'intersection', signal: 'red',
            client: { body: 'sedan', label: "2015 Toyota Camry (his father's)", color: 'beige', hit: 'left side' },
            other: { body: 'van', label: '2022 Ford Transit · Swift Parcel Co.', color: 'white', hit: 'front', decal: 'SWIFT PARCEL' },
            photos: [{ vehicle: 'client', area: 'left side', caption: "His father's Camry: the driver side, where the van hit" }, { vehicle: 'other', area: 'front', caption: "Swift Parcel Co. van: front end" }] },
        'MC-29': { type: 'head-on', place: 'Old Mill Road', setting: 'road', client: { color: 'blue', hit: 'front' }, other: { color: 'silver', hit: 'front' } },
        'MC-32': { type: 'chain', place: 'I-85', setting: 'highway', client: { color: 'gray', hit: 'rear' }, other: { color: 'black', hit: 'front' },
            third: { body: 'sedan', label: 'The car ahead (Unit 1)', color: 'white', hit: 'rear' } },
        'MC-33': { type: 't-bone', place: 'Ash St & 9th Ave', setting: 'intersection', signal: 'stop', client: { color: 'white', hit: 'left side' }, other: { color: 'blue', hit: 'front' } },
        'MC-36': { type: 'pedestrian', place: 'Harbor Street crosswalk', setting: 'crosswalk', signal: 'walk', items: 'bag',
            other: { body: 'van', label: 'FreshCart grocery delivery van', color: 'white', hit: 'front right', decal: 'FRESHCART' },
            photos: [{ vehicle: 'other', area: 'front right', caption: 'The FreshCart delivery van: the front right corner that turned into the crosswalk' }] },
        'MC-37': { type: 't-bone', place: 'Route 9 & Mill Road', setting: 'intersection', signal: 'stop', client: { color: 'silver', hit: 'right side' }, other: { color: 'red', hit: 'front' } },
        'MC-39': { type: 'rear-end', place: 'Harbor Street', setting: 'road', client: { color: 'blue', hit: 'rear' }, other: { color: 'silver', hit: 'front' } },
        'MC-41': { type: 't-bone', place: 'Oak St & 5th', setting: 'intersection', signal: 'red',
            client: { body: 'suv', label: "Kia Sorento (the Achesons' family car)", color: 'red', hit: 'left side' },
            other: { body: 'pickup', label: 'Dodge Ram (Terrence Boyd)', color: 'gray', hit: 'front' },
            photos: [{ vehicle: 'client', area: 'left side', caption: 'The family Sorento: driver side, by the rear seat where Cian sat' }, { vehicle: 'other', area: 'front', caption: "Terrence Boyd's Ram: front end" }] },
        'MC-42': { type: 'sideswipe', place: 'I-85', setting: 'highway',
            client: { body: 'suv', label: "Honda Pilot (his mother's)", color: 'navy', hit: 'right side' },
            other: { body: 'sedan', label: 'Chevy Malibu (Rick Soto)', color: 'silver', hit: 'front left' },
            photos: [{ vehicle: 'client', area: 'right side', caption: 'The Pilot: passenger side scraped and dented by the Malibu' }, { vehicle: 'other', area: 'front left', caption: "Rick Soto's Malibu: front left corner" }] },
        'MC-45': { type: 'rear-end', place: 'Peachtree Parkway', setting: 'intersection', signal: 'red', client: { color: 'black', hit: 'rear' }, other: { color: 'white', hit: 'front', decal: 'QUICKDROP' } },
        'MC-46': { type: 'sideswipe', place: 'Route 9', setting: 'road', client: { color: 'red', hit: 'left side' }, other: { color: 'gray', hit: 'right side' } },
        'MC-48': { type: 'head-on', place: 'Old Mill Road', setting: 'road', client: { color: 'red', hit: 'front' }, other: { color: 'green', hit: 'front' } },
        'MC-49': { type: 'rear-end', place: 'school-zone crosswalk', setting: 'crosswalk', signal: 'school',
            client: { body: 'suv', label: "Honda Pilot (his mother's)", color: 'navy', hit: 'rear' },
            other: { body: 'pickup', label: 'Ford F-250 (Gary Lund)', color: 'white', hit: 'front' },
            photos: [{ vehicle: 'client', area: 'rear', caption: 'The Pilot: tailgate and rear bumper pushed in' }, { vehicle: 'other', area: 'front', caption: "Gary Lund's F-250: front bumper and grille" }] },
        'MC-50': { type: 't-bone', place: 'Main St & 3rd', setting: 'intersection', signal: 'red', client: { color: 'white', hit: 'left side' }, other: { color: 'green', hit: 'front' } },
        'MC-51': { type: 'backing', place: 'Route 9 (pulling out of a gas station)', setting: 'gas station', client: { color: 'gray', hit: 'right side' }, other: { color: 'red', hit: 'rear' } },
        'MC-52': { type: 'rear-end', place: 'I-85', setting: 'highway', client: { color: 'blue', hit: 'rear' }, other: { color: 'white', hit: 'front' } }
    };

    /* ---------- paint ---------- */
    const PAINT = { white: [210, 12, 93], silver: [214, 9, 76], gray: [215, 8, 46], black: [222, 12, 13], red: [356, 70, 40], maroon: [348, 52, 26],
        blue: [212, 62, 38], navy: [222, 50, 22], green: [150, 32, 27], beige: [36, 32, 66], yellow: [45, 92, 52] };
    const hsl = (c, dl, ds) => `hsl(${c[0]},${Math.max(0, Math.min(100, c[1] + (ds || 0)))}%,${Math.max(2, Math.min(98, c[2] + (dl || 0)))}%)`;
    const paintOf = (name) => PAINT[name] || PAINT.silver;

    /* ---------- which body: from the make and model ---------- */
    const BODIES = [[/harley|motorcycle|street glide|yamaha|kawasaki|ducati|triumph|gsx/i, 'bike'], [/cascadia|vnl|tractor-trailer|semi/i, 'semi'], [/\bnpr\b|box truck/i, 'box'], [/\bbus\b/i, 'bus'],
        [/promaster|\btransit\b|sprinter|express van|\bvan\b/i, 'van'],
        [/tacoma|silverado|\bram\b|f-150|f-250|f150|pickup|frontier|tundra/i, 'pickup'],
        [/escape|rogue|cx-5|durango|sorento|tucson|cherokee|cr-v|pilot|wrangler|outback|explorer|rav4|highlander|tahoe|suburban|yukon|4runner|expedition|suv/i, 'suv']];
    const bodyOf = (label) => { for (const [re, b] of BODIES) if (re.test(label)) return b; return 'sedan'; };

    // A vehicle of the file: who ('client' | 'other' | 'third'), its label, body, paint and where it was hit
    function vehicleOf(mc, who) {
        const cr = CRASH[mc && mc.id] || {}, spec = cr[who] || {};
        const pd = (mc && mc.pd) || {}, v = who === 'other' ? pd.tp : who === 'client' ? pd.client : null;
        const label = spec.label || (v ? [v.year, v.make, v.model].filter(Boolean).join(' ') : '') || (who === 'other' ? 'Other vehicle' : 'Client vehicle');
        if (!spec.label && !v && !cr[who]) return null;
        const color = spec.color || (hash(label) % 2 ? 'silver' : 'white');
        return { who, label, plate: (v && v.plate) || '', body: spec.body || bodyOf(label), paint: paintOf(color), color,
            hit: spec.hit || '', decal: spec.decal || '', reversing: !!spec.reversing };
    }

    /* ---------- defs shared by every photo (gradients, the photo grain, the shadow) ---------- */
    function defs(id, extra) {
        return `<defs>
<filter id="${id}-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="${hash(id) % 97}" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  0 0 0 .09 0"/></filter>
<filter id="${id}-soft" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>
<filter id="${id}-blur1" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.2"/></filter>
<radialGradient id="${id}-vig" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".38"/></radialGradient>
<linearGradient id="${id}-glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b6b7c"/><stop offset=".55" stop-color="#26313d"/><stop offset="1" stop-color="#151c24"/></linearGradient>
<radialGradient id="${id}-rim" cx=".42" cy=".38" r=".7"><stop offset="0" stop-color="#f1f5f9"/><stop offset=".6" stop-color="#94a3b8"/><stop offset="1" stop-color="#475569"/></radialGradient>
<radialGradient id="${id}-dent" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset=".7" stop-color="#000" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
${extra || ''}</defs>`;
    }
    // the grain and vignette that make a drawing read as a photo
    const finish = (id, w, h) => `<rect width="${w}" height="${h}" filter="url(#${id}-grain)"/><rect width="${w}" height="${h}" fill="url(#${id}-vig)"/>`;

    /* ---------- the vehicles, side view (front to the right, wheels on y = ground) ---------- */
    // Each body: its outline, glass, door seams, lights, wheels, length and ground line.
    const SIDE = {
        sedan: { len: 420, ground: 163, wr: 27, wheels: [92, 330], cy: 136,
            body: 'M14,120 C12,104 18,96 34,94 L96,88 C120,70 140,58 176,54 L262,52 C292,53 312,66 336,86 L392,96 C408,99 414,108 414,118 L414,128 C414,133 410,136 404,136 L364,136 A34,34 0 0 0 296,136 L126,136 A34,34 0 0 0 58,136 L22,136 C16,136 14,132 14,126 Z',
            glass: ['M118,90 C134,72 150,62 178,60 L222,60 L222,90 Z', 'M230,60 L262,59 C286,60 304,72 322,90 L230,90 Z'],
            seams: ['M226,58 L226,134', 'M324,90 L322,134', 'M150,92 L148,134'], handles: [[244, 100], [168, 100]], belt: 'M100,93 L330,93',
            head: 'M396,100 L413,104 L413,113 L398,111 Z', tail: 'M15,104 L34,100 L34,110 L15,113 Z', mirror: 'M318,88 L336,84 L339,96 L322,98 Z', roof: 52 },
        suv: { len: 390, ground: 168, wr: 30, wheels: [90, 302], cy: 138,
            body: 'M14,126 C12,96 16,74 30,68 L60,64 C72,44 86,36 110,34 L276,34 C294,35 306,44 320,64 L362,76 C378,80 384,92 384,108 L384,130 C384,136 380,138 374,138 L340,138 A38,38 0 0 0 264,138 L128,138 A38,38 0 0 0 52,138 L22,138 C16,138 14,134 14,128 Z',
            glass: ['M66,66 C76,50 88,42 110,42 L144,42 L144,66 Z', 'M152,42 L206,42 L206,66 L152,66 Z', 'M214,42 L274,42 C288,43 298,50 310,66 L214,66 Z'],
            seams: ['M148,40 L148,136', 'M210,40 L210,136', 'M306,68 L304,136'], handles: [[166, 76], [226, 76]], belt: 'M60,69 L314,69',
            head: 'M368,82 L384,88 L384,99 L370,97 Z', tail: 'M14,80 L30,76 L30,96 L14,98 Z', mirror: 'M308,64 L326,60 L328,72 L312,74 Z', roof: 34 },
        pickup: { len: 430, ground: 170, wr: 30, wheels: [96, 340], cy: 140,
            body: 'M12,130 L12,80 C12,76 14,74 18,74 L178,74 L186,40 C188,34 192,32 198,32 L272,32 C284,32 292,38 300,48 L316,72 L392,78 C410,80 420,92 420,110 L420,132 C420,137 416,140 410,140 L378,140 A38,38 0 0 0 302,140 L134,140 A38,38 0 0 0 58,140 L20,140 C14,140 12,136 12,132 Z',
            glass: ['M194,40 L240,40 L240,70 L188,70 Z', 'M248,40 L272,40 C282,40 290,46 296,54 L308,70 L248,70 Z'],
            seams: ['M244,36 L244,138', 'M182,76 L180,138', 'M22,78 L22,136'], handles: [[258, 82]], belt: 'M14,81 L178,81 M186,74 L316,74',
            head: 'M402,86 L420,92 L420,102 L404,100 Z', tail: 'M12,84 L21,84 L21,104 L12,104 Z', mirror: 'M306,68 L324,64 L326,78 L310,80 Z', roof: 32 },
        van: { len: 430, ground: 171, wr: 29, wheels: [92, 340], cy: 142,
            body: 'M12,132 L12,26 C12,18 18,14 26,14 L300,14 C318,14 330,22 338,36 L366,78 L396,86 C412,90 420,100 420,116 L420,134 C420,139 416,142 410,142 L376,142 A36,36 0 0 0 304,142 L128,142 A36,36 0 0 0 56,142 L20,142 C14,142 12,138 12,134 Z',
            glass: ['M306,26 L330,30 C336,34 342,44 356,76 L306,76 Z'],
            seams: ['M300,16 L300,140', 'M196,20 L196,140', 'M270,20 L270,140', 'M14,30 L14,138'], handles: [[284, 90], [208, 90]], belt: 'M14,80 L300,80',
            head: 'M402,92 L420,98 L420,108 L404,106 Z', tail: 'M12,40 L21,40 L21,70 L12,70 Z', mirror: 'M354,72 L372,66 L376,84 L360,86 Z', roof: 14 },
        box: { len: 440, ground: 176, wr: 30, wheels: [84, 364], cy: 146,
            body: 'M288,44 L338,44 C356,46 366,60 372,76 L404,84 C420,88 428,98 428,114 L428,138 C428,143 424,146 418,146 L398,146 A34,34 0 0 0 330,146 L288,146 Z',
            box: 'M10,12 L284,12 L284,128 L10,128 Z', glass: ['M296,52 L338,52 C350,54 358,64 363,76 L296,76 Z'],
            seams: ['M292,48 L292,144', 'M370,80 L368,144'], handles: [[310, 90]], belt: 'M290,80 L370,80',
            head: 'M410,92 L428,98 L428,110 L412,108 Z', tail: 'M10,96 L18,96 L18,116 L10,116 Z', mirror: 'M360,64 L378,58 L382,80 L366,82 Z', roof: 12 },
        semi: { len: 372, ground: 180, wr: 31, wheels: [60, 128, 300], cy: 149,
            body: 'M10,140 L10,24 C10,16 16,12 24,12 L150,12 C164,12 172,20 176,34 L190,72 L300,84 C330,88 350,98 356,116 L360,149 L10,149 Z',
            glass: ['M150,22 C162,22 168,28 172,38 L184,72 L150,72 Z'],
            seams: ['M146,16 L146,146', 'M192,74 L190,146'], handles: [[156, 88]], belt: 'M12,78 L190,78',
            head: 'M344,104 L358,108 L360,122 L346,120 Z', tail: '', mirror: 'M176,40 L194,30 L198,64 L184,66 Z', roof: 12, stack: true },
        bus: { len: 620, ground: 170, wr: 30, wheels: [114, 530], cy: 140,
            body: 'M10,22 C10,12 18,8 28,8 L590,8 C606,8 614,16 616,30 L620,128 C620,136 614,140 606,140 L566,140 A36,36 0 0 0 494,140 L150,140 A36,36 0 0 0 78,140 L22,140 C14,140 10,134 10,126 Z',
            glass: [0, 1, 2, 3, 4, 5, 6].map(i => { const x = 34 + i * 64; return `M${x},24 L${x + 56},24 L${x + 56},70 L${x},70 Z`; }).concat(['M556,22 L602,26 C608,28 610,34 611,40 L612,78 L556,78 Z', 'M500,24 L546,24 L546,132 L500,132 Z']),
            seams: ['M498,22 L498,134', 'M548,22 L548,134', 'M522,24 L522,132'], handles: [], belt: 'M12,80 L496,80',
            head: 'M604,96 L620,98 L620,110 L606,110 Z', tail: 'M10,40 L18,40 L18,70 L10,70 Z', mirror: 'M612,30 L630,26 L630,48 L616,50 Z', roof: 8, livery: true },
        // a touring motorcycle (bikeSide draws it)
        bike: { len: 300, ground: 152, wr: 28, wheels: [56, 246], cy: 122, roof: 14, bike: true }
    };
    // where on the side view an area of damage is (x along the body, y on it)
    function damageSpot(S, area) {
        const L = S.len, a = String(area || '');
        if (/^front$/.test(a)) return [L - 26, S.cy - 30, 'end'];
        if (/^rear$/.test(a)) return [26, S.cy - 34, 'end'];
        if (/front (left|right)/.test(a)) return [L - 78, S.cy - 28, 'corner'];
        if (/rear (left|right)/.test(a)) return [L * 0.2, S.cy - 30, 'corner'];
        return [L * 0.5, S.cy - 32, 'side'];
    }
    // The damage: a dent shaded in, creases with their highlights, scraped paint and bare metal, and for an end, the
    // bumper torn loose and the lamp broken.
    function damage(id, S, area, seed, paint) {
        const [x, y, kind] = damageSpot(S, area), r = rng(seed);
        const w = kind === 'side' ? 120 : 70, h = kind === 'side' ? 64 : 58;
        let s = `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${w * 0.62}" ry="${h * 0.62}" fill="url(#${id}-dent)"/>`;
        // crumpled metal: small facets catching the light or in shadow, and a few deep folds
        for (let i = 0; i < 16; i++) {
            const fx = x - w / 2 + r() * w, fy = y - h / 2 + r() * h, fs = 6 + r() * 12, a = r() * Math.PI;
            const pts = [0, 1, 2, 3].map(k => { const ang = a + k * Math.PI / 2 + (r() - 0.5) * 0.9, rr = fs * (0.5 + r() * 0.6); return `${f1(fx + Math.cos(ang) * rr)},${f1(fy + Math.sin(ang) * rr * 0.7)}`; }).join(' ');
            s += `<polygon points="${pts}" fill="${hsl(paint, r() < 0.5 ? 14 + r() * 10 : -18 - r() * 12)}" fill-opacity=".85"/>`;
        }
        for (let i = 0; i < 4; i++) {
            const y0 = y - h / 2 + r() * h, x0 = x - w / 2 + r() * w * 0.25;
            let d = `M${f1(x0)},${f1(y0)}`;
            for (let k = 1; k <= 4; k++) d += ` L${f1(x0 + k * w * 0.2 + (r() - 0.5) * 10)},${f1(y0 + (r() - 0.5) * 14)}`;
            s += `<path d="${d}" fill="none" stroke="#0b0f14" stroke-opacity=".6" stroke-width="${f1(1.6 + r() * 1.4)}" stroke-linejoin="round"/>`
                + `<path d="${d}" transform="translate(0 2.4)" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.1"/>`;
        }
        // scraped paint and bare metal
        for (let i = 0; i < 4; i++) {
            const sx = x - w / 2 + r() * w * 0.6, sy = y - h / 3 + r() * h * 0.7, sl = 20 + r() * w * 0.5;
            s += `<path d="M${f1(sx)},${f1(sy)} q${f1(sl / 2)},${f1((r() - 0.5) * 4)} ${f1(sl)},${f1((r() - 0.5) * 6)}" stroke="#e5e7eb" stroke-opacity=".75" stroke-width="${f1(1 + r() * 2.5)}" stroke-linecap="round" fill="none"/>`;
        }
        s += `<path d="M${f1(x - 10)},${f1(y - 6)} q14,-9 26,2 q-4,12 -20,10 z" fill="${hsl([210, 6, 62])}" fill-opacity=".85"/>`;
        if (kind === 'end') {
            const front = /front/.test(area), ex = front ? S.len - 6 : 8;
            // the bumper cover torn loose and hanging, the lamp broken
            s += `<path d="M${ex - (front ? 46 : -46)},${S.cy - 4} L${ex},${S.cy - 10} L${ex + (front ? 6 : -6)},${S.cy + 8} L${ex - (front ? 36 : -36)},${S.cy + 16} Z" fill="${hsl(paint, -12)}" stroke="#0b0f14" stroke-opacity=".6"/>`;
            const lx = front ? S.len - 14 : 22, ly = front ? (S.roof < 30 ? S.cy - 46 : S.cy - 30) : S.cy - 40;
            for (let i = 0; i < 6; i++) s += `<path d="M${f1(lx + (r() - 0.5) * 14)},${f1(ly + (r() - 0.5) * 12)} l${f1((r() - 0.5) * 9)},${f1((r() - 0.5) * 9)} l${f1((r() - 0.5) * 9)},${f1(r() * 6)} z" fill="${front ? '#e2e8f0' : '#dc2626'}" fill-opacity=".9" stroke="#334155" stroke-width=".5"/>`;
        }
        return s;
    }
    // Shattered glass over the window nearest the damage on a side hit.
    function crackedGlass(S, area, seed) {
        if (!/side|left|right/.test(String(area))) return '';
        const [x] = damageSpot(S, area), gy = (S.roof + (S.cy - 30)) / 2, r = rng(seed + 7);
        let d = '';
        for (let i = 0; i < 9; i++) { const a = r() * Math.PI * 2, l = 14 + r() * 26; d += `M${f1(x)},${f1(gy)} l${f1(Math.cos(a) * l)},${f1(Math.sin(a) * l * 0.6)} `; }
        return `<path d="${d}" stroke="#e2e8f0" stroke-opacity=".75" stroke-width=".9" fill="none"/><circle cx="${f1(x)}" cy="${f1(gy)}" r="4" fill="#e2e8f0" fill-opacity=".6"/>`;
    }
    function wheel(id, x, cy, r) {
        const spokes = [0, 72, 144, 216, 288].map(a => `<path d="M${x},${cy} l${f1(Math.cos(a * Math.PI / 180) * r * 0.55)},${f1(Math.sin(a * Math.PI / 180) * r * 0.55)}" stroke="#64748b" stroke-width="${f1(r * 0.16)}" stroke-linecap="round"/>`).join('');
        return `<circle cx="${x}" cy="${cy}" r="${r}" fill="#16191d"/><circle cx="${x}" cy="${cy}" r="${f1(r * 0.86)}" fill="none" stroke="#2c3138" stroke-width="${f1(r * 0.12)}"/>`
            + `<circle cx="${x}" cy="${cy}" r="${f1(r * 0.62)}" fill="url(#${id}-rim)"/>${spokes}<circle cx="${x}" cy="${cy}" r="${f1(r * 0.14)}" fill="#334155"/>`;
    }
    // A touring motorcycle, side view (front to the right): wheels, fork, engine, tank, seat, saddlebag, the batwing
    // fairing; where it was hit, scraped paint and a smashed headlight.
    function bikeSide(v, opts) {
        const S = SIDE.bike, id = opts.id, p = v.paint, gid = `${id}-p${opts.n || 0}`, r = rng(opts.seed || hash(v.label));
        let s = `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hsl(p, 18)}"/><stop offset=".5" stop-color="${hsl(p, 2)}"/><stop offset="1" stop-color="${hsl(p, -14)}"/></linearGradient></defs>`;
        s += `<ellipse cx="150" cy="${S.ground + 2}" rx="160" ry="8" fill="#000" fill-opacity=".45" filter="url(#${id}-soft)"/>`;
        s += `<path d="M56,122 L112,104 L176,104" stroke="#64748b" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M40,116 L170,124" stroke="#cbd5e1" stroke-width="8" stroke-linecap="round"/>`;
        s += wheel(id, 56, S.cy, S.wr) + wheel(id, 246, S.cy, S.wr);
        s += `<path d="M246,122 L220,46" stroke="#94a3b8" stroke-width="7" stroke-linecap="round"/>`;
        s += `<rect x="124" y="88" width="62" height="36" rx="9" fill="#475569" stroke="#1f2937"/><path d="M134,88 L144,64 L160,64 L152,88 M164,88 L176,66 L190,68 L180,90" fill="#64748b" stroke="#1f2937"/>`;
        s += `<path d="M24,74 L98,72 L102,106 C88,112 44,112 30,106 Z" fill="url(#${gid})" stroke="${hsl(p, -26)}" stroke-width="1.4"/>`;
        s += `<path d="M84,66 Q122,52 164,62 L160,74 L90,78 Z" fill="#111827"/>`;
        s += `<path d="M150,62 Q188,40 222,54 L216,80 L156,82 Z" fill="url(#${gid})" stroke="${hsl(p, -26)}" stroke-width="1.4"/><path d="M162,58 Q186,48 208,54" stroke="#fff" stroke-opacity=".4" stroke-width="2" fill="none"/>`;
        s += `<path d="M204,40 Q242,28 266,52 L258,76 L212,74 Z" fill="url(#${gid})" stroke="${hsl(p, -26)}" stroke-width="1.4"/><path d="M214,40 L238,12 L252,18 L236,42 Z" fill="url(#${id}-glass)" fill-opacity=".7"/>`;
        s += `<circle cx="260" cy="60" r="7" fill="#f1f5f9" stroke="#64748b"/><path d="M220,100 Q246,84 274,102" stroke="url(#${gid})" stroke-width="8" fill="none"/>`;
        if (!opts.plain && opts.area) [].concat(opts.area).forEach(a => {
            const [x, y] = /front/.test(a) ? [256, 66] : /rear/.test(a) ? [40, 92] : [70, 90];
            s += `<ellipse cx="${x}" cy="${y}" rx="22" ry="16" fill="url(#${id}-dent)"/>`;
            for (let i = 0; i < 7; i++) s += `<path d="M${f1(x - 18 + r() * 20)},${f1(y - 10 + r() * 20)} l${f1(10 + r() * 16)},${f1((r() - 0.5) * 6)}" stroke="#e5e7eb" stroke-opacity=".75" stroke-width="1.2"/>`;
            if (/front/.test(a)) s += `<path d="M252,56 l6,-6 l4,8 l6,-4 l-2,10 z" fill="#e2e8f0" stroke="#334155" stroke-width=".6"/><path d="M246,122 L232,60" stroke="#0b0f14" stroke-opacity=".5" stroke-width="2"/>`;
        });
        return { svg: s, len: S.len, ground: S.ground, top: S.roof, S };
    }
    // One vehicle, side view: <g> in its own coordinates (front to the right). opts: id, area (damage), seed, decal, plain (no damage)
    function sideVehicle(v, opts) {
        if (v.body === 'bike') return bikeSide(v, opts);
        const S = SIDE[v.body] || SIDE.sedan, id = opts.id, p = v.paint, seed = opts.seed || hash(v.label);
        const gid = `${id}-p${opts.n || 0}`;
        let s = `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hsl(p, 16)}"/><stop offset=".45" stop-color="${hsl(p, 3)}"/><stop offset=".55" stop-color="${hsl(p, -4)}"/><stop offset="1" stop-color="${hsl(p, -16)}"/></linearGradient></defs>`;
        s += `<ellipse cx="${S.len / 2}" cy="${S.ground + 2}" rx="${S.len * 0.52}" ry="9" fill="#000" fill-opacity=".45" filter="url(#${id}-soft)"/>`;
        if (v.body === 'semi' && opts.trailer) {
            s += `<g><rect x="-540" y="-14" width="560" height="146" rx="3" fill="#e5e7eb" stroke="#94a3b8"/><rect x="-540" y="132" width="560" height="10" fill="#374151"/>`
                + [0, 1, 2, 3, 4, 5, 6, 7].map(i => `<line x1="${-520 + i * 68}" y1="-12" x2="${-520 + i * 68}" y2="130" stroke="#cbd5e1"/>`).join('')
                + `<text x="-260" y="70" font-size="34" font-weight="900" fill="#1e3a8a" fill-opacity=".85" text-anchor="middle" font-family="Arial, Helvetica, sans-serif">${esc(opts.trailer)}</text>`
                + wheel(id, -470, 149, 31) + wheel(id, -400, 149, 31) + `</g>`;
        }
        if (S.box) s += `<path d="${S.box}" fill="${hsl([210, 8, 92])}" stroke="#94a3b8" stroke-width="1.5"/><rect x="10" y="128" width="280" height="12" fill="#1f2937"/>`;
        s += `<path d="${S.body}" fill="url(#${gid})" stroke="${hsl(p, -24)}" stroke-width="1.6"/>`;
        if (S.livery) s += `<rect x="12" y="86" width="604" height="12" fill="#1d4ed8"/><rect x="12" y="100" width="604" height="4" fill="#facc15"/><rect x="556" y="10" width="54" height="12" rx="2" fill="#111827"/><text x="583" y="19.5" font-size="8" font-weight="800" fill="#fbbf24" text-anchor="middle" font-family="Arial, Helvetica, sans-serif">4 RIVERTON</text>`;
        s += S.glass.map(g => `<path d="${g}" fill="url(#${id}-glass)" stroke="#0b0f14" stroke-width="1.2"/>`).join('');
        s += S.glass.map(g => `<path d="${g}" fill="#fff" fill-opacity=".08" transform="translate(6 -2)" clip-path="none"/>`).slice(0, 2).join('');
        s += `<path d="${S.belt}" stroke="#fff" stroke-opacity=".35" stroke-width="1.6" fill="none"/>`;
        s += S.seams.map(d => `<path d="${d}" stroke="${hsl(p, -30)}" stroke-opacity=".7" stroke-width="1.1" fill="none"/>`).join('');
        s += S.handles.map(([x, y]) => `<rect x="${x}" y="${y}" width="16" height="4" rx="2" fill="${hsl(p, -22)}"/>`).join('');
        if (S.head) s += `<path d="${S.head}" fill="#f1f5f9" stroke="#64748b"/>`;
        if (S.tail) s += `<path d="${S.tail}" fill="${v.reversing ? '#f8fafc' : '#b91c1c'}" stroke="#7f1d1d"/>`;
        if (S.mirror) s += `<path d="${S.mirror}" fill="${hsl(p, -10)}" stroke="${hsl(p, -30)}"/>`;
        if (S.stack) s += `<rect x="136" y="-26" width="8" height="40" rx="2" fill="#cbd5e1" stroke="#64748b"/><rect x="200" y="112" width="70" height="22" rx="8" fill="#cbd5e1" stroke="#64748b"/>`;
        if (v.decal) s += `<text x="${S.len * 0.38}" y="${S.cy - 52}" font-size="22" font-weight="900" fill="#b91c1c" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" letter-spacing="1">${esc(v.decal)}</text>`;
        if (!opts.plain && opts.area) [].concat(opts.area).forEach((a, i) => { s += damage(id, S, a, seed + i * 101, p) + crackedGlass(S, a, seed + i); });
        s += S.wheels.map(x => `<path d="M${x - S.wr - 6},${S.cy} A${S.wr + 6},${S.wr + 6} 0 0 1 ${x + S.wr + 6},${S.cy} Z" fill="#0b0f14" fill-opacity=".55"/>` + wheel(id, x, S.cy, S.wr)).join('');
        if (v.reversing) s += `<path d="M${-4},${S.cy - 40} l-26,-10 l0,20 z" fill="#fef9c3" fill-opacity=".35"/>`;
        return { svg: s, len: S.len, ground: S.ground, top: S.box ? 12 : S.roof, S };
    }

    /* ---------- a vehicle seen from the front or the rear (the one that hit a side) ---------- */
    function endVehicle(v, opts) {
        const id = opts.id, p = v.paint, front = opts.front !== false;
        const tall = { sedan: [44, 98], suv: [24, 92], pickup: [26, 92], van: [8, 86], box: [10, 88], bus: [6, 80], semi: [6, 84] }[v.body] || [44, 98];
        const [top, b] = tall, gid = `${id}-e${opts.n || 0}`, r = rng(opts.seed || hash(v.label + 'end'));
        let s = `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hsl(p, 14)}"/><stop offset=".6" stop-color="${hsl(p, 0)}"/><stop offset="1" stop-color="${hsl(p, -16)}"/></linearGradient></defs>`;
        s += `<ellipse cx="110" cy="174" rx="112" ry="9" fill="#000" fill-opacity=".45" filter="url(#${id}-soft)"/>`;
        s += `<rect x="22" y="140" width="34" height="34" rx="6" fill="#16191d"/><rect x="164" y="140" width="34" height="34" rx="6" fill="#16191d"/>`;
        s += `<path d="M40,${b - 8} L58,${top} L162,${top} L180,${b - 8} Z" fill="url(#${gid})" stroke="${hsl(p, -26)}" stroke-width="1.4"/>`;
        s += `<path d="M48,${b - 10} L62,${top + 6} L158,${top + 6} L172,${b - 10} Z" fill="url(#${id}-glass)" stroke="#0b0f14"/>`;
        s += `<path d="M10,${b} Q10,${b - 8} 18,${b - 10} L202,${b - 10} Q210,${b - 8} 210,${b} L210,150 Q210,158 202,158 L18,158 Q10,158 10,150 Z" fill="url(#${gid})" stroke="${hsl(p, -26)}" stroke-width="1.4"/>`;
        s += `<rect x="4" y="${b - 18}" width="16" height="12" rx="3" fill="${hsl(p, -10)}"/><rect x="200" y="${b - 18}" width="16" height="12" rx="3" fill="${hsl(p, -10)}"/>`;
        if (front) {
            s += `<rect x="72" y="${b + 10}" width="76" height="24" rx="4" fill="#111827" stroke="#475569"/>` + [0, 1, 2, 3].map(i => `<line x1="76" y1="${b + 15 + i * 5}" x2="144" y2="${b + 15 + i * 5}" stroke="#475569"/>`).join('');
            s += `<rect x="20" y="${b + 6}" width="44" height="16" rx="5" fill="#f1f5f9" stroke="#64748b"/><rect x="156" y="${b + 6}" width="44" height="16" rx="5" fill="#f1f5f9" stroke="#64748b"/>`;
        } else {
            s += `<rect x="16" y="${b + 4}" width="40" height="20" rx="4" fill="${v.reversing ? '#f8fafc' : '#b91c1c'}" stroke="#7f1d1d"/><rect x="164" y="${b + 4}" width="40" height="20" rx="4" fill="${v.reversing ? '#f8fafc' : '#b91c1c'}" stroke="#7f1d1d"/>`;
            s += `<line x1="60" y1="${b + 2}" x2="160" y2="${b + 2}" stroke="${hsl(p, -26)}"/>`;
        }
        s += `<rect x="12" y="140" width="196" height="16" rx="5" fill="${hsl(p, -18)}" stroke="#1f2937"/><rect x="92" y="142" width="36" height="12" rx="1" fill="#f8fafc" stroke="#334155"/>`;
        if (v.decal && front) s += `<text x="110" y="${top + 2 > 30 ? top - 4 : b - 14}" font-size="9" font-weight="900" fill="#b91c1c" text-anchor="middle" font-family="Arial, Helvetica, sans-serif">${esc(v.decal)}</text>`;
        if (!opts.plain) {
            // the end that hit: pushed in, the hood or bumper buckled, a lamp broken
            s += `<ellipse cx="110" cy="${b + 26}" rx="80" ry="34" fill="url(#${id}-dent)"/>`;
            for (let i = 0; i < 6; i++) {
                const y0 = b + 2 + r() * 50; let d = `M${f1(24 + r() * 30)},${f1(y0)}`;
                for (let k = 1; k <= 5; k++) d += ` L${f1(30 + k * 32 + (r() - 0.5) * 10)},${f1(y0 + (r() - 0.5) * 14)}`;
                s += `<path d="${d}" fill="none" stroke="#0b0f14" stroke-opacity=".55" stroke-width="1.6"/><path d="${d}" transform="translate(0 2)" fill="none" stroke="#fff" stroke-opacity=".28"/>`;
            }
            s += `<path d="M150,154 L206,150 L210,170 L156,176 Z" fill="${hsl(p, -20)}" stroke="#0b0f14" stroke-opacity=".6"/>`;
            for (let i = 0; i < 6; i++) s += `<path d="M${f1(166 + r() * 30)},${f1(b + 8 + r() * 12)} l${f1((r() - 0.5) * 9)},${f1((r() - 0.5) * 9)} l${f1((r() - 0.5) * 9)},${f1(r() * 6)} z" fill="${front ? '#e2e8f0' : '#dc2626'}" stroke="#334155" stroke-width=".5"/>`;
        }
        return { svg: s, w: 220, h: 178 };
    }

    /* ---------- backgrounds ---------- */
    function sky(id, w, h, overcast) {
        return `<linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${overcast ? '#9aa8b8' : '#7fb0dc'}"/><stop offset="1" stop-color="${overcast ? '#dfe5ec' : '#dcebf6'}"/></linearGradient>`;
    }
    function asphalt(id) {
        return `<linearGradient id="${id}-road" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b6068"/><stop offset="1" stop-color="#2f3237"/></linearGradient>`;
    }
    // trees and low buildings along the horizon
    function skyline(r, w, y) {
        let s = '';
        for (let x = -20; x < w + 40;) {
            if (r() < 0.45) { const bw = 40 + r() * 70, bh = 24 + r() * 56; s += `<rect x="${f1(x)}" y="${f1(y - bh)}" width="${f1(bw)}" height="${f1(bh)}" fill="hsl(${200 + r() * 30},${8 + r() * 10}%,${58 + r() * 14}%)"/>`; x += bw + 4; }
            else { const tr = 14 + r() * 22; s += `<circle cx="${f1(x + tr)}" cy="${f1(y - tr * 0.8)}" r="${f1(tr)}" fill="hsl(${110 + r() * 40},${18 + r() * 14}%,${30 + r() * 12}%)"/>`; x += tr * 1.5; }
        }
        return s;
    }
    function signal(x, y, kind) {
        if (kind === 'stop') return `<rect x="${x - 2}" y="${y}" width="4" height="110" fill="#6b7280"/><path transform="translate(${x} ${y})" d="M-10,-24 L10,-24 L24,-10 L24,10 L10,24 L-10,24 L-24,10 L-24,-10 Z" fill="#b91c1c" stroke="#fff" stroke-width="2"/><text x="${x}" y="${y + 4}" font-size="11" font-weight="900" fill="#fff" text-anchor="middle" font-family="Arial, Helvetica, sans-serif">STOP</text>`;
        if (kind === 'school') return `<rect x="${x - 2}" y="${y}" width="4" height="110" fill="#6b7280"/><path transform="translate(${x} ${y - 6})" d="M0,-26 L24,0 L0,26 L-24,0 Z" fill="#d9f99d" stroke="#365314" stroke-width="2"/><text x="${x}" y="${y - 3}" font-size="7" font-weight="900" fill="#1a2e05" text-anchor="middle" font-family="Arial, Helvetica, sans-serif">SCHOOL</text>`;
        const lit = kind === 'walk' ? 2 : 0;
        return `<rect x="${x - 3}" y="${y - 30}" width="6" height="150" fill="#4b5563"/><rect x="${x - 3}" y="${y - 30}" width="80" height="6" fill="#4b5563"/><rect x="${x + 60}" y="${y - 26}" width="20" height="54" rx="3" fill="#1f2937"/>`
            + [0, 1, 2].map(i => `<circle cx="${x + 70}" cy="${y - 16 + i * 17}" r="6" fill="${i === lit ? (lit === 0 ? '#ef4444' : '#22c55e') : '#374151'}"/>`).join('');
    }
    // glass, plastic and lamp pieces on the road around (x, y); fluid; skid marks
    function debris(r, x, y, spread) {
        let s = `<ellipse cx="${f1(x + 10)}" cy="${f1(y + 4)}" rx="${f1(spread * 0.5)}" ry="7" fill="#111" fill-opacity=".35"/>`;
        for (let i = 0; i < 26; i++) {
            const dx = (r() - 0.5) * spread * 1.6, dy = (r() - 0.5) * 18, c = r() < 0.5 ? '#cbd5e1' : r() < 0.6 ? '#111827' : r() < 0.5 ? '#dc2626' : '#f1f5f9';
            s += `<path d="M${f1(x + dx)},${f1(y + dy)} l${f1(2 + r() * 5)},${f1((r() - 0.5) * 3)} l${f1(-r() * 4)},${f1(2 + r() * 3)} z" fill="${c}" fill-opacity=".9"/>`;
        }
        return s;
    }
    const skid = (x1, x2, y) => `<path d="M${x1},${y} L${x2},${y - 3}" stroke="#111" stroke-opacity=".45" stroke-width="7" stroke-linecap="round"/><path d="M${x1},${y + 14} L${x2},${y + 11}" stroke="#111" stroke-opacity=".35" stroke-width="7" stroke-linecap="round"/>`;
    const cone = (x, y) => `<path d="M${x - 9},${y} L${x},${y - 26} L${x + 9},${y} Z" fill="#f97316"/><rect x="${x - 7}" y="${y - 14}" width="14" height="4" fill="#fff"/><rect x="${x - 12}" y="${y}" width="24" height="4" rx="1" fill="#c2410c"/>`;
    // a patrol car far back, its light bar on
    function patrol(x, y, sc) {
        return `<g transform="translate(${x} ${y}) scale(${sc})"><path d="M0,40 C0,30 6,26 16,25 L44,22 C58,8 72,4 96,4 L150,4 C168,5 180,14 192,24 L224,28 C236,30 240,36 240,44 L240,52 L0,52 Z" fill="#f8fafc" stroke="#334155"/><path d="M60,24 C70,12 82,9 98,9 L150,9 C162,10 172,16 182,24 Z" fill="#1f2937"/><rect x="40" y="30" width="160" height="10" fill="#1e3a8a"/><rect x="104" y="-4" width="44" height="8" rx="2" fill="#ef4444"/><rect x="126" y="-4" width="22" height="8" rx="2" fill="#2563eb"/><circle cx="52" cy="52" r="14" fill="#111827"/><circle cx="190" cy="52" r="14" fill="#111827"/><text x="120" y="38" font-size="8" font-weight="900" fill="#fff" text-anchor="middle" font-family="Arial, Helvetica, sans-serif">POLICE</text></g>`;
    }

    /* ---------- a crash scene ---------- */
    // The vehicles placed by the kind of crash, side view on a street, highway, intersection or lot.
    // href: the file's realistic photo (library-photos.js), shown in place of the drawing with the same labels
    function scene(mc, href) {
        const cr = CRASH[mc && mc.id]; if (!cr) return '';
        const W = 640, H = 360, id = 'sc' + hash(mc.id).toString(36), r = rng(hash(mc.id + 'scene'));
        const client = vehicleOf(mc, 'client'), other = vehicleOf(mc, 'other'), third = vehicleOf(mc, 'third');
        const horizon = 168, gy = 312;   // the vehicles stand on gy
        let back = '', mid = '', front = '';
        // the setting
        back += `<rect width="${W}" height="${horizon + 30}" fill="url(#${id}-sky)"/>`;
        back += skyline(r, W, horizon + 22);
        if (cr.setting === 'highway') back += `<rect y="${horizon + 14}" width="${W}" height="16" fill="#9ca3af"/>` + Array.from({ length: 22 }, (_, i) => `<rect x="${i * 30}" y="${horizon + 6}" width="4" height="14" fill="#6b7280"/>`).join('') + `<rect y="${horizon + 8}" width="${W}" height="5" fill="#cbd5e1"/>`;
        if (cr.setting === 'parking' || cr.setting === 'gas station') {
            back += `<rect x="40" y="${horizon - 34}" width="${W - 80}" height="70" fill="#d6d3d1"/><rect x="40" y="${horizon - 44}" width="${W - 80}" height="14" fill="${cr.setting === 'gas station' ? '#b91c1c' : '#1e3a8a'}"/>`
                + `<text x="${W / 2}" y="${horizon - 33.5}" font-size="10" font-weight="900" fill="#fff" text-anchor="middle" font-family="Arial, Helvetica, sans-serif">${cr.setting === 'gas station' ? 'FUEL · FOOD MART' : /plaza/i.test(cr.place) ? 'RIVERTON PLAZA' : 'GROCERY'}</text>`
                + Array.from({ length: 8 }, (_, i) => `<rect x="${60 + i * 66}" y="${horizon - 22}" width="50" height="40" fill="#475569" fill-opacity=".8"/>`).join('');
        }
        back += `<rect y="${horizon + 30}" width="${W}" height="${H - horizon - 30}" fill="url(#${id}-road)"/>`;
        if (cr.setting === 'parking') back += Array.from({ length: 12 }, (_, i) => `<path d="M${i * 60 - 20},${horizon + 34} L${i * 60 - 60},${H}" stroke="#f8fafc" stroke-opacity=".55" stroke-width="3"/>`).join('');
        else {
            back += `<path d="M0,${horizon + 72} L${W},${horizon + 72}" stroke="#facc15" stroke-width="3"/><path d="M0,${horizon + 78} L${W},${horizon + 78}" stroke="#facc15" stroke-width="3"/>`;
            back += `<path d="M0,${H - 14} L${W},${H - 14}" stroke="#f8fafc" stroke-opacity=".7" stroke-width="5" stroke-dasharray="40 30"/>`;
        }
        if (cr.setting === 'crosswalk' || cr.setting === 'intersection') back += Array.from({ length: 8 }, (_, i) => `<path d="M${470 + i * 10},${horizon + 34} L${430 + i * 26},${H}" stroke="#f8fafc" stroke-opacity=".75" stroke-width="7"/>`).join('');
        if (cr.signal) back += signal(cr.signal === 'stop' || cr.signal === 'school' ? 596 : 560, horizon - 70, cr.signal);
        if (cr.type !== 'hit-and-run' && cr.setting !== 'parking') back += patrol(14, horizon + 14, 0.42);
        // place a side-view vehicle: its left edge at x, standing on gy, scale k, facing right (or left)
        const place = (v, x, k, opts, faceLeft) => {
            const sv = sideVehicle(v, Object.assign({ id }, opts));
            const tx = faceLeft ? x + sv.len * k : x;
            return `<g transform="translate(${f1(tx)} ${f1(gy - sv.ground * k)}) scale(${faceLeft ? -k : k} ${k})">${sv.svg}</g>`;
        };
        const placeEnd = (v, cx, k, opts) => {
            const ev = endVehicle(v, Object.assign({ id }, opts));
            return `<g transform="translate(${f1(cx - 110 * k)} ${f1(gy + 18 - 176 * k)}) scale(${k})">${ev.svg}</g>`;
        };
        const len = (v) => (SIDE[v.body] || SIDE.sedan).len;
        const T = cr.type;
        if (T === 'rear-end' || T === 'chain') {
            // the one behind hit the one ahead; all facing right
            const order = T === 'chain' ? [other, client, third] : [other, client];
            const total = order.reduce((n, v) => n + len(v), 0) + (other.body === 'semi' ? 120 : 0), k = Math.min(0.78, (W - 40) / total);
            let x = 20 + (other.body === 'semi' ? 120 * k : 0);
            order.forEach((v, i) => {
                // the first is hit in front, the last in the rear, one in the middle (a chain) at both ends
                const area = i === 0 ? 'front' : i === order.length - 1 ? 'rear' : ['rear', 'front'];
                mid += place(v, x, k, { n: i, area, trailer: v.body === 'semi' ? (/vnl/i.test(v.label) ? 'KESTREL' : 'REDLINE FREIGHT') : '' });
                if (i > 0) front += debris(r, x, gy + 4, 40);
                x += len(v) * k - 6 * k;
            });
            front += skid(30, 20 + len(other) * k * 0.7, gy + 10);
        } else if (T === 'head-on') {
            const k = Math.min(0.74, (W - 40) / (len(client) + len(other)));
            mid += place(client, 20, k, { n: 0, area: 'front' }) + place(other, 20 + len(client) * k - 8, k, { n: 1, area: 'front' }, true);
            front += debris(r, 20 + len(client) * k, gy + 6, 70);
        } else if (T === 'sideswipe') {
            const k = Math.min(0.66, (W - 40) / (len(client) + len(other) + 40));
            const cLeft = /left/.test(client.hit);
            mid += place(other, cLeft ? 24 + len(client) * k + 30 : 20, k * 0.96, { n: 1, area: other.hit }, cLeft);
            mid += place(client, cLeft ? 20 : 30 + len(other) * k, k, { n: 0, area: client.hit }, cLeft);
            front += debris(r, W / 2, gy + 6, 50);
        } else if (T === 't-bone' || T === 'backing') {
            // the client's hit side faces us; the other vehicle's front (or rear, backing) is against it
            const faceLeft = /left/.test(client.hit), k = Math.min(0.9, (W - 60) / len(client));
            const cx = 30;
            mid += place(client, cx, k, { n: 0, area: client.hit }, faceLeft);
            const [hx] = damageSpot(SIDE[client.body] || SIDE.sedan, client.hit), at = faceLeft ? cx + (len(client) - hx) * k : cx + hx * k;
            front += placeEnd(other, at, 0.92, { n: 1, front: T === 't-bone' });
            front += debris(r, at, gy + 14, 60);
            if (cr.items === 'groceries') front += `<g transform="translate(${f1(at + 120)} ${gy + 4})"><path d="M0,0 L26,0 L22,-30 L4,-30 Z" fill="#d6b88a" stroke="#92400e"/><circle cx="34" cy="-4" r="6" fill="#f97316"/><circle cx="46" cy="0" r="5" fill="#dc2626"/><rect x="54" y="-8" width="16" height="10" rx="2" fill="#f8fafc" stroke="#94a3b8"/></g>`;
        } else if (T === 'pedestrian') {
            if (!other.reversing) {
                // a bus or van turning into the crosswalk
                const k = Math.min(0.9, (W - 120) / len(other));
                mid += place(other, 10, k, { n: 1, plain: true });
                front += `<g transform="translate(${W - 130} ${gy + 6})"><path d="M0,0 L30,0 L28,-22 L2,-22 Z" fill="#1f2937"/><path d="M8,-22 q7,-12 14,0" stroke="#1f2937" stroke-width="3" fill="none"/></g>` + cone(W - 60, gy + 30) + cone(W - 180, gy + 34);
            } else {
                const k = 0.9;
                front += placeEnd(other, W * 0.42, k, { n: 1, front: false, plain: true });
                front += `<g transform="translate(${W * 0.42 + 150} ${gy + 6})"><path d="M0,0 L4,-60 q2,-8 10,-6" stroke="#78350f" stroke-width="5" fill="none" stroke-linecap="round" transform="rotate(70)"/><path d="M30,8 q10,-22 26,-2 L52,10 Z" fill="#7c2d12"/></g>` + cone(W * 0.42 + 230, gy + 30);
            }
        } else if (T === 'left-turn') {
            // the other vehicle turned across the client's path: its hit side faces us, the client's vehicle against it
            const faceLeft = /left/.test(other.hit), k = Math.min(0.86, (W - 80) / len(other));
            mid += place(other, 20, k, { n: 1, area: other.hit }, faceLeft);
            const [hx] = damageSpot(SIDE[other.body] || SIDE.sedan, other.hit), at = faceLeft ? 20 + (len(other) - hx) * k : 20 + hx * k;
            // a motorcycle went down against it: in front of the SUV (nearer the camera), tipped over
            if (client.body === 'bike') front += `<g transform="translate(0 22) rotate(-12 ${f1(at)} ${gy})">${place(client, at - 20, 0.8, { n: 0, area: client.hit }, true)}</g>`;
            else front += placeEnd(client, at, 0.92, { n: 0, front: true });
            front += debris(r, at, gy + 12, 60);
        } else if (T === 'hit-and-run') {
            const k = Math.min(0.9, (W - 60) / len(client));
            mid += place(client, 60, k, { n: 0, area: client.hit }, /left/.test(client.hit));
            front += debris(r, 120, gy + 8, 50) + skid(W - 200, W - 10, gy + 4);
            if (/ride/i.test(client.label)) mid += `<rect x="${f1(60 + len(client) * k * 0.55)}" y="${f1(gy - 128 * k)}" width="60" height="14" rx="3" fill="#7c3aed"/><text x="${f1(60 + len(client) * k * 0.55 + 30)}" y="${f1(gy - 128 * k + 10.5)}" font-size="9" font-weight="900" fill="#fff" text-anchor="middle" font-family="Arial, Helvetica, sans-serif">RideNow</text>`;
        }
        front += cone(W - 30, H - 20);
        const label = { 'rear-end': 'Rear-end collision', 'chain': 'Chain collision', 'left-turn': 'Left-turn collision', 'head-on': 'Head-on collision', 'sideswipe': 'Sideswipe', 't-bone': 'Broadside (T-bone)', 'backing': 'Backing collision', 'pedestrian': 'Pedestrian struck', 'hit-and-run': 'Hit-and-run' }[T] || 'Crash scene';
        const dol = mc.dateOfLoss || '';
        return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(`Mock crash-scene photo: ${label}, ${cr.place} (training specimen)`)}" font-family="Arial, Helvetica, sans-serif">
${href ? photoImage(href, W, H) : `${defs(id, sky(id, W, H, hash(mc.id) % 3 === 0) + asphalt(id))}
${back}${mid}${front}
${finish(id, W, H)}`}
<text x="${W / 2}" y="${H / 2 + 10}" font-size="52" font-weight="900" fill="#ef4444" fill-opacity=".12" text-anchor="middle" transform="rotate(-12 ${W / 2} ${H / 2})" letter-spacing="5">SPECIMEN</text>
<rect width="${W}" height="28" fill="#0f172a" fill-opacity=".8"/><text x="10" y="18.5" font-size="12" font-weight="800" fill="#fff">CRASH SCENE · ${esc(label)}</text><text x="${W - 10}" y="18.5" font-size="11" font-weight="700" fill="#fbbf24" text-anchor="end">${esc(cr.place)}</text>
<rect y="${H - 26}" width="${W}" height="26" fill="#0f172a" fill-opacity=".8"/><text x="10" y="${H - 9}" font-size="10.5" fill="#fff">${esc([client && client.label, other && other.label, third && third.label].filter(Boolean).join('  ·  '))}</text><text x="${W - 10}" y="${H - 9}" font-size="9" fill="#94a3b8" text-anchor="end">${mark(href)}${dol ? ' · DOL ' + esc(dol) : ''}</text>
</svg>`;
    }
    const photoImage = (href, w, h) => `<image href="${esc(href)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>`;
    const mark = (href) => href ? 'MOCK · STAND-IN TRAINING PHOTO' : 'MOCK · TRAINING PHOTO';

    /* ---------- one vehicle and its damage (the property damage photos) ---------- */
    // p: { vehicle: 'client' | 'other', area, caption } — at the tow yard, the damaged side toward the camera.
    function vehiclePhoto(mc, p, n, href) {
        const v = vehicleOf(mc, p.vehicle === 'other' ? 'other' : 'client') || { who: p.vehicle, label: p.vehicle === 'other' ? 'Other vehicle' : 'Client vehicle', body: 'sedan', paint: PAINT.silver, plate: '' };
        const W = 464, H = 290, id = 'vp' + hash(mc.id + p.vehicle + p.area + n).toString(36), r = rng(hash(mc.id + p.area + n));
        const S = SIDE[v.body] || SIDE.sedan, area = p.area || 'front', faceLeft = /left/.test(area);
        const gy = 244, k = Math.min(0.98, (W - 30) / S.len, 190 / (S.ground - (S.box ? 0 : S.roof - 20)));
        const sv = sideVehicle(v, { id, n: 0, area, seed: hash(mc.id + area + n) });
        const x = (W - S.len * k) / 2, tx = faceLeft ? x + S.len * k : x;
        let bg = `<rect width="${W}" height="150" fill="url(#${id}-sky)"/>` + skyline(r, W, 120);
        // the tow yard's chain-link fence and gravel
        bg += `<rect y="70" width="${W}" height="80" fill="url(#${id}-fence)"/><rect y="68" width="${W}" height="3" fill="#6b7280"/>` + Array.from({ length: 9 }, (_, i) => `<rect x="${i * 58}" y="64" width="4" height="86" fill="#6b7280"/>`).join('');
        bg += `<rect y="150" width="${W}" height="${H - 150}" fill="url(#${id}-gravel)"/>`;
        const fence = `<pattern id="${id}-fence" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M0,0 L12,12 M12,0 L0,12" stroke="#9ca3af" stroke-width="1"/></pattern>`
            + `<linearGradient id="${id}-gravel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a8a29e"/><stop offset="1" stop-color="#78716c"/></linearGradient>`;
        const name = v.label, dol = mc.dateOfLoss || '';
        return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(`Mock photo: ${name}, ${area} damage (training specimen)`)}" font-family="Arial, Helvetica, sans-serif">
${href ? photoImage(href, W, H) : `${defs(id, sky(id, W, H, hash(mc.id) % 2 === 0) + fence)}
${bg}
<g transform="translate(${f1(tx)} ${f1(gy - S.ground * k)}) scale(${faceLeft ? -k : k} ${k})">${sv.svg}</g>
${finish(id, W, H)}`}
<text x="${W / 2}" y="${H / 2 + 8}" font-size="40" font-weight="900" fill="#ef4444" fill-opacity=".13" text-anchor="middle" transform="rotate(-14 ${W / 2} ${H / 2})" letter-spacing="4">SPECIMEN</text>
<rect width="${W}" height="26" fill="#0f172a" fill-opacity=".8"/>
<text x="10" y="17" font-size="11" font-weight="800" fill="#fff"${String(name).length > 46 ? ' textLength="300" lengthAdjust="spacingAndGlyphs"' : ''}>${esc(name)}${v.plate ? ' · ' + esc(v.plate) : ''}</text>
<text x="${W - 10}" y="17" font-size="10" font-weight="700" fill="#fbbf24" text-anchor="end">${p.vehicle === 'other' ? 'OTHER VEHICLE' : 'CLIENT VEHICLE'}</text>
<rect y="${H - 28}" width="${W}" height="28" fill="#0f172a" fill-opacity=".8"/>
<text x="10" y="${H - 10}" font-size="11" fill="#fff"${String(p.caption || '').length > 58 ? ' textLength="340" lengthAdjust="spacingAndGlyphs"' : ''}>${esc(p.caption || area + ' damage')}</text>
<text x="${W - 10}" y="${H - 10}" font-size="9" fill="#94a3b8" text-anchor="end">${mark(href)}${dol ? ' · DOL ' + esc(dol) : ''}</text>
</svg>`;
    }
    // The vehicle photos of a file: its pdPhotos, or (no property damage block) CRASH[id].photos
    const vehiclePhotos = (mc) => (mc && Array.isArray(mc.pdPhotos) && mc.pdPhotos.length ? mc.pdPhotos : ((CRASH[mc && mc.id] || {}).photos || []));

    /* ---------- the photo on the client's mock ID ---------- */
    const SKIN = [[30, 62, 86], [28, 55, 78], [26, 48, 68], [24, 42, 58], [22, 40, 46], [20, 38, 36], [18, 34, 27]];
    const HAIR = { black: [220, 10, 10], dark: [24, 30, 16], brown: [26, 38, 26], auburn: [14, 52, 32], blond: [42, 52, 56], gray: [210, 6, 64], white: [210, 6, 84] };
    // Each library client as the file describes them (she or he, from the narrative, the notes and the calls'
    // scripts); a file not listed here is read from its narrative.
    const WOMEN = new Set(['MC-01', 'MC-03', 'MC-05', 'MC-07', 'MC-09', 'MC-10', 'MC-11', 'MC-13', 'MC-15', 'MC-16', 'MC-18', 'MC-21', 'MC-22', 'MC-27', 'MC-29',
        'MC-31', 'MC-33', 'MC-35', 'MC-38', 'MC-39', 'MC-40', 'MC-44', 'MC-46', 'MC-47', 'MC-48']);
    const MEN = new Set(['MC-02', 'MC-04', 'MC-06', 'MC-08', 'MC-12', 'MC-14', 'MC-17', 'MC-19', 'MC-20', 'MC-23', 'MC-24', 'MC-25', 'MC-26', 'MC-28', 'MC-30',
        'MC-32', 'MC-34', 'MC-36', 'MC-37', 'MC-41', 'MC-42', 'MC-43', 'MC-45', 'MC-49', 'MC-50', 'MC-51', 'MC-52']);
    const SKIN_NAMES = ['fair', 'light', 'light olive', 'olive', 'light brown', 'brown', 'dark brown'];
    const SHIRTS = [[[215, 40, 30], 'navy blue'], [[0, 0, 92], 'white'], [[150, 25, 30], 'dark green'], [[350, 35, 32], 'burgundy'], [[210, 10, 40], 'charcoal gray'], [[30, 30, 40], 'brown']];
    function looksOf(mc) {
        // the same person in two files (same name and date of birth) looks the same in both
        const c = (mc && mc.client) || {}, h = hash(String(c.name || mc && mc.id).trim().toLowerCase() + '|' + (c.dob || '')), r = rng(h);
        const id = mc && mc.id;
        let female;
        if (WOMEN.has(id)) female = true; else if (MEN.has(id)) female = false;
        else {
            const text = `${mc && mc.narrative || ''} ${mc && mc.summary || ''}`;
            female = (text.match(/\b(she|her|hers|herself)\b/gi) || []).length > (text.match(/\b(he|him|his|himself)\b/gi) || []).length;
        }
        const y = /(\d{4})$/.exec(String(c.dob || '').trim()), age = y ? 2026 - +y[1] : 40;
        const t = Math.floor(r() * SKIN.length), tone = SKIN[t];
        const dark = tone[2] < 50;
        let hair = dark ? (r() < 0.75 ? 'black' : 'dark') : ['black', 'dark', 'brown', 'brown', 'auburn', 'blond'][Math.floor(r() * 6)];
        if (age >= 72) hair = 'white'; else if (age >= 58) hair = r() < 0.7 ? 'gray' : hair;
        const styles = female ? (dark ? ['curls', 'long', 'bun', 'bob'] : ['long', 'bob', 'bun', 'long']) : ['short', 'side', 'crop', 'short'];
        let style = styles[Math.floor(r() * styles.length)];
        if (!female && age >= 60 && r() < 0.5) style = 'bald';
        const glasses = age >= 50 ? r() < 0.55 : r() < 0.18, beard = !female && age >= 25 && r() < 0.3, shirt = SHIRTS[Math.floor(r() * SHIRTS.length)];
        return { female, age, child: age < 13, minor: age < 18, tone, toneName: SKIN_NAMES[t], hair: HAIR[hair], hairName: hair, style, glasses, beard,
            shirt: shirt[0], shirtName: shirt[1], seed: h };
    }
    // A head-and-shoulders portrait in a w×h box at 0,0 (the ID's photo box), drawn at 84×104 and scaled; the caller clips it.
    function portrait(mc, w, h, uid) {
        const L = looksOf(mc), id = 'pt' + (uid || hash(mc.id).toString(36)), t = L.tone, hc = L.hair;
        const skin = (d) => hsl(t, d), hair = (d) => hsl(hc, d), shirt = (d) => hsl(L.shirt, d);
        const kid = L.child, cx = 42, cy = kid ? 50 : 46, rx = kid ? 15 : 15.5, ry = kid ? 16.5 : 19.5;
        let s = `<defs><linearGradient id="${id}-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e3e9f0"/><stop offset="1" stop-color="#b9c5d3"/></linearGradient>
<radialGradient id="${id}-face" cx=".42" cy=".38" r=".75"><stop offset="0" stop-color="${skin(8)}"/><stop offset=".7" stop-color="${skin(0)}"/><stop offset="1" stop-color="${skin(-10)}"/></radialGradient>
<linearGradient id="${id}-shirt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shirt(8)}"/><stop offset="1" stop-color="${shirt(-10)}"/></linearGradient>
<linearGradient id="${id}-hair" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hair(10)}"/><stop offset="1" stop-color="${hair(-6)}"/></linearGradient></defs>`;
        s += `<rect width="84" height="104" fill="url(#${id}-bg)"/>`;
        // hair behind the head (long hair, curls)
        if (L.female && L.style === 'long') s += `<path d="M${cx - rx - 4},${cy - 6} C${cx - rx - 8},${cy + 22} ${cx - rx - 4},${cy + 40} ${cx - rx + 2},${cy + 46} L${cx + rx - 2},${cy + 46} C${cx + rx + 4},${cy + 40} ${cx + rx + 8},${cy + 22} ${cx + rx + 4},${cy - 6} Z" fill="url(#${id}-hair)"/>`;
        if (L.style === 'curls') s += `<ellipse cx="${cx}" cy="${cy - 4}" rx="${rx + 10}" ry="${ry + 8}" fill="url(#${id}-hair)"/>`;
        if (L.style === 'bob') s += `<path d="M${cx - rx - 4},${cy - 8} C${cx - rx - 6},${cy + 12} ${cx - rx - 2},${cy + 20} ${cx - rx + 4},${cy + 22} L${cx + rx - 4},${cy + 22} C${cx + rx + 2},${cy + 20} ${cx + rx + 6},${cy + 12} ${cx + rx + 4},${cy - 8} Z" fill="url(#${id}-hair)"/>`;
        // shoulders and the shirt, the neck
        const sy = kid ? 86 : 80;
        s += `<path d="M-2,104 L-2,${sy + 12} C4,${sy} 16,${sy - 4} 28,${sy - 6} L56,${sy - 6} C68,${sy - 4} 80,${sy} 86,${sy + 12} L86,104 Z" fill="url(#${id}-shirt)"/>`;
        s += `<path d="M${cx - 7},${cy + ry - 6} L${cx - 7},${sy - 4} Q${cx},${sy + 4} ${cx + 7},${sy - 4} L${cx + 7},${cy + ry - 6} Z" fill="${skin(-8)}"/>`;
        s += L.female ? `<path d="M${cx - 12},${sy - 6} Q${cx},${sy + 10} ${cx + 12},${sy - 6}" fill="none" stroke="${shirt(-18)}" stroke-width="1.2"/>`
            : `<path d="M${cx - 13},${sy - 6} L${cx - 3},${sy + 8} L${cx},${sy - 2} L${cx + 3},${sy + 8} L${cx + 13},${sy - 6}" fill="${shirt(14)}" stroke="${shirt(-18)}" stroke-width=".8"/>`;
        // ears, face
        s += `<ellipse cx="${cx - rx + 0.5}" cy="${cy + 2}" rx="3" ry="5" fill="${skin(-6)}"/><ellipse cx="${cx + rx - 0.5}" cy="${cy + 2}" rx="3" ry="5" fill="${skin(-6)}"/>`;
        s += `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${id}-face)"/>`;
        s += `<path d="M${cx - rx + 3},${cy + 6} Q${cx},${cy + ry + 4} ${cx + rx - 3},${cy + 6}" fill="none" stroke="${skin(-14)}" stroke-opacity=".35" stroke-width="1.4"/>`;
        // eyes, brows, nose, mouth
        const ey = cy - (kid ? 1 : 3), ex = kid ? 6.2 : 6;
        [cx - ex, cx + ex].forEach(x => {
            s += `<ellipse cx="${x}" cy="${ey}" rx="${kid ? 2.8 : 2.6}" ry="${kid ? 1.9 : 1.5}" fill="#f8fafc"/><circle cx="${x}" cy="${ey}" r="${kid ? 1.5 : 1.2}" fill="${t[2] > 70 && (L.seed % 3 === 0) ? '#3b6ea5' : '#3b2a1e'}"/><circle cx="${x + 0.4}" cy="${ey - 0.4}" r=".35" fill="#fff"/>`
                + `<path d="M${x - 2.8},${ey - 1.2} Q${x},${ey - 2.6} ${x + 2.8},${ey - 1.2}" fill="none" stroke="${skin(-28)}" stroke-width=".7"/>`
                + `<path d="M${x - 3},${ey - 4.6} Q${x},${ey - 6.2} ${x + 3.2},${ey - 4.4}" fill="none" stroke="${L.age >= 72 ? hsl(hc, -30) : hair(-4)}" stroke-width="${L.female ? 0.9 : 1.4}" stroke-linecap="round"/>`;
        });
        s += `<path d="M${cx - 0.5},${ey + 1} Q${cx - 2.2},${ey + 8} ${cx - 2.6},${ey + 9.5} Q${cx},${ey + 11} ${cx + 2.6},${ey + 9.5}" fill="none" stroke="${skin(-22)}" stroke-width=".9" stroke-linecap="round"/>`;
        const my = ey + (kid ? 14 : 15.5);
        s += `<path d="M${cx - 4.6},${my} Q${cx},${my + (L.seed % 2 ? 2 : 1.2)} ${cx + 4.6},${my}" fill="none" stroke="${hsl([t[0] - 12, t[1] + 10, t[2] - 26])}" stroke-width="${L.female ? 1.5 : 1.2}" stroke-linecap="round"/>`;
        if (L.female && !kid) s += `<path d="M${cx - 4},${my - 0.4} Q${cx},${my - 1.6} ${cx + 4},${my - 0.4}" fill="none" stroke="${hsl([355, 40, Math.max(28, t[2] - 30)])}" stroke-opacity=".7" stroke-width="1.3" stroke-linecap="round"/>`;
        if (L.age >= 55) s += `<path d="M${cx - 5},${ey + 8} q-2,4 -1,7 M${cx + 5},${ey + 8} q2,4 1,7 M${cx - 6},${cy - ry + 8} q6,-1.5 12,0" fill="none" stroke="${skin(-18)}" stroke-opacity=".5" stroke-width=".6"/>`;
        if (L.beard) s += `<path d="M${cx - rx + 2},${cy + 2} Q${cx - rx + 3},${cy + ry + 2} ${cx},${cy + ry + 2} Q${cx + rx - 3},${cy + ry + 2} ${cx + rx - 2},${cy + 2} Q${cx + 6},${my + 4} ${cx},${my + 3} Q${cx - 6},${my + 4} ${cx - rx + 2},${cy + 2} Z" fill="${hair(-2)}" fill-opacity=".85"/><path d="M${cx - 5},${my - 2} Q${cx},${my - 4} ${cx + 5},${my - 2}" stroke="${hair(-2)}" stroke-width="1.8" fill="none"/>`;
        // hair on top
        const top = cy - ry;
        if (L.style === 'bald') s += `<path d="M${cx - rx - 0.5},${cy - 2} C${cx - rx - 1},${cy - 10} ${cx - rx + 2},${cy - 14} ${cx - rx + 4},${cy - 14}" stroke="url(#${id}-hair)" stroke-width="4" fill="none"/><path d="M${cx + rx + 0.5},${cy - 2} C${cx + rx + 1},${cy - 10} ${cx + rx - 2},${cy - 14} ${cx + rx - 4},${cy - 14}" stroke="url(#${id}-hair)" stroke-width="4" fill="none"/>`;
        else if (L.style === 'curls') s += Array.from({ length: 11 }, (_, i) => { const a = Math.PI * (1.05 + i * 0.09); return `<circle cx="${f1(cx + Math.cos(a) * (rx + 2))}" cy="${f1(cy - 4 + Math.sin(a) * (ry + 2))}" r="5.5" fill="url(#${id}-hair)"/>`; }).join('');
        else if (L.style === 'crop') s += `<path d="M${cx - rx},${cy - 4} C${cx - rx},${top - 2} ${cx + rx},${top - 2} ${cx + rx},${cy - 4} C${cx + rx - 2},${top + 6} ${cx - rx + 2},${top + 6} ${cx - rx},${cy - 4} Z" fill="url(#${id}-hair)" fill-opacity=".9"/>`;
        else if (L.style === 'side' || L.style === 'short') s += `<path d="M${cx - rx - 1},${cy - 1} C${cx - rx - 2},${top - 4} ${cx + rx + 2},${top - 6} ${cx + rx + 1},${cy - 1} C${cx + rx - 1},${top + 8} ${cx + (L.style === 'side' ? 2 : 6)},${top + 5} ${cx - 2},${top + 7} C${cx - 8},${top + 8} ${cx - rx + 1},${top + 9} ${cx - rx - 1},${cy - 1} Z" fill="url(#${id}-hair)"/>`;
        else {
            // long, bob, bun: the hair over the top with a parting
            s += `<path d="M${cx - rx - 2},${cy + 4} C${cx - rx - 4},${top - 6} ${cx + rx + 4},${top - 6} ${cx + rx + 2},${cy + 4} C${cx + rx - 1},${top + 10} ${cx + 4},${top + 6} ${cx - 1},${top + 4} C${cx - 6},${top + 9} ${cx - rx + 1},${top + 10} ${cx - rx - 2},${cy + 4} Z" fill="url(#${id}-hair)"/>`;
            if (L.style === 'bun') s += `<circle cx="${cx}" cy="${top - 3}" r="7" fill="url(#${id}-hair)"/>`;
        }
        if (kid && !L.female) s += `<path d="M${cx - 8},${top + 6} q4,4 9,1 q4,3 8,-1" fill="none" stroke="${hair(-6)}" stroke-width="1.2"/>`;
        if (L.glasses) s += `<g fill="none" stroke="#1f2937" stroke-width="1"><rect x="${cx - ex - 4.6}" y="${ey - 3.4}" width="9.2" height="6.6" rx="2.4"/><rect x="${cx + ex - 4.6}" y="${ey - 3.4}" width="9.2" height="6.6" rx="2.4"/><path d="M${cx - ex + 4.6},${ey - 0.6} L${cx + ex - 4.6},${ey - 0.6} M${cx - ex - 4.6},${ey - 1} L${cx - rx},${ey - 2} M${cx + ex + 4.6},${ey - 1} L${cx + rx},${ey - 2}"/></g>`;
        // the camera's light and a little grain
        s += `<rect width="84" height="104" fill="url(#${id}-bg)" fill-opacity=".06"/>`;
        // a group, not a nested <svg>: the page's CSS for the ID card's svg (width: 100%) would resize a nested one; the ID clips it
        return `<g transform="scale(${f1(w / 84)} ${f1(h / 104)})">${s}</g>`;
    }

    // where a vehicle photo can show damage (pdPhotos' and CRASH photos' area; .github/scripts/check-data.mjs checks them)
    const AREAS = ['front', 'rear', 'left side', 'right side', 'front left', 'front right', 'rear left', 'rear right'];
    const api = { CRASH, PAINT, AREAS, scene, vehiclePhoto, vehiclePhotos, portrait, looksOf, vehicleOf, bodyOf, hasScene: (mc) => !!CRASH[mc && mc.id] };
    root.LSHCasePhotos = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
