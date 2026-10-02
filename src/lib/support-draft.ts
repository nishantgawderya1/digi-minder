import { displayDate, money, type Bill } from "./bills";

export function supportDraft(bill: Bill, issue: string) {
  const facts = [
    `Item: ${bill.name}`,
    bill.retailer && `Retailer: ${bill.retailer}`,
    bill.invoiceNumber && `Invoice: ${bill.invoiceNumber}`,
    bill.serialNumber && `Serial number: ${bill.serialNumber}`,
    bill.modelNumber && `Model: ${bill.modelNumber}`,
    bill.purchaseDate && `Purchased: ${displayDate(bill.purchaseDate)}`,
    bill.purchasePrice !== null &&
      `Amount paid: ${money(bill.purchasePrice, bill.currency)}`,
    bill.warrantyExpiresAt &&
      `Recorded warranty end: ${displayDate(bill.warrantyExpiresAt)}`,
  ]
    .filter(Boolean)
    .join("\n");
  return `Subject: Support request - ${bill.name}\n\nHello,\n\nI am requesting assistance with the following item.\n\n${facts}\n\nIssue:\n${issue.trim()}\n\nPlease confirm the available support options and next steps. I can provide the purchase document if required.\n\nThank you.`;
}
