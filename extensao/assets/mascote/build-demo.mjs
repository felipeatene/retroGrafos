// Copia lino-pet.svg para dentro do demo.html (entre os marcadores),
// para o demo abrir via file:// sem servidor. Uso: node build-demo.mjs
import { readFileSync, writeFileSync } from "node:fs";

const dir = new URL(".", import.meta.url);
const svg = readFileSync(new URL("lino-pet.svg", dir), "utf8").trim();
const demoUrl = new URL("demo.html", dir);
const demo = readFileSync(demoUrl, "utf8");
const out = demo.replace(/<!--MASCOTE:INICIO-->[\s\S]*?<!--MASCOTE:FIM-->/, `<!--MASCOTE:INICIO-->\n${svg}\n<!--MASCOTE:FIM-->`);
if (out === demo && !demo.includes(svg)) throw new Error("marcadores MASCOTE não encontrados em demo.html");
writeFileSync(demoUrl, out);
console.log(`demo.html atualizado (${Buffer.byteLength(svg)} bytes de SVG)`);
