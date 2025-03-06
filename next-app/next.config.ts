import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  /* config options here */
  webpack: (config) => {
    // config.resolve.extensionAlias = {
    //   ".js": [".ts", ".js", ".tsx", ".jsx"],
    //   // ".mjs": [".mts", ".mjs"],
    //   // ".cjs": [".cts", ".cjs"],
    //   // ".jsx": [".tsx", ".jsx"],
    // };

    // uncomment to directly load blocknote local blocknote dev
    config.resolve.alias = {
      yjs: path.resolve(__dirname, "./node_modules/yjs"),
      //   "@blocknote/core/fonts/inter.css": path.resolve(
      //     __dirname,
      //     "../../BlockNote/packages/core/src/fonts/inter.css"
      //   ),
      //   "@blocknote/mantine/style.css": path.resolve(
      //     __dirname,
      //     "../../BlockNote/packages/mantine/dist/style.css"
      //   ),

      //   "@blocknote/core": path.resolve(
      //     __dirname,
      //     "../../BlockNote/packages/core/"
      //   ),
      //   "@blocknote/react": path.resolve(
      //     __dirname,
      //     "../../BlockNote/packages/react/"
      //   ),
      //   "@blocknote/mantine": path.resolve(
      //     __dirname,
      //     "../../BlockNote/packages/mantine/"
      //   ),
      ...config.resolve.alias,
    };

    return config;
  },
};

export default nextConfig;
