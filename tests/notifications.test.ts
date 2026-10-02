import { describe, expect, it } from "vitest";
import { emptyBillFields } from "@/lib/bills";
import {
  notificationPreferencesSchema,
  scheduleInTimezone,
} from "@/lib/notifications";

describe("Timezone-aware reminder scheduling", () => {
  const fields = {
    ...emptyBillFields(),
    warrantyExpiresAt: "2027-07-01",
    returnExpiresAt: "2027-07-02",
    reminderDays: [1, 1],
  };
  it("uses the user's local hour and creates separate email and in-app rows", () => {
    const schedule = scheduleInTimezone(
      fields,
      { emailReminders: true, timezone: "Asia/Kolkata", reminderHour: 9 },
      new Date("2027-01-01"),
    );
    expect(schedule).toHaveLength(4);
    expect(schedule[0]?.remindAt.toISOString()).toBe(
      "2027-06-30T03:30:00.000Z",
    );
    expect(schedule.map((row) => row.channel)).toEqual([
      "in_app",
      "email",
      "in_app",
      "email",
    ]);
  });
  it("accounts for daylight saving rather than applying a fixed offset", () => {
    const schedule = scheduleInTimezone(
      { ...fields, returnExpiresAt: null },
      { emailReminders: false, timezone: "America/New_York", reminderHour: 9 },
      new Date("2027-01-01"),
    );
    expect(schedule[0]?.remindAt.toISOString()).toBe(
      "2027-06-30T13:00:00.000Z",
    );
  });
  it("rejects invalid zones and hours and does not schedule passed dates", () => {
    expect(
      notificationPreferencesSchema.safeParse({
        emailReminders: true,
        timezone: "Invalid/Zone",
        reminderHour: 24,
      }).success,
    ).toBe(false);
    expect(
      scheduleInTimezone(
        fields,
        { emailReminders: true, timezone: "UTC", reminderHour: 9 },
        new Date("2028-01-01"),
      ),
    ).toEqual([]);
  });
});
