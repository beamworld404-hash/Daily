import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 数据在仓库的 web/content/reports/，构建时由 import.meta.glob 打包进页面。
export default defineConfig({
  base: "./", // 相对路径：dist/ 可整体拷到任意静态托管的任意子路径
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: { fs: { allow: [fileURLToPath(new URL("..", import.meta.url))] } },
  build: { outDir: "dist", emptyOutDir: true },
});
