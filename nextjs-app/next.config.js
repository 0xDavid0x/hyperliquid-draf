/** @type {import('next').NextConfig} */
const nextConfig = {
  // Webpack config for better compatibility with Node.js modules
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        http: false,
        https: false,
        zlib: false,
        path: false,
        os: false,
        ws: false,
        buffer: false,
        util: false,
      };
      
      // Ensure browser field is used for client-side builds
      config.resolve.mainFields = ['browser', 'module', 'main'];
      
      // Add extensions to resolve (including .mjs for ESM modules)
      config.resolve.extensions = [
        '.js',
        '.jsx',
        '.ts',
        '.tsx',
        '.mjs',
        '.json',
        ...(config.resolve.extensions || []),
      ];
      
      // Resolve hyperliquid package explicitly
      const path = require('path');
      config.resolve.alias = {
        ...config.resolve.alias,
        'hyperliquid': path.resolve(__dirname, 'node_modules/hyperliquid/dist/index.mjs'),
        // Ignore React Native dependencies used by MetaMask SDK
        '@react-native-async-storage/async-storage': false,
        // Ignore optional pino-pretty dependency
        'pino-pretty': false,
      };
    }
    
    // Ignore optional dependencies that cause warnings (for both server and client)
    config.resolve.alias = {
      ...config.resolve.alias,
      '@react-native-async-storage/async-storage': false,
      'pino-pretty': false,
    };
    
    // Ignore Node.js modules that aren't available in browser
    config.plugins = config.plugins || [];
    
    return config;
  },
};

module.exports = nextConfig;

