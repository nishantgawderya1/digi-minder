export type ItemStatus = "active" | "ending" | "expired";

export type Item = {
  id: string;
  name: string;
  brand: string;
  category: string;
  purchased: string;
  price: string;
  warrantyMonths: number;
  monthsLeft: number;
  status: ItemStatus;
  docs: string[];
  serial: string;
  support: { name: string; role: string; email: string; phone: string };
};

export const items: Item[] = [
  {
    id: "washer",
    name: "FrontLoad 7kg Washing Machine",
    brand: "Bosch",
    category: "Appliance",
    purchased: "12 Apr 2026",
    price: "₹34,990",
    warrantyMonths: 6,
    monthsLeft: 2,
    status: "ending",
    docs: ["Invoice", "Warranty card"],
    serial: "BSH-WM-7741-2026",
    support: {
      name: "Bosch Home Care",
      role: "Regional service manager",
      email: "service.west@bosch-care.example",
      phone: "+91 1800 266 1880",
    },
  },
  {
    id: "tv",
    name: '55" OLED Television',
    brand: "LG",
    category: "Entertainment",
    purchased: "02 Jan 2026",
    price: "₹1,24,500",
    warrantyMonths: 24,
    monthsLeft: 15,
    status: "active",
    docs: ["Invoice", "Warranty card", "Extended cover"],
    serial: "LG-OLED-55C3-8820",
    support: {
      name: "LG Premium Care",
      role: "Escalation desk",
      email: "premium.care@lg-support.example",
      phone: "+91 1800 315 9999",
    },
  },
  {
    id: "laptop",
    name: "ThinkPad X1 Carbon",
    brand: "Lenovo",
    category: "Computing",
    purchased: "18 Nov 2025",
    price: "₹1,65,000",
    warrantyMonths: 36,
    monthsLeft: 25,
    status: "active",
    docs: ["Invoice", "Warranty card"],
    serial: "LNV-X1C-G11-4412",
    support: {
      name: "Lenovo Priority Support",
      role: "Business care lead",
      email: "priority@lenovo-care.example",
      phone: "+91 1800 419 4666",
    },
  },
  {
    id: "mixer",
    name: "Mixer Grinder 750W",
    brand: "Philips",
    category: "Kitchen",
    purchased: "09 Mar 2024",
    price: "₹4,299",
    warrantyMonths: 24,
    monthsLeft: 0,
    status: "expired",
    docs: ["Invoice"],
    serial: "PHL-MG-750-1193",
    support: {
      name: "Philips Service",
      role: "Customer relations",
      email: "care@philips-service.example",
      phone: "+91 1800 102 2929",
    },
  },
];

export const statusLabel: Record<ItemStatus, string> = {
  active: "In cover",
  ending: "Ending soon",
  expired: "Cover ended",
};

export const timeline = [
  {
    when: "In 54 days",
    title: "Washing machine cover ends",
    detail: "Raise any pending complaint before 12 Oct 2026.",
    tone: "warn" as const,
  },
  {
    when: "In 4 months",
    title: "AMC renewal offer window",
    detail: "LG OLED extended cover can be renewed at ₹4,800.",
    tone: "calm" as const,
  },
  {
    when: "Done",
    title: "Mixer grinder cover closed",
    detail: "Archived with invoice. No action needed.",
    tone: "done" as const,
  },
];

export const agentThread = [
  {
    from: "user" as const,
    text: "My washing machine stopped draining water. It is only 4 months old.",
  },
  {
    from: "agent" as const,
    text: "Found it — Bosch FrontLoad 7kg, bought 12 Apr 2026, invoice ₹34,990. You have 2 months of cover left, so this repair should be free.",
    facts: [
      "Serial BSH-WM-7741-2026",
      "Warranty valid till 12 Oct 2026",
      "Invoice + warranty card attached",
    ],
  },
  {
    from: "agent" as const,
    text: "I drafted a complaint to Bosch Home Care. Review it before anything is sent.",
    draft: {
      to: "service.west@bosch-care.example",
      subject: "In-warranty repair request — FrontLoad 7kg (BSH-WM-7741-2026)",
      body: "Hello,\n\nMy Bosch FrontLoad 7kg washing machine, purchased on 12 April 2026, has stopped draining water. The unit is 4 months old and under the 6-month warranty valid till 12 October 2026.\n\nInvoice and warranty card are attached. Please arrange a technician visit this week and share a complaint reference number.\n\nThank you,\nNishant",
    },
  },
];

export const quickAsks = [
  "Is my TV still under warranty?",
  "Draft a refund request for the mixer",
  "What did I spend on appliances in 2026?",
];
