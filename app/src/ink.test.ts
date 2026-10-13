import { describe, expect, it } from "vitest";
import { LiveBrush, brushShape, constrain, snapDrag, dabPoints, linePath, overlaps, snapShape, turn, worksOnPaint, type Stroke } from "./ink";

const line = (size = 4): Stroke => ({
  color: "ink",
  size,
  points: [
    [0, 0, 0.5],
    [100, 0, 0.5],
  ],
  streamline: 0,
  simulatePressure: true,
  opacity: 1,
  erase: false,
});

describe("eraser", () => {
  it("follows exactly where it passes, even at deep zoom", () => {
    const pass: Stroke = { ...line(0.002), erase: true, points: [[500.1234, 300.5, 0.5], [500.1254, 300.5, 0.5]] };
    const { d, origin, factor } = linePath(pass);
    expect(origin).toEqual([500.1234, 300.5]);
    // The path is computed enlarged to normal size: no decimals are lost.
    const [, x2] = d.match(/L(-?[\d.]+),/)!;
    expect(origin[0] + Number(x2) / factor).toBeCloseTo(500.1254, 6);
  });

  it("erases with a single tap", () => {
    const { d } = linePath({ ...line(), erase: true, points: [[5, 5, 0.5]] });
    expect(d).toBe("M0.00,0.00L0.00,0.00");
  });

  it("knows which drawings a pass could touch", () => {
    const a = { minX: 0, minY: 0, maxX: 100, maxY: 0 };
    expect(overlaps(a, 2, { minX: 50, minY: 5, maxX: 60, maxY: 9 }, 4)).toBe(true);
    expect(overlaps(a, 2, { minX: 50, minY: 10, maxX: 60, maxY: 20 }, 4)).toBe(false);
    expect(overlaps(undefined, 2, a, 2)).toBe(false);
  });
});

describe("shapes", () => {
  const shape = (kind: Stroke["shape"], points: Stroke["points"]): Stroke => ({ ...line(4), shape: kind, simulatePressure: false, points });

  it("draws each shape between the first and last point", () => {
    expect(linePath(shape("rect", [[10, 10, 0.5], [50, 30, 0.5]])).d).toBe("M0.00,0.00H40.00V20.00H0.00Z");
    expect(linePath(shape("line", [[10, 10, 0.5], [50, 30, 0.5]])).d).toBe("M0.00,0.00L40.00,20.00");
    expect(linePath(shape("ellipse", [[0, 0, 0.5], [40, 20, 0.5]])).d).toContain("A20.00,10.00");
    // The arrow: the line and the two wings of the head.
    expect(linePath(shape("arrow", [[0, 0, 0.5], [100, 0, 0.5]])).d.split("M")).toHaveLength(3);
  });

  it("keeps squares, circles and 45° lines even with Shift", () => {
    expect(constrain([0, 0, 0.5], [30, 10, 0.5], true, "rect")).toEqual([30, 30, 0.5]);
    expect(constrain([0, 0, 0.5], [-30, 10, 0.5], true, "ellipse")).toEqual([-30, 30, 0.5]);
    const [x, y] = constrain([0, 0, 0.5], [100, 8, 0.5], true, "line");
    expect(y).toBe(0);
    expect(x).toBeCloseTo(100.32, 1);
    expect(constrain([0, 0, 0.5], [30, 10, 0.5], false, "rect")).toEqual([30, 10, 0.5]);
  });
});

describe("brush", () => {
  it("keeps tiny strokes in place at deep zoom", () => {
    const points = Array.from({ length: 11 }, (_, i): [number, number, number] => [464 + i * 0.2, 222 + i * 0.04, 0.5]);
    const { circles, origin, factor } = brushShape({ ...line(0.06), points }, true);
    const xs = circles.flatMap(([x, , r]) => [origin[0] + (x - r) / factor, origin[0] + (x + r) / factor]);
    const ys = circles.flatMap(([, y, r]) => [origin[1] + (y - r) / factor, origin[1] + (y + r) / factor]);
    // The stroke stays close to the points: it spills over by no more than its thickness.
    expect(Math.min(...xs)).toBeGreaterThan(464 - 0.1);
    expect(Math.max(...xs)).toBeLessThan(466 + 0.1);
    expect(Math.min(...ys)).toBeGreaterThan(222 - 0.1);
    expect(Math.max(...ys)).toBeLessThan(222.4 + 0.1);
  });

  it("never leaves holes: a thick zigzag turns the same way everywhere", () => {
    const points = Array.from({ length: 30 }, (_, i): [number, number, number] => [i * 15, i % 2 ? 40 : -40, 0.5]);
    const { circles, quads } = brushShape({ ...line(60), points, opacity: 0.5 }, true);
    expect(circles.length).toBeGreaterThan(30);
    expect(quads.length).toBeGreaterThan(0);
    for (const quad of quads) expect(turn(quad)).toBeGreaterThan(0);
  });

  it("draws a single tap as a dot", () => {
    const { circles } = brushShape({ ...line(10), points: [[5, 5, 0.5]] }, true);
    expect(circles.length).toBeGreaterThan(0);
  });
});

describe("center guides", () => {
  const center = { x: 400, y: 528 };

  it("centers a line on the page", () => {
    // A line from x=100: its middle lands almost on the center, so it ends at 700.
    const { point, guides } = snapShape([100, 300, 0.5], [696, 304, 0.5], "line", center, 8);
    expect(point[0]).toBe(700);
    // And it is perfectly horizontal.
    expect(point[1]).toBe(300);
    expect(guides).toEqual([{ axis: "x", at: 400 }, { axis: "y", at: 300 }]);
  });

  it("touches the middle line", () => {
    const { point, guides } = snapShape([100, 100, 0.5], [395, 200, 0.5], "rect", center, 8);
    expect(point[0]).toBe(400);
    expect(guides).toEqual([{ axis: "x", at: 400 }]);
  });

  it("leaves the shape alone when it is far from every guide", () => {
    const { point, guides } = snapShape([100, 100, 0.5], [250, 200, 0.5], "ellipse", center, 8);
    expect(point).toEqual([250, 200, 0.5]);
    expect(guides).toEqual([]);
  });
});

describe("mixing", () => {
  it("places touches evenly along the stroke", () => {
    const dabs = dabPoints([[0, 0, 0.5], [10, 0, 0.5], [10, 10, 0.5]], 4);
    expect(dabs.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100])).toEqual([
      [0, 0],
      [4, 0],
      [8, 0],
      [10, 2],
      [10, 6],
      [10, 10],
    ]);
  });

  it("keeps the earlier touches when the stroke grows (live and saved look the same)", () => {
    const points: Stroke["points"] = [[0, 0, 0.5], [7, 3, 0.5], [12, 9, 0.5]];
    const before = dabPoints(points, 2.5);
    const after = dabPoints([...points, [20, 4, 0.5]], 2.5);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.length).toBeGreaterThan(before.length);
  });

  it("only blur and smudge work on what is already painted", () => {
    expect(worksOnPaint({ effect: "blur" })).toBe(true);
    expect(worksOnPaint({ effect: "smudge" })).toBe(true);
    expect(worksOnPaint({ effect: "watercolor" })).toBe(false);
    expect(worksOnPaint({})).toBe(false);
  });
});

describe("stroke in progress", () => {
  it("computed piece by piece, is the same stroke as computed whole", () => {
    let x = 10;
    let y = 10;
    const points: Stroke["points"] = [];
    for (let i = 0; i < 160; i++) {
      x += Math.cos(i / 7) * 6;
      y += Math.sin(i / 5) * 4;
      points.push([x, y, 0.5]);
    }
    for (const simulatePressure of [true, false]) {
      const stroke: Stroke = { ...line(6), points: [], streamline: 0.4, simulatePressure };
      const live = new LiveBrush({ ...stroke, points: points.slice(0, 1) });
      const circles: number[][] = [];
      const quads: number[][][] = [];
      for (let n = 1; n <= points.length; n++) {
        const growing = { ...stroke, points: points.slice(0, n) };
        const { added, end } = live.update(growing);
        circles.push(...added.circles);
        quads.push(...added.quads);
        const whole = brushShape(growing, false);
        expect([...circles, ...end.circles]).toEqual(whole.circles);
        expect([...quads, ...end.quads]).toEqual(whole.quads);
      }
      // Most of a long stroke is settled: only its end is computed again.
      expect(circles.length).toBeGreaterThan(brushShape({ ...stroke, points }, false).circles.length * 0.9);
    }
  });
});

describe("moving and resizing a shape with the guides", () => {
  const center = { x: 400, y: 500 };
  const box = (x0: number, y0: number, x1: number, y1: number): [Stroke["points"][0], Stroke["points"][0]] => [
    [x0, y0, 0.5],
    [x1, y1, 0.5],
  ];

  it("centers a shape that is moved near the middle", () => {
    const { points, guides } = snapDrag(box(303, 100, 503, 200), "move", "rect", center, 8);
    expect(points).toEqual(box(300, 100, 500, 200));
    expect(guides).toEqual([{ axis: "x", at: 400 }]);
  });

  it("makes a centered shape symmetric when one side is pulled", () => {
    // The left side stays at 300: the right one snaps to its mirror, 500.
    const { points, guides } = snapDrag(box(300, 100, 495, 200), "e", "rect", center, 8);
    expect(points).toEqual(box(300, 100, 500, 200));
    expect(guides).toEqual([{ axis: "x", at: 400 }]);
  });

  it("leaves alone what is far from the middle", () => {
    const far = box(100, 100, 200, 200);
    expect(snapDrag(far, "move", "rect", center, 8)).toEqual({ points: far, guides: [] });
    expect(snapDrag(far, "se", "ellipse", center, 8)).toEqual({ points: far, guides: [] });
  });

  it("snaps a line's end like when drawing it", () => {
    const { points } = snapDrag(box(300, 100, 497, 104), "end", "line", center, 8);
    expect(points[1][0]).toBe(500);
    expect(points[1][1]).toBe(100);
  });
});
