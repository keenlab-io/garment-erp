import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Bind all interfaces (IPv4 + IPv6), not just the default `localhost` which resolves
    // IPv6-only (`[::1]`) on this dev-container image — VS Code port forwarding connects over
    // IPv4 (`127.0.0.1`), so an IPv6-only bind leaves the forwarded port unreachable.
    host: true,
    // Proxy API calls to the NestJS app during dev so the typed client can use
    // a same-origin relative base URL. `/socket.io` proxies the RealtimeGateway
    // (default Socket.IO path) the same way, with `ws: true` for the upgrade.
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/socket.io": {
        target: "http://localhost:3000",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
