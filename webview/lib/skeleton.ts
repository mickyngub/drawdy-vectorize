import { polylineLength } from "./simplify";

export type TraceOptions = {
    // Spurs (a free end joined to a junction) shorter than this are dropped, in pixels.
    minLength: number;
    // Free ends at most this many empty pixels apart are joined.
    bridge: number;
};

type End = {
    id: number;
    line: Line;
    atStart: boolean;
    free: boolean;
    x: number;
    y: number;
};

type Line = {
    pts: number[];
    from: number;
    to: number;
    a: End | null;
    b: End | null;
    alive: boolean;
};

const OFFSETS: [number, number][] = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
];

function reverse(line: Line): void {
    const pts = line.pts;
    const out = new Array<number>(pts.length);
    for (let i = 0; i < pts.length; i += 2) {
        out[pts.length - 2 - i] = pts[i];
        out[pts.length - 1 - i] = pts[i + 1];
    }
    line.pts = out;
    [line.from, line.to] = [line.to, line.from];
    [line.a, line.b] = [line.b, line.a];
    if (line.a) line.a.atStart = true;
    if (line.b) line.b.atStart = false;
}

// Joins `first` (ending at the shared point) to `second` (starting there); the shared point appears once.
function concat(first: Line, second: Line): Line {
    const joined: Line = {
        pts: first.pts.concat(second.pts.slice(2)),
        from: first.from,
        to: second.to,
        a: first.a,
        b: second.b,
        alive: true,
    };
    if (joined.a) {
        joined.a.line = joined;
        joined.a.atStart = true;
    }
    if (joined.b) {
        joined.b.line = joined;
        joined.b.atStart = false;
    }
    first.alive = false;
    second.alive = false;
    return joined;
}

// Traces a one-pixel skeleton into polylines through pixel centres. Diagonal steps only count where no
// side step joins the two pixels, so staircases do not read as junctions. Branches end at the centre of
// their junction, so they meet at one point.
export function traceSkeleton(
    skel: Uint8Array,
    w: number,
    h: number,
    options: TraceOptions
): number[][] {
    const on = (x: number, y: number): boolean =>
        x >= 0 && y >= 0 && x < w && y < h && skel[y * w + x] === 1;
    const neighbours = (i: number, out: number[]): number[] => {
        out.length = 0;
        const x = i % w;
        const y = (i - x) / w;
        for (const [dx, dy] of OFFSETS) {
            if (!on(x + dx, y + dy)) continue;
            if (dx !== 0 && dy !== 0 && (on(x + dx, y) || on(x, y + dy)))
                continue;
            out.push((y + dy) * w + x + dx);
        }
        return out;
    };

    const nb: number[] = [];
    const degree = new Uint8Array(skel.length);
    for (let i = 0; i < skel.length; i++) {
        if (skel[i]) degree[i] = neighbours(i, nb).length;
    }

    // Node ids: junction clusters share one id; free ends get their own.
    const node = new Int32Array(skel.length).fill(-1);
    const nodeX: number[] = [];
    const nodeY: number[] = [];
    const junction: boolean[] = [];
    const queue: number[] = [];
    for (let i = 0; i < skel.length; i++) {
        if (!skel[i] || degree[i] === 2 || node[i] >= 0) continue;
        const id = nodeX.length;
        if (degree[i] < 3) {
            node[i] = id;
            nodeX.push((i % w) + 0.5);
            nodeY.push(Math.floor(i / w) + 0.5);
            junction.push(false);
            continue;
        }
        let sx = 0;
        let sy = 0;
        let count = 0;
        queue.length = 0;
        queue.push(i);
        node[i] = id;
        while (queue.length) {
            const j = queue.pop()!;
            sx += (j % w) + 0.5;
            sy += Math.floor(j / w) + 0.5;
            count++;
            for (const k of neighbours(j, [])) {
                if (degree[k] >= 3 && node[k] < 0) {
                    node[k] = id;
                    queue.push(k);
                }
            }
        }
        nodeX.push(sx / count);
        nodeY.push(sy / count);
        junction.push(true);
    }

    const lines: Line[] = [];
    const used = new Uint8Array(skel.length);
    const centre = (i: number): [number, number] => [
        (i % w) + 0.5,
        Math.floor(i / w) + 0.5,
    ];
    const addLine = (pts: number[], from: number, to: number) => {
        lines.push({ pts, from, to, a: null, b: null, alive: true });
    };

    for (let p = 0; p < skel.length; p++) {
        if (!skel[p] || degree[p] === 2) continue;
        const start = node[p];
        if (degree[p] === 0) {
            const [x, y] = centre(p);
            addLine([x - 0.25, y, x + 0.25, y], start, start);
            continue;
        }
        for (const q of neighbours(p, [])) {
            if (degree[q] !== 2) {
                if (node[q] !== start && p < q) {
                    addLine(
                        [
                            nodeX[start],
                            nodeY[start],
                            nodeX[node[q]],
                            nodeY[node[q]],
                        ],
                        start,
                        node[q]
                    );
                }
                continue;
            }
            if (used[q]) continue;
            used[q] = 1;
            const pts = [nodeX[start], nodeY[start], ...centre(q)];
            let prev = p;
            let cur = q;
            let end = -1;
            for (;;) {
                const around = neighbours(cur, nb);
                const step = around[0] === prev ? around[1] : around[0];
                if (step === undefined) break;
                if (degree[step] !== 2) {
                    end = node[step];
                    pts.push(nodeX[end], nodeY[end]);
                    break;
                }
                if (used[step]) break;
                used[step] = 1;
                pts.push(...centre(step));
                prev = cur;
                cur = step;
            }
            if (end >= 0) addLine(pts, start, end);
        }
    }

    // Loops with no junction or free end, like the letter O.
    for (let i = 0; i < skel.length; i++) {
        if (!skel[i] || degree[i] !== 2 || used[i]) continue;
        used[i] = 1;
        const pts = centre(i).slice();
        let prev = -1;
        let cur = i;
        for (;;) {
            const around = neighbours(cur, nb);
            const step = around[0] === prev ? around[1] : around[0];
            if (step === undefined || used[step]) break;
            used[step] = 1;
            pts.push(...centre(step));
            prev = cur;
            cur = step;
        }
        pts.push(pts[0], pts[1]);
        lines.push({ pts, from: -1, to: -1, a: null, b: null, alive: true });
    }

    // Thick crossings thin into several junctions a few pixels apart; fold them into one.
    const root = nodeX.map((_, id) => id);
    const find = (id: number): number => {
        while (root[id] !== id) {
            root[id] = root[root[id]];
            id = root[id];
        }
        return id;
    };
    for (const line of lines) {
        if (
            line.from < 0 ||
            line.from === line.to ||
            !junction[line.from] ||
            !junction[line.to] ||
            polylineLength(line.pts) >= options.minLength
        )
            continue;
        const a = find(line.from);
        const b = find(line.to);
        if (a === b) continue;
        root[b] = a;
        nodeX[a] = (nodeX[a] + nodeX[b]) / 2;
        nodeY[a] = (nodeY[a] + nodeY[b]) / 2;
    }
    for (const line of lines) {
        if (line.from < 0) continue;
        line.from = find(line.from);
        line.to = find(line.to);
        const n = line.pts.length;
        if (junction[line.from]) {
            line.pts[0] = nodeX[line.from];
            line.pts[1] = nodeY[line.from];
        }
        if (junction[line.to]) {
            line.pts[n - 2] = nodeX[line.to];
            line.pts[n - 1] = nodeY[line.to];
        }
    }

    const incident = new Map<number, Line[]>();
    const attach = (id: number, line: Line) => {
        if (id < 0 || !junction[id]) return;
        const list = incident.get(id);
        if (list) list.push(line);
        else incident.set(id, [line]);
    };
    const detach = (id: number, line: Line) => {
        const list = incident.get(id);
        if (!list) return;
        const at = list.indexOf(line);
        if (at >= 0) list.splice(at, 1);
    };
    for (const line of lines) {
        attach(line.from, line);
        if (line.to !== line.from) attach(line.to, line);
    }

    for (const line of lines) {
        if (
            line.from >= 0 &&
            line.from === line.to &&
            junction[line.from] &&
            polylineLength(line.pts) < options.minLength * 2
        ) {
            line.alive = false;
            detach(line.from, line);
        }
    }

    const spurs = lines
        .filter(
            (line) =>
                line.from >= 0 &&
                junction[line.from] !== junction[line.to] &&
                polylineLength(line.pts) < options.minLength
        )
        .sort((a, b) => polylineLength(a.pts) - polylineLength(b.pts));
    for (const spur of spurs) {
        const at = junction[spur.from] ? spur.from : spur.to;
        const list = incident.get(at)!;
        if (list.length <= 2) continue;
        spur.alive = false;
        detach(at, spur);
    }

    // A junction left with two branches is no junction: join them into one line.
    for (const [id, list] of incident) {
        if (list.length !== 2 || list[0] === list[1]) continue;
        let [first, second] = list;
        if (first.to !== id) reverse(first);
        if (second.from !== id) reverse(second);
        const joined = concat(first, second);
        lines.push(joined);
        incident.delete(id);
        for (const other of [joined.from, joined.to]) {
            const others = incident.get(other);
            if (!others) continue;
            for (let k = 0; k < others.length; k++) {
                if (others[k] === first || others[k] === second)
                    others[k] = joined;
            }
        }
    }

    const ends: End[] = [];
    for (const line of lines) {
        if (!line.alive || line.from < 0) continue;
        const n = line.pts.length;
        if (!junction[line.from] && line.from !== line.to) {
            line.a = {
                id: ends.length,
                line,
                atStart: true,
                free: true,
                x: line.pts[0],
                y: line.pts[1],
            };
            ends.push(line.a);
        }
        if (!junction[line.to] && line.from !== line.to) {
            line.b = {
                id: ends.length,
                line,
                atStart: false,
                free: true,
                x: line.pts[n - 2],
                y: line.pts[n - 1],
            };
            ends.push(line.b);
        }
    }

    const reach = options.bridge + 1;
    if (options.bridge > 0 && ends.length > 1) {
        const cell = Math.max(1, reach);
        const buckets = new Map<string, End[]>();
        const keyOf = (x: number, y: number) =>
            `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
        for (const end of ends) {
            const key = keyOf(end.x, end.y);
            const list = buckets.get(key);
            if (list) list.push(end);
            else buckets.set(key, [end]);
        }
        const pairs: { d: number; e1: End; e2: End }[] = [];
        for (const e1 of ends) {
            const cx = Math.floor(e1.x / cell);
            const cy = Math.floor(e1.y / cell);
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    for (const e2 of buckets.get(`${cx + dx},${cy + dy}`) ??
                        []) {
                        if (e2.id <= e1.id) continue;
                        const d = Math.hypot(e1.x - e2.x, e1.y - e2.y);
                        if (d <= reach + 1e-9) pairs.push({ d, e1, e2 });
                    }
                }
            }
        }
        pairs.sort((p, q) => p.d - q.d);
        for (const { e1, e2 } of pairs) {
            if (!e1.free || !e2.free) continue;
            if (e1.line === e2.line) {
                const line = e1.line;
                if (polylineLength(line.pts) <= 4 * reach) continue;
                line.pts.push(line.pts[0], line.pts[1]);
                e1.free = false;
                e2.free = false;
                line.a = null;
                line.b = null;
                continue;
            }
            const first = e1.line;
            const second = e2.line;
            if (e1.atStart) reverse(first);
            if (!e2.atStart) reverse(second);
            e1.free = false;
            e2.free = false;
            first.b = null;
            second.a = null;
            const joined: Line = {
                pts: first.pts.concat(second.pts),
                from: first.from,
                to: second.to,
                a: first.a,
                b: second.b,
                alive: true,
            };
            if (joined.a) {
                joined.a.line = joined;
                joined.a.atStart = true;
            }
            if (joined.b) {
                joined.b.line = joined;
                joined.b.atStart = false;
            }
            first.alive = false;
            second.alive = false;
            lines.push(joined);
        }
    }

    return lines.filter((line) => line.alive).map((line) => line.pts);
}
