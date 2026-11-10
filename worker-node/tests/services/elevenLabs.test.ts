import { AxiosError, AxiosHeaders } from "axios";

import { toElevenLabsError } from "../../src/services/elevenLabs";

function axiosErrorWithBody(status: number, body: unknown) {
  const config = { headers: new AxiosHeaders() };
  const data =
    typeof body === "string" ? Buffer.from(body, "utf8") : Buffer.from(JSON.stringify(body), "utf8");
  return new AxiosError(
    `Request failed with status code ${status}`,
    "ERR_BAD_REQUEST",
    config,
    {},
    { status, statusText: "", headers: {}, config, data },
  );
}

describe("toElevenLabsError", () => {
  it("decodes the arraybuffer JSON error body into the message", () => {
    const error = toElevenLabsError(
      axiosErrorWithBody(400, {
        detail: {
          status: "api_key_id_used_as_api_key",
          message: "API key ID used as API key",
        },
      }),
    );

    expect(error.message).toBe(
      "ElevenLabs request failed with status 400: api_key_id_used_as_api_key: API key ID used as API key",
    );
  });

  it("handles a string detail", () => {
    const error = toElevenLabsError(axiosErrorWithBody(422, { detail: "Invalid voice" }));
    expect(error.message).toBe("ElevenLabs request failed with status 422: Invalid voice");
  });

  it("falls back to the raw body when it is not JSON", () => {
    const error = toElevenLabsError(axiosErrorWithBody(502, "Bad gateway"));
    expect(error.message).toBe("ElevenLabs request failed with status 502: Bad gateway");
  });

  it("passes through non-HTTP errors unchanged", () => {
    const original = new Error("socket hang up");
    expect(toElevenLabsError(original)).toBe(original);
  });
});
