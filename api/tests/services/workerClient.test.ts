describe("workerClient", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    process.env.URL_WORKER_NODE = "http://worker.test";
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("throws WorkerConflictError without retrying when notifyWorker receives 409", async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "A replenish job is running" }), {
        status: 409,
      }),
    );

    const { notifyWorker, WorkerConflictError } = await import(
      "../../src/services/workerClient"
    );

    await expect(notifyWorker(12, "intake")).rejects.toBeInstanceOf(WorkerConflictError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("continues retrying transient notifyWorker failures", async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock
      .mockResolvedValueOnce(new Response("offline", { status: 503 }))
      .mockResolvedValueOnce(new Response("offline", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accepted: true }), { status: 202 }));

    const { notifyWorker } = await import("../../src/services/workerClient");

    await expect(notifyWorker(12, "intake")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
