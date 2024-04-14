import TCPConnection from "./tcp-connection"
import DynamicBuffer from "./dynamic-buffer"

const CRLF = "\r\n"
const CRLF2 = "\r\n\r\n"

export class HTTPError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message)
  }
}

export class HTTPHeader {
  constructor(
    public readonly name: string,
    public readonly value: string,
  ) {}

  static parse(line: string): HTTPHeader {
    const [name, value] = line.split(":")
    return new HTTPHeader(name.trim(), value.trim())
  }

  toString(): string {
    return `${this.name}: ${this.value}`
  }
}

export interface BodyReader {
  // the "Content-Length", -1 if unknown.
  length: number
  // to read data
  read: () => Promise<Buffer | "EOF">
}

export function bufferReader(data: Buffer): BodyReader {
  let done = false
  return {
    length: data.length,
    read: () => {
      if (done) return Promise.resolve("EOF")

      done = true
      return Promise.resolve(data)
    },
  }
}

export class HTTPRequest {
  constructor(
    public readonly method: string,
    public readonly uri: string,
    public readonly version: string,
    public readonly headers: HTTPHeader[],
    public readonly bodyReader: BodyReader,
  ) {}

  static async read(
    conn: TCPConnection,
    buf: DynamicBuffer,
  ): Promise<HTTPRequest | "END"> {
    const requestHeaders = await HTTPRequest.cutRequestHeaders(conn, buf)
    if (requestHeaders == "END") return "END"

    console.log(requestHeaders.toString())
    const [requestLine, ...headerLines] = requestHeaders
      .toString()
      .trimEnd()
      .split(CRLF)
    const [method, uri, version] = requestLine.split(" ").map((s) => s.trim())
    const headers = headerLines.map((header) => HTTPHeader.parse(header))

    const bodyReader = HTTPRequest.readRequestBody(conn, buf, headers)
    return new HTTPRequest(method, uri, version, headers, bodyReader)
  }

  private static async cutRequestHeaders(
    conn: TCPConnection,
    buf: DynamicBuffer,
  ): Promise<Buffer | "END"> {
    while (buf.indexOf(CRLF2) < 0) {
      const data = await conn.read()
      if (data == "END") {
        if (buf.size() == 0) return "END"
        throw new HTTPError(400, "Unexpected EOF")
      }

      buf.push(data)
    }
    return buf.pop(buf.indexOf(CRLF2) + CRLF2.length)
  }

  private static readRequestBody(
    conn: TCPConnection,
    buf: DynamicBuffer,
    headers: HTTPHeader[],
  ): BodyReader {
    const length = HTTPRequest.parseContentLength(headers)
    const encodings = HTTPRequest.parseTransferEncoding(headers)
    const chunked = encodings.includes("chunked")

    if (length >= 0) {
      return HTTPRequest.readRequestBodyByLength(conn, buf, length)
    } else if (chunked) {
      throw new HTTPError(501, "TODO: chunked encoding")
    } else {
      throw new HTTPError(501, "TODO: to read the rest of the connection")
    }
  }

  private static readRequestBodyByLength(
    conn: TCPConnection,
    buf: DynamicBuffer,
    length: number,
  ): BodyReader {
    let remaining = length
    return {
      length,
      read: async () => {
        if (remaining == 0) return "EOF"

        if (buf.size() == 0) {
          const data = await conn.read()
          if (data == "END") {
            throw new HTTPError(400, "Unexpected EOF")
          }

          buf.push(data)
        }
        const toRead = Math.min(remaining, buf.size())
        remaining -= toRead
        return buf.pop(toRead)
      },
    }
  }

  private static parseContentLength(headers: HTTPHeader[]): number {
    const length = HTTPRequest.findHeader(headers, "content-length")
    return length ? parseInt(length) : -1
  }

  private static parseTransferEncoding(headers: HTTPHeader[]): string[] {
    const encoding = HTTPRequest.findHeader(headers, "transfer-encoding")
    return encoding?.split(",")?.map((v) => v.trim().toLowerCase()) ?? []
  }

  private static findHeader(
    headers: HTTPHeader[],
    name: string,
  ): string | undefined {
    return headers.find((h) => HTTPRequest.equalsIgnoreCase(h.name, name))
      ?.value
  }

  private static equalsIgnoreCase(a: string, b: string): boolean {
    return a.localeCompare(b, undefined, { sensitivity: "accent" }) == 0
  }
}

export class HTTPResponse {
  constructor(
    public readonly version: string,
    public readonly code: number,
    public readonly reason: string,
    public readonly headers: HTTPHeader[],
    public readonly bodyReader: BodyReader,
  ) {}

  static error(version: string, error: HTTPError): HTTPResponse {
    return new HTTPResponse(
      version,
      error.code,
      error.message,
      [new HTTPHeader("Content-Length", "0")],
      { length: 0, read: () => Promise.resolve("EOF") },
    )
  }

  static ok(
    version: string,
    headers: HTTPHeader[],
    data: Buffer | BodyReader,
  ): HTTPResponse {
    if (data instanceof Buffer) {
      data = bufferReader(data)
    }
    return new HTTPResponse(
      version,
      200,
      "OK",
      [...headers, new HTTPHeader("Content-Length", data.length.toString())],
      data,
    )
  }

  async write(conn: TCPConnection): Promise<void> {
    if (this.bodyReader.length < 0) {
      throw new HTTPError(501, "TODO: chunked encoding")
    }

    await conn.write(Buffer.from(this.encodeStatusHeaders()))
    for (;;) {
      const data = await this.bodyReader.read()
      if (data == "EOF") break

      await conn.write(data)
    }
  }

  private encodeStatusHeaders(): string {
    return this.encodeStatus() + CRLF + this.encodeHeaders() + CRLF2
  }

  private encodeStatus(): string {
    return `${this.version} ${this.code} ${this.reason}`
  }

  private encodeHeaders(): string {
    return this.headers.map((h) => h.toString()).join(CRLF)
  }
}

export async function serveHTTP(
  conn: TCPConnection,
  requestHandler: (req: HTTPRequest) => Promise<HTTPResponse>,
) {
  try {
    await handleHTTPConnection(conn, requestHandler)
  } catch (error) {
    if (error instanceof HTTPError) {
      await HTTPResponse.error("HTTP/1.1", error).write(conn)
    } else {
      const httpError = new HTTPError(500, "Internal Server Error")
      await HTTPResponse.error("HTTP/1.1", httpError).write(conn)
      throw error
    }
  }
}

async function handleHTTPConnection(
  conn: TCPConnection,
  requestHandler: (req: HTTPRequest) => Promise<HTTPResponse>,
) {
  const buf = new DynamicBuffer()
  for (;;) {
    const req = await HTTPRequest.read(conn, buf)
    if (req == "END") return

    const res = await requestHandler(req)
    await res.write(conn)

    if (req.version == "HTTP/1.0") return

    while ((await req.bodyReader.read()) != "EOF") {
      // makes sure that the request body is consumed completely
    }
  }
}
