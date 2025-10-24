// Minimal Deno env typing for the functions runtime
declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
};

export {};
