import { createServerFn } from "@tanstack/react-start";
import {
  notificationPreferencesSchema,
  reminderActionSchema,
} from "./notifications";

export const loadNotifications = createServerFn({ method: "GET" }).handler(
  async () =>
    (await import("./notification-service.server")).loadNotifications(),
);
export const saveNotificationPreferences = createServerFn({ method: "POST" })
  .validator(notificationPreferencesSchema)
  .handler(async ({ data }) =>
    (await import("./notification-service.server")).saveNotificationPreferences(
      data,
    ),
  );
export const actOnReminder = createServerFn({ method: "POST" })
  .validator(reminderActionSchema)
  .handler(async ({ data }) =>
    (await import("./notification-service.server")).actOnReminder(data),
  );
