/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Handle workers - allow them to be imported as modules
    config.module.rules.push({
      test: /\.worker\.js$/,
      use: { loader: 'worker-loader' },
      type: 'asset/resource',
    });

    // Add aliases for Three.js WebGPU builds
    const path = require('path');
    config.resolve.alias = {
      ...config.resolve.alias,
      'three/webgpu': path.resolve(__dirname, 'node_modules/three/build/three.webgpu.js'),
      'three/tsl': path.resolve(__dirname, 'node_modules/three/build/three.tsl.js'),
      'three/addons': path.resolve(__dirname, 'node_modules/three/examples/jsm'),
    };
    
    // Allow importing workers as modules
    if (!isServer) {
      config.resolve.alias['src/ocean/ocean-builder-threaded-worker.js'] = path.resolve(__dirname, 'src/ocean/ocean-builder-threaded-worker.js');
    }

    // Enable top-level await for Three.js WebGPU modules
    config.experiments = {
      ...config.experiments,
      topLevelAwait: true,
    };

    // Don't bundle these on the server
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      };
    }

    return config;
  },
  // Required headers for WebGPU SharedArrayBuffer support
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'require-corp',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
        ],
      },
    ];
  }
};

module.exports = nextConfig;
