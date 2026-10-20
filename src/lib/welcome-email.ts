import {
  emailButton,
  emailLinkStyle,
  emailTemplate,
  escapeEmailHtml,
} from "./email-template";

export function welcomeEmail(from: string, to: string, baseUrl: string) {
  const origin = new URL(baseUrl).origin;
  return {
    from,
    to,
    replyTo: "nishantgawderya@gmail.com",
    subject: "Welcome to Warrantly — a quick hello from Nishant",
    html: emailTemplate(
      "A little less to keep track of.",
      "Welcome to Warrantly. A quick hello from Nishant, the engineer behind the app.",
      `<p style="margin:0 0 16px">Hey there,</p>
<p style="margin:0 0 16px">Welcome to Warrantly! I’m <strong>Nishant</strong>, the engineer behind the app. I built it to help you keep your bills together and stay on top of warranty and return deadlines.</p>
<p style="margin:0 0 16px">Save your first bill, and give yourself one less thing to remember.</p>
${emailButton("Save your first bill", `${origin}/vault`)}
<p style="margin:0 0 24px">Want a heads-up before a deadline? Turn on email reminders in your <a href="${escapeEmailHtml(`${origin}/reminders`)}" style="${emailLinkStyle}">reminder settings</a>.</p>
<p style="margin:0 0 16px">Have a suggestion, spotted a bug, or wish something worked differently? Just reply to this email or write to <a href="mailto:nishantgawderya@gmail.com" style="${emailLinkStyle}">nishantgawderya@gmail.com</a>. I’d love to hear from you.</p>
<p style="margin:0 0 24px">Thanks for being here. Keep track of your warranties with Warrantly!</p>
<p style="margin:0"><strong>Nishant</strong><br><span style="font-size:14px;color:#626e68">Engineer behind Warrantly</span></p>`,
      "You’re receiving this one-time welcome because you joined Warrantly.",
    ),
    text: `Hey there,\n\nWelcome to Warrantly! I'm Nishant, the engineer behind the app. I built Warrantly to help you keep your bills together and stay on top of warranty and return deadlines.\n\nStart by saving your first bill: ${origin}/vault\nTo receive deadline reminders by email, turn them on in your reminder settings: ${origin}/reminders\n\nHave a suggestion, spotted a bug, or wish something worked differently? Just reply to this email or write to nishantgawderya@gmail.com. I'd love to hear from you.\n\nThanks for being here. Keep track of your warranties with Warrantly!\n\nNishant\nEngineer behind Warrantly`,
  };
}
