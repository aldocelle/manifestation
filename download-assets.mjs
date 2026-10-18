import { categories, photoUrl } from "./public/catalog.js";
import { writeFile, mkdir } from "node:fs/promises";
await mkdir("public/assets", { recursive: true });
const extras = [
  ["italy", "photo-1516483638261-f4dbaf036963"],
  ["japan", "photo-1493976040374-85c8e12f0c0e"],
  ["mountains", "photo-1469474968028-56623f02e42e"],
  ["beach", "photo-1507525428034-b723cf961d3e"],
  ["forest", "photo-1441974231531-c6227db76b6e"],
  ["snow", "photo-1418985991508-e47386d96a71"],
  ["desert", "photo-1509316785289-025f5b846b35"],
  ["city", "photo-1519501025264-65ba15a82390"],
  ["car", "photo-1503376780353-7e6692767b70"],
  ["road", "photo-1500534623283-312aade485b7"],
  ["van", "photo-1464219789935-c2d9d9aba644"],
  ["interior", "photo-1616486338812-3dadae4b4ace"],
  ["bedroom", "photo-1616594039964-ae9021a400a0"],
  ["kitchen", "photo-1556912172-45b7abe8b7e1"],
  ["music", "photo-1511379938547-c1f69419868d"],
  ["guitar", "photo-1510915361894-db8b60106cb1"],
  ["fashion", "photo-1490481651871-ab68de25d43d"],
  ["flowers", "photo-1490750967868-88aa4486c946"],
  ["dog", "photo-1552053831-71594a27632d"],
  ["surf", "photo-1502680390469-be75c86b636f"],
  ["camp", "photo-1455496231601-e6195da1f841"],
  ["coffee", "photo-1495474472287-4d71bcdd2085"],
  ["books", "photo-1507842217343-583bb7270b66"],
  ["pizza", "photo-1513104890138-7c749659a591"],
];
const all = [...categories.map((c) => [c.id, c.photo]), ...extras];
let n = 0;
const credits = [];
await Promise.all(
  Array.from({ length: 5 }, async () => {
    while (n < all.length) {
      const [name, id] = all[n++];
      try {
        const r = await fetch(photoUrl(id, 1400), {
          signal: AbortSignal.timeout(25000),
        });
        if (!r.ok || !r.headers.get("content-type")?.startsWith("image/"))
          throw Error(r.status);
        const b = Buffer.from(await r.arrayBuffer());
        await writeFile(`public/assets/${name}.jpg`, b);
        credits.push({
          file: `${name}.jpg`,
          source: `https://unsplash.com/photos/${id.replace("photo-", "")}`,
          image: photoUrl(id, 1400),
          license: "https://unsplash.com/license",
          provider: "Unsplash",
          downloaded: "2026-10-18",
        });
        console.log(name, b.length);
      } catch (e) {
        console.log("FAILED", name, e.message);
      }
    }
  }),
);
await writeFile("public/assets/credits.json", JSON.stringify(credits, null, 2));
