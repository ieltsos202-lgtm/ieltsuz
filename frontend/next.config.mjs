/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Prompt files live as plain Markdown (prompts/*.md) and are bundled as raw
  // strings so they ship with the serverless functions.
  webpack(config) {
    config.module.rules.push({ test: /\.md$/, type: "asset/source" });
    return config;
  },
  async headers() {
    return [
      {
        source: "/mocks/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
