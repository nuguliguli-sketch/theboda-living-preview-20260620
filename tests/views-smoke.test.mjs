// DOM 빌더는 jsdom 미도입 → import + 함수 시그니처만 스모크(렌더는 수동 시각 검증).
import { describe, it, expect } from "vitest";
import { buildJourneyNav } from "../js/views/design-journey-nav.js";
import { buildConceptCarousel } from "../js/views/concept-carousel.js";

describe("views import smoke", () => {
  it("buildJourneyNav 가 함수로 export 된다", () => {
    expect(typeof buildJourneyNav).toBe("function");
  });
  it("buildConceptCarousel 가 함수로 export 된다", () => {
    expect(typeof buildConceptCarousel).toBe("function");
  });
});
