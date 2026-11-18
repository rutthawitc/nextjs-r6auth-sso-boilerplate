/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',

  // Keep these as external modules (not bundled) so they appear in
  // standalone node_modules — required for docker-migrate.mjs at runtime
  serverExternalPackages: ['postgres', 'drizzle-orm', 'bcrypt'],

  // Turbopack is now default bundler for Next.js 16
  // Delivers 2-5x faster production builds and 10x faster Fast Refresh
  turbopack: {
    resolveAlias: {
      "@": "./src",
      "@/components": "./src/components",
      "@/lib": "./src/lib",
      "@/db": "./src/db",
      "@/app": "./src/app",
    },
  },

  // React Compiler (stable in Next.js 16)
  // Automatically memoizes components to reduce unnecessary re-renders
  // Zero manual code changes needed - just enable and it works
  // Note: Set to false to skip while babel-plugin-react-compiler is being installed
  reactCompiler: false,
};

module.exports = nextConfig;
