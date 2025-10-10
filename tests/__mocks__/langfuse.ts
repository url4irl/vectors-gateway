// Mock for Langfuse to avoid dynamic import issues in tests
export class Langfuse {
  constructor(config?: any) {
    // Mock constructor
  }

  trace = jest.fn().mockReturnValue({
    id: "mock-trace-id",
    update: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
  });

  span = jest.fn().mockReturnValue({
    id: "mock-span-id",
    update: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
  });

  generation = jest.fn().mockReturnValue({
    id: "mock-generation-id",
    traceId: "mock-trace-id",
    update: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
  });

  flushAsync = jest.fn().mockResolvedValue(undefined);

  on = jest.fn().mockReturnThis();
}

// Export the default export as well
export default Langfuse;
