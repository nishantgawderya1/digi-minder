import { describe, expect, it } from "vitest";
import { welcomeEmail } from "@/lib/welcome-email";
import { reminderEmail } from "@/lib/reminder-email";

const reminder = {
  from: "Warrantly <onboarding@resend.dev>",
  to: "owner@example.invalid",
  baseUrl: "https://warrantly.example.invalid/path?ignored=true",
  label: "Warranty" as const,
  name: 'Phone <img src=x onerror="alert(1)"> & case',
  deadline: "27 Oct 2026",
  retailer: 'Shop & Sons <a href="https://untrusted.invalid">sale</a>',
  itemId: "test-bill",
};

describe("HTML email templates", () => {
  it("escapes bill data in the body and inbox preview while keeping plain text", () => {
    const email = reminderEmail(reminder);
    expect(email.html).not.toContain("<img");
    expect(email.html).not.toContain('href="https://untrusted.invalid"');
    expect(email.html).toContain("Phone &lt;img");
    expect(email.html).toContain("Shop &amp; Sons &lt;a");
    expect(email.html).toContain("27 Oct 2026");
    expect(email.text).toContain(reminder.name);
    expect(email.html).toContain(
      'href="https://warrantly.example.invalid/item/test-bill"',
    );
    expect(email.html).toContain(
      'href="https://warrantly.example.invalid/reminders"',
    );
  });

  it("renders return reminders without an absent retailer or subject line breaks", () => {
    const email = reminderEmail({
      ...reminder,
      label: "Return",
      name: "Phone\r\ncase",
      retailer: null,
    });
    expect(email.subject).toBe("Return reminder: Phone case");
    expect(email.html).toContain("Return deadline");
    expect(email.html).not.toContain("Warranty deadline");
    expect(email.html).not.toContain("Retailer:");
    expect(email.text).not.toContain("Retailer:");
  });

  it("includes welcome actions, feedback address, and a plain-text alternative", () => {
    const email = welcomeEmail(reminder.from, reminder.to, reminder.baseUrl);
    expect(email.replyTo).toBe("nishantgawderya@gmail.com");
    for (const path of ["vault", "reminders"]) {
      expect(email.html).toContain(
        `href="https://warrantly.example.invalid/${path}"`,
      );
      expect(email.text).toContain(`https://warrantly.example.invalid/${path}`);
    }
    expect(email.html).toContain('href="mailto:nishantgawderya@gmail.com"');
    expect(email.html).toContain('name="viewport"');
    expect(email.text).toContain("Nishant");
  });
});
