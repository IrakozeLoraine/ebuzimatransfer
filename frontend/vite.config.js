import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks: (id) => {
                    if (!id.includes("node_modules"))
                        return;
                    if (/[\\/](react|react-dom|react-router|react-router-dom)[\\/]/.test(id))
                        return "react-vendor";
                    if (id.includes("@tanstack"))
                        return "query-vendor";
                    if (id.includes("@radix-ui"))
                        return "radix-vendor";
                    if (/[\\/](react-hook-form|@hookform|zod)[\\/]/.test(id))
                        return "form-vendor";
                    return "vendor";
                },
            },
        },
    },
    server: {
        port: 5173,
        proxy: {
            "/api": {
                target: "http://localhost:8000",
                changeOrigin: true,
            },
            "/ws": {
                target: "ws://localhost:8000",
                ws: true,
            },
        },
    },
});
