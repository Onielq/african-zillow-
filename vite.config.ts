import { cloudflare } from "@cloudflare/vite-plugin";
import vinext from "vinext";
import { kvDataAdapter } from "@vinext/cloudflare/cache/kv-data-adapter";
import { defineConfig } from "vite";

// The regular Next.js build needs standalone output for Docker. vinext
// produces its own Worker bundle, so do not ask it to emit a Node standalone app.
process.env.VINEXT_BUILD = "1";

export default defineConfig({
  plugins: [
    vinext({
      cache: {
        data: kvDataAdapter(),
      },
    }),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
