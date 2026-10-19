import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Keep tracing inside this lab (parent DeployOS / home lockfiles confuse Next)
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
