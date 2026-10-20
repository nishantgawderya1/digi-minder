// Inline styles and presentation tables also work in email clients without web fonts or modern CSS.
export function escapeEmailHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character]!;
  });
}

export function emailButton(label: string, href: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0"><tr><td bgcolor="#175e4c" style="border-radius:8px;text-align:center"><a href="${escapeEmailHtml(href)}" style="display:inline-block;padding:14px 22px;border:1px solid #175e4c;border-radius:8px;background-color:#175e4c;color:#ffffff;font-size:16px;font-weight:600;line-height:22px;text-decoration:none;mso-padding-alt:0"><!--[if mso]><i style="mso-font-width:110%;mso-text-raise:20pt" hidden>&emsp;</i><![endif]-->${escapeEmailHtml(label)}<!--[if mso]><i style="mso-font-width:110%" hidden>&emsp;&#8203;</i><![endif]--></a></td></tr></table>`;
}

export const emailLinkStyle =
  "color:#175e4c;text-decoration:underline;text-underline-offset:3px";

/** content is trusted template markup; escape all dynamic text before inserting it. */
export function emailTemplate(
  title: string,
  preheader: string,
  content: string,
  footer: string,
) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeEmailHtml(title)}</title></head>
<body style="margin:0;padding:0;background-color:#ffffff;color:#28332f;font-family:'Segoe UI',Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escapeEmailHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="background-color:#ffffff"><tr><td align="center" style="padding:32px 16px">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;table-layout:fixed"><tr><td style="padding:0 16px 24px;border-bottom:1px solid #e4eae7;font-size:23px;font-weight:700;letter-spacing:-0.6px;color:#175e4c">Warrantly<span style="color:#8ba79d">.</span></td></tr>
<tr><td style="padding:32px 16px 24px;font-size:16px;line-height:1.7;overflow-wrap:anywhere;word-wrap:break-word">
<h1 style="margin:0 0 24px;font-size:30px;line-height:1.25;letter-spacing:-0.7px;font-weight:700;color:#182a23">${escapeEmailHtml(title)}</h1>
${content}
</td></tr><tr><td style="padding:24px 16px 0;border-top:1px solid #e4eae7;font-size:13px;line-height:1.7;color:#626e68">${footer}<p style="margin:12px 0 0">Your bills, warranties, and a little peace of mind.</p></td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
}
