// ESLint 9 (configuration « à plat »), sans dépendance supplémentaire.
const browser = ['window', 'document', 'navigator', 'location', 'localStorage', 'indexedDB', 'caches', 'fetch', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia', 'speechSynthesis', 'SpeechSynthesisUtterance', 'AudioContext', 'MediaRecorder', 'Blob', 'File', 'FileReader', 'URL', 'Path2D', 'DOMParser', 'crypto', 'atob', 'btoa', 'TextDecoder', 'TextEncoder', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'console', 'self', 'Response', 'Request', 'AbortController', 'Worker', 'Audio', 'Image', 'CustomEvent', 'Event', 'structuredClone', 'confirm', 'history', 'screen', 'globalThis', 'process', 'Buffer', 'queueMicrotask', 'OfflineAudioContext', 'HTMLElement', 'Node', 'getComputedStyle', 'XMLSerializer', 'URLSearchParams'];
export default [
  { ignores: ['dist/', 'models/', 'node_modules/', 'src/vendor/'] },
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: Object.fromEntries(browser.map((g) => [g, 'readonly'])),
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'warn',
    },
  },
];
