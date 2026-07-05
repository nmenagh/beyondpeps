import { readFileSync } from "node:fs";

const content = JSON.parse(readFileSync(new URL("../data/site-content.json", import.meta.url), "utf8"));
const requiredSections = ["site", "products", "references", "posts"];

for (const key of requiredSections) {
  if (!content[key]) {
    throw new Error(`Missing content section: ${key}`);
  }
}

if (!Array.isArray(content.products) || content.products.length === 0) {
  throw new Error("At least one product is required.");
}

console.log("Site content validated.");
