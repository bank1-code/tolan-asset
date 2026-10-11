import { trpc } from "@/lib/trpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import "./index.css";

// Analytics is optional; incomplete configuration must not request placeholder URLs.
const analyticsEndpoint = import.meta.env.VITE_ANALYTICS_ENDPOINT;
const analyticsWebsite = import.meta.env.VITE_ANALYTICS_WEBSITE_ID;
if (analyticsEndpoint && analyticsWebsite) {
  try {
    const endpoint = new URL(analyticsEndpoint);
    if (["https:", "http:"].includes(endpoint.protocol)) {
      const script = document.createElement("script");
      script.defer = true;
      script.src = `${endpoint.href.replace(/\/$/, "")}/umami`;
      script.dataset.websiteId = analyticsWebsite;
      document.head.appendChild(script);
    }
  } catch { /* Invalid optional configuration leaves analytics disabled. */ }
}

const queryClient = new QueryClient();

// لا نعيد التوجيه إلى OAuth - نترك AuthGate في App.tsx يعرض صفحة تسجيل الدخول المحلية
queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    if (error instanceof TRPCClientError) {
      console.error("[API Query Error]", error.message);
    }
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    if (error instanceof TRPCClientError) {
      console.error("[API Mutation Error]", error.message);
    }
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
