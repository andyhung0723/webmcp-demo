/// <reference types="vite/client" />

interface ModelContextToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  annotations?: Record<string, unknown>
}

interface ModelContextRegistration {
  unregister?: () => void
}

interface Navigator {
  modelContext?: {
    registerTool: (
      definition: ModelContextToolDefinition,
      handler: (input: unknown) => unknown | Promise<unknown>,
      options?: { signal?: AbortSignal },
    ) => ModelContextRegistration | void
  }
}
