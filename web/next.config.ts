import type {NextConfig} from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // RainbowKit's WalletConnect dependency chain does not build under Turbopack
  // (rainbow-me/rainbowkit#2595), so `dev` and `build` both pass --webpack and the
  // Node-only / optional transitive modules are stubbed out here. Lifted verbatim from
  // multi-launchpad, where this exact list is what finally produced a clean build.
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      "pino-pretty": false,
      // A React Native storage peer that MetaMask's SDK imports unconditionally. It cannot
      // exist in a web build, and without this the build prints a module-not-found warning
      // on every run for something that is working as intended.
      "@react-native-async-storage/async-storage": false,
      // Optional peers of @coinbase/cdp-sdk, pulled in via wagmi's baseAccount connector.
      "@x402/core/client": false,
      "@x402/core/server": false,
      "@x402/evm": false,
      "@x402/evm/batch-settlement/client": false,
      "@x402/evm/exact/client": false,
      "@x402/evm/exact/server": false,
      "@x402/evm/exact/v1/client": false,
      "@x402/evm/upto/client": false,
      "@x402/evm/upto/server": false,
      "@x402/express": false,
      "@x402/extensions/bazaar": false,
      "@x402/extensions/builder-code": false,
      "@x402/fetch": false,
      "@x402/svm/exact/client": false,
      "@x402/svm/exact/server": false,
      "@x402/svm/exact/v1/client": false,
    };
    config.externals.push("lokijs", "encoding");
    return config;
  },
};

export default nextConfig;
