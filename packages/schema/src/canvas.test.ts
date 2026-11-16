import { describe, expect, it } from "vitest"

import { canvasProblem } from "./canvas"

const video = { kind: "video" as const, width: 1080, height: 1920, durationMs: 6_000 }

describe("canvasProblem", () => {
  it("accepts a vertical 3–8 second video", () => {
    expect(canvasProblem(video)).toBeNull()
    expect(canvasProblem({ ...video, width: 720, height: 1280, durationMs: 3_000 })).toBeNull()
    expect(canvasProblem({ ...video, durationMs: 8_000, mimeType: "video/quicktime" })).toBeNull()
  })

  it("rejects the wrong length, shape, size or format", () => {
    expect(canvasProblem({ ...video, durationMs: 2_999 })).toMatch(/3–8 seconds/)
    expect(canvasProblem({ ...video, durationMs: 9_000 })).toMatch(/3–8 seconds/)
    expect(canvasProblem({ ...video, width: 1920, height: 1080 })).toMatch(/9:16/)
    expect(canvasProblem({ ...video, width: 1179, height: 2556 })).toMatch(/9:16/)
    expect(canvasProblem({ ...video, width: 360, height: 640 })).toMatch(/720px/)
    expect(canvasProblem({ ...video, mimeType: "video/webm" })).toMatch(/MP4/)
    expect(canvasProblem({ kind: "audio", width: null, height: null, durationMs: null })).not.toBeNull()
  })

  it("checks a still's shape but not its length", () => {
    expect(canvasProblem({ kind: "image", width: 608, height: 1080, durationMs: null })).toBeNull()
    expect(canvasProblem({ kind: "image", width: 1080, height: 1080, durationMs: null })).toMatch(/9:16/)
  })

  it("lets unmeasured media through", () => {
    expect(canvasProblem({ kind: "video", width: null, height: null, durationMs: null })).toBeNull()
  })
})
