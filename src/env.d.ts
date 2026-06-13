/// <reference types="vite/client" />

interface ModelContextToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  annotations?: Record<string, unknown>
}


interface ModelContextTool extends ModelContextToolDefinition {
  execute: (input: unknown) => unknown | Promise<unknown>
}

interface Navigator {
  modelContext?: {
    registerTool: (tool: ModelContextTool, options?: { signal?: AbortSignal }) => void
  }
}
