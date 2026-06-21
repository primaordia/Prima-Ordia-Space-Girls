import { cp, mkdir, rm } from "node:fs/promises";

const keep = ["assets", "data", "src", "index.html", "manifest.webmanifest", "service-worker.js"];

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });

for (const item of keep) {
  await cp(item, `dist/${item}`, { recursive: true });
}
