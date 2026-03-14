/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    dirs: ["src/app", "src/components", "src/lib", "src/hooks", "src/types"],
  },
  experimental: {
    optimizePackageImports: ["@supabase/supabase-js", "@supabase/ssr", "uuid"],
  },
};

export default nextConfig;
