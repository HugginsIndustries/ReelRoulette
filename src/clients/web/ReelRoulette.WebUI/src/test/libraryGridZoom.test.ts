// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ZOOM_SETTLE_MS,
  createGridZoom,
  zoomOverscanPx,
  type GridZoomStart,
  type ZoomPoint,
  type ZoomView
} from "../library/libraryGridZoom";

/** The scales a gesture at 160 px rows can reach, 120 to 300 px. */
const START: GridZoomStart = { left: 20, top: 40, minScale: 120 / 160, maxScale: 300 / 160 };

function host(start: GridZoomStart | null = START) {
  const shows: ZoomView[] = [];
  const settles: Array<{ view: ZoomView; focus: ZoomPoint }> = [];
  const zoom = createGridZoom({
    begin: () => start,
    show: (view) => shows.push(view),
    settle: (view, focus) => settles.push({ view, focus })
  });
  return { zoom, shows, settles, last: () => shows.at(-1)! };
}

function notch(deltaY: number, clientX = 220, clientY = 340) {
  return { deltaY, deltaMode: 0, clientX, clientY };
}

function touches(...points: Array<[number, number]>) {
  return points.map(([clientX, clientY]) => ({ clientX, clientY }));
}

/** Where a point on the screen falls in the rows' layer, which a scale around it keeps still. */
function layerPoint(view: ZoomView, clientX: number, clientY: number): [number, number] {
  return [(clientX - START.left - view.x) / view.scale, (clientY - START.top - view.y) / view.scale];
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("grid zoom by the wheel", () => {
  it("zooms a wheel notch 15%, eased over a few frames, around the pointer", () => {
    const { zoom, shows, last } = host();

    zoom.wheel(notch(-100));
    vi.advanceTimersToNextFrame();
    expect(last().scale).toBeGreaterThan(1);
    expect(last().scale).toBeLessThan(1.15);
    vi.advanceTimersByTime(250);

    expect(shows.length).toBeGreaterThan(3);
    expect(last().scale).toBe(1.15);
    const [x, y] = layerPoint(last(), 220, 340);
    expect(x).toBeCloseTo(200, 9);
    expect(y).toBeCloseTo(300, 9);
  });

  it("scales by a trackpad's small deltas as they come, about 1% a pixel, and the other way for deltas down", () => {
    const { zoom, last } = host();

    zoom.wheel(notch(-4));
    vi.advanceTimersToNextFrame();
    expect(last().scale).toBeCloseTo(Math.exp(0.04), 9);
    zoom.wheel(notch(6));
    vi.advanceTimersToNextFrame();
    expect(last().scale).toBeCloseTo(Math.exp(-0.02), 9);
  });

  it("zooms no further than the scales the gesture can reach", () => {
    const zoomIn = host();
    for (let i = 0; i < 20; i++) {
      zoomIn.zoom.wheel(notch(-100));
    }
    vi.advanceTimersByTime(1000);
    expect(zoomIn.settles[0]!.view.scale).toBe(START.maxScale);

    const zoomOut = host();
    for (let i = 0; i < 20; i++) {
      zoomOut.zoom.wheel(notch(100));
    }
    vi.advanceTimersByTime(1000);
    expect(zoomOut.settles[0]!.view.scale).toBe(START.minScale);
  });

  it("settles 200 ms after the wheel stops, at the view it shows and with the pointer where it last was", () => {
    const { zoom, settles, last } = host();

    zoom.wheel(notch(-100));
    vi.advanceTimersByTime(150);
    zoom.wheel(notch(-100, 250, 360));
    vi.advanceTimersByTime(ZOOM_SETTLE_MS - 1);
    expect(settles).toHaveLength(0);
    expect(zoom.isActive()).toBe(true);
    vi.advanceTimersByTime(1);

    expect(settles).toEqual([{ view: last(), focus: { x: 250, y: 360 } }]);
    expect(settles[0]!.view.scale).toBeCloseTo(1.15 * 1.15, 9);
    expect(zoom.isActive()).toBe(false);
  });

  it("waits for a notch's ease to arrive before it settles", () => {
    const { zoom, settles, last } = host();

    zoom.wheel(notch(-100));
    zoom.wheel(notch(-100));
    zoom.wheel(notch(-100));
    zoom.wheel(notch(-100));
    vi.advanceTimersByTime(ZOOM_SETTLE_MS);
    expect(last().scale).toBeLessThan(START.maxScale);
    expect(settles).toHaveLength(0);

    vi.advanceTimersByTime(500);
    expect(settles).toHaveLength(1);
    expect(settles[0]!.view.scale).toBeCloseTo(1.15 ** 4, 9);
  });
});

describe("grid zoom by a pinch", () => {
  it("scales around the pinch's center and pans as the center moves, claiming the moves", () => {
    const { zoom, last } = host();

    zoom.touchStart(touches([150, 300]));
    zoom.touchStart(touches([150, 300], [250, 300]));
    expect(zoom.touchMove(touches([135, 320], [285, 320]))).toBe(true);

    // The spread grew by half around (200, 300), then the center moved 10 right and 20 down.
    expect(last().scale).toBe(1.5);
    const [x, y] = layerPoint(last(), 210, 320);
    expect(x).toBeCloseTo(180, 9);
    expect(y).toBeCloseTo(260, 9);
  });

  it("settles as a finger lifts, with its center where the fingers last were", () => {
    const { zoom, settles, last } = host();

    zoom.touchStart(touches([150, 300], [250, 300]));
    zoom.touchMove(touches([140, 300], [260, 310]));
    zoom.touchEnd(1);

    expect(settles).toEqual([{ view: last(), focus: { x: 200, y: 305 } }]);
    expect(zoom.isActive()).toBe(false);
    expect(zoom.touchMove(touches([140, 300], [260, 310]))).toBe(false);
  });

  it("keeps the scale within what the gesture can reach", () => {
    const { zoom, last } = host();

    zoom.touchStart(touches([190, 300], [210, 300]));
    zoom.touchMove(touches([0, 300], [400, 300]));
    expect(last().scale).toBe(START.maxScale);
    zoom.touchMove(touches([199, 300], [201, 300]));
    expect(last().scale).toBe(START.minScale);
  });

  it("leaves one finger's moves to the browser's scroll", () => {
    const { zoom, shows } = host();

    zoom.touchStart(touches([150, 300]));
    expect(zoom.touchMove(touches([150, 200]))).toBe(false);
    zoom.touchEnd(0);

    expect(shows).toHaveLength(0);
    expect(zoom.isActive()).toBe(false);
  });
});

describe("grid zoom", () => {
  it("starts no gesture where the grid shows no rows", () => {
    const { zoom, shows, settles } = host(null);

    zoom.wheel(notch(-100));
    zoom.touchStart(touches([150, 300], [250, 300]));
    expect(zoom.touchMove(touches([100, 300], [300, 300]))).toBe(false);
    zoom.touchEnd(0);
    vi.advanceTimersByTime(1000);

    expect(zoom.isActive()).toBe(false);
    expect(shows).toHaveLength(0);
    expect(settles).toHaveLength(0);
  });

  it("drops a gesture that is cancelled, without settling it", () => {
    const { zoom, settles } = host();

    zoom.wheel(notch(-100));
    zoom.cancel();
    vi.advanceTimersByTime(1000);

    expect(zoom.isActive()).toBe(false);
    expect(settles).toHaveLength(0);
  });

  it("renders rows far enough around the view to fill it at the smallest scale, and at least as far as scrolling does", () => {
    expect(zoomOverscanPx(600, 1 / 3)).toBe(1200);
    expect(zoomOverscanPx(600, 100 / 160)).toBe(900);
    expect(zoomOverscanPx(600, 1)).toBe(900);
  });
});
