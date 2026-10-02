import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { Route as home } from "@/routes/home";
import { Route as vault } from "@/routes/vault";
import { Route as scan } from "@/routes/scan";
import { Route as review } from "@/routes/review.$documentId";
import { Route as item } from "@/routes/item.$itemId";
import { Route as agent } from "@/routes/agent";
import { Route as reminders } from "@/routes/reminders";
import "@/styles.css";

const root = createRootRoute({ component: Outlet });
const routes = [
  [home, "/home"],
  [vault, "/vault"],
  [scan, "/scan"],
  [review, "/review/$documentId"],
  [item, "/item/$itemId"],
  [agent, "/agent"],
  [reminders, "/reminders"],
] as const;
// Production components, isolated service doubles. This config is never used by the app build.
const routeTree = root.addChildren(
  routes.map(([route, path]) =>
    route.update({ id: path, path, getParentRoute: () => root }),
  ),
);
const router = createRouter({ routeTree, scrollRestoration: true });
createRoot(document.getElementById("root")!).render(
  <RouterProvider router={router} />,
);
