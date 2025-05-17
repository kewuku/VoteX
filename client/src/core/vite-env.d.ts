/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_CONTRACT_ADDRESS: string;
  readonly VITE_APP_NAME: string;
  // 添加其他环境变量
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.json' {
  const value: any;
  export default value;
}

interface Window {
  ethereum?: any;
}