export function welcomeEmail(from: string, to: string, baseUrl: string) {
  const origin = new URL(baseUrl).origin;
  return {
    from,
    to,
    replyTo: "nishantgawderya@gmail.com",
    subject: "Welcome to Warrantly — a quick hello from Nishant",
    text: `Hey there,\n\nWelcome to Warrantly! I'm Nishant, the engineer behind the app. I built Warrantly to help you keep your bills together and stay on top of warranty and return deadlines.\n\nStart by saving your first bill: ${origin}/vault\nTo receive deadline reminders by email, turn them on in your reminder settings: ${origin}/reminders\n\nHave a suggestion, spotted a bug, or wish something worked differently? Just reply to this email or write to nishantgawderya@gmail.com. I'd love to hear from you.\n\nThanks for being here. Keep track of your warranties with Warrantly!\n\nNishant\nEngineer behind Warrantly`,
  };
}
