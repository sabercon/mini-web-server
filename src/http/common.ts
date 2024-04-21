import TCPConnection from "../tcp/tcp-connection"
import DynamicBuffer from "../base/dynamic-buffer"
import HTTPRequest from "./http-request"
import HTTPResponse from "./http-response"

export const CRLF = "\r\n"
export const CRLF2 = "\r\n\r\n"

export class HTTPError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message)
  }
}

export async function serveHTTP(
  conn: TCPConnection,
  requestHandler: (req: HTTPRequest) => Promise<HTTPResponse>,
) {
  try {
    await doServeHTTP(conn, requestHandler)
  } catch (error) {
    if (error instanceof HTTPError) {
      await HTTPResponse.error(error).write(conn)
    } else {
      const httpError = new HTTPError(500, "Internal Server Error")
      await HTTPResponse.error(httpError).write(conn)
      throw error
    }
  }
}

async function doServeHTTP(
  conn: TCPConnection,
  requestHandler: (req: HTTPRequest) => Promise<HTTPResponse>,
) {
  const buf = new DynamicBuffer()
  for (;;) {
    const req = await HTTPRequest.read(conn, buf)
    if (req == "END") return

    const res = await requestHandler(req)
    await res.write(conn)

    if (req.head.version == "HTTP/1.0") return

    while ((await req.body.read()) != "EOF") {
      // makes sure that the request body is consumed completely
    }
  }
}
