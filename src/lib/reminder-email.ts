import {
  emailButton,
  emailLinkStyle,
  emailTemplate,
  escapeEmailHtml,
} from "./email-template";

export function reminderEmail(input: {
  from: string;
  to: string;
  baseUrl: string;
  label: "Warranty" | "Return";
  name: string;
  deadline: string;
  retailer: string | null;
  itemId: string;
}) {
  const { from, to, label, name, deadline, retailer } = input;
  const origin = new URL(input.baseUrl).origin;
  const itemUrl = `${origin}/item/${encodeURIComponent(input.itemId)}`;
  const settingsUrl = `${origin}/reminders`;
  return {
    from,
    to,
    subject: `${label} reminder: ${name.replace(/[\r\n]+/g, " ")}`,
    text: `${name}\n${label} deadline: ${deadline}\n${retailer ? `Retailer: ${retailer}\n` : ""}\nView your saved bill: ${itemUrl}\n\nManage reminders: ${settingsUrl}`,
    html: emailTemplate(
      label === "Warranty"
        ? "Keep an eye on your warranty."
        : "A heads-up on your return deadline.",
      `${name} — ${label.toLowerCase()} deadline: ${deadline}`,
      `<p style="margin:0 0 24px">Here’s a reminder about your saved bill, so you have time to check the details before the deadline.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;border:1px solid #e4eae7;border-radius:10px"><tr><td style="padding:20px">
<p style="margin:0 0 12px;font-size:19px;line-height:1.4;font-weight:600;color:#182a23">${escapeEmailHtml(name)}</p>
<p style="margin:0;font-size:13px;color:#626e68">${label} deadline</p>
<p style="margin:2px 0 0;font-size:20px;line-height:1.5;font-weight:600;color:#175e4c">${escapeEmailHtml(deadline)}</p>
${retailer ? `<p style="margin:14px 0 0;font-size:14px;color:#626e68">Retailer: ${escapeEmailHtml(retailer)}</p>` : ""}
</td></tr></table>
${emailButton("View your saved bill", itemUrl)}
<p style="margin:0">Your bill and its details are ready whenever you need them.</p>`,
      `You’re receiving this because you enabled email reminders.<br><a href="${escapeEmailHtml(settingsUrl)}" style="${emailLinkStyle}">Manage or turn off reminders</a>`,
    ),
  };
}
