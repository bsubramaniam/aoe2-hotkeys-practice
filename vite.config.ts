import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        home: "index.html",
        notFound: "404.html",
        drills: "drills.html",
        createDrill: "drills/create.html",
        editDrill: "drills/edit.html",
        privacy: "privacy.html",
      },
    },
  },
});
