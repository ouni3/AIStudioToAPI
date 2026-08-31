import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Helper function to test getFixed15HourTimeRange
const getFixed15HourTimeRange = (now = new Date()) => {
    const start = new Date(now);
    // If current time is before 15:00 today, the most recent 15:00 was yesterday at 15:00
    if (now.getHours() < 15) {
        start.setDate(start.getDate() - 1);
    }
    start.setHours(15, 0, 0, 0);

    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    return [start, end];
};

describe("Fixed 15:00 to next day 15:00 time range calculation", () => {
    it("should calculate correctly when now is before 15:00 (e.g. 10:30)", () => {
        const testDate = new Date("2026-08-31T10:30:00+08:00");
        const [start, end] = getFixed15HourTimeRange(testDate);

        assert.strictEqual(start.getHours(), 15);
        assert.strictEqual(start.getMinutes(), 0);
        assert.strictEqual(start.getSeconds(), 0);
        assert.strictEqual(start.getDate(), 30); // yesterday

        assert.strictEqual(end.getHours(), 15);
        assert.strictEqual(end.getMinutes(), 0);
        assert.strictEqual(end.getSeconds(), 0);
        assert.strictEqual(end.getDate(), 31); // today
    });

    it("should calculate correctly when now is at or after 15:00 (e.g. 15:00)", () => {
        const testDate = new Date("2026-08-31T15:00:00+08:00");
        const [start, end] = getFixed15HourTimeRange(testDate);

        assert.strictEqual(start.getHours(), 15);
        assert.strictEqual(start.getDate(), 31); // today

        assert.strictEqual(end.getHours(), 15);
        assert.strictEqual(end.getDate(), 1); // tomorrow (Sept 1)
    });

    it("should calculate correctly when now is late evening (e.g. 23:45)", () => {
        const testDate = new Date("2026-08-31T23:45:00+08:00");
        const [start, end] = getFixed15HourTimeRange(testDate);

        assert.strictEqual(start.getHours(), 15);
        assert.strictEqual(start.getDate(), 31); // today

        assert.strictEqual(end.getHours(), 15);
        assert.strictEqual(end.getDate(), 1); // tomorrow (Sept 1)
    });

    it("should ensure interval is exactly 24 hours", () => {
        const testDate = new Date("2026-08-31T12:00:00+08:00");
        const [start, end] = getFixed15HourTimeRange(testDate);
        assert.strictEqual(end.getTime() - start.getTime(), 24 * 60 * 60 * 1000);
    });
});
