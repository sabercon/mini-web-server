import * as fs from "fs/promises"
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
  read: () => Promise<Buffer | "EOF">
  close?: () => Promise<void>
}

export type BufferGenerator = AsyncGenerator<Buffer, void, void>

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

export function bufferGeneratorReader(gen: BufferGenerator): BodyReader {
  return {
    length: -1,
    read: async () => {
      const result = await gen.next()
      return result.done ? "EOF" : result.value
    },
    close: async () => {
      await gen.return()
    },
  }
}

export async function staticFileReader(path: string): Promise<BodyReader> {
  const [fp, size] = await openFile(path)
  let read = 0
  return {
    length: size,
    read: async () => {
      const result = await fp.read()
      if (result.bytesRead == 0) {
        if (read == size) return "EOF"
        throw new HTTPError(500, "File Size Changed")
      }

      read += result.bytesRead
      if (read > size) {
        // cannot continue since we have sent the `Content-Length`.
        throw new HTTPError(500, "File Size Changed")
      }
      // NOTE: the automatically allocated buffer may be larger
      return result.buffer.subarray(0, result.bytesRead)
    },
    close: async () => await fp.close(),
  }
}

async function openFile(path: string): Promise<[fs.FileHandle, number]> {
  let fp: fs.FileHandle
  try {
    fp = await fs.open(path, "r")
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code == "ENOENT") {
      throw new HTTPError(404, "Not Found")
    }
    throw error
  }

  try {
    const stat = await fp.stat()
    if (!stat.isFile()) {
      throw new HTTPError(404, "Not Found")
    }

    return [fp, stat.size]
  } catch (error) {
    await fp.close()
    throw error
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

    const bodyReader = HTTPRequest.requestBodyReader(conn, buf, method, headers)
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

  private static requestBodyReader(
    conn: TCPConnection,
    buf: DynamicBuffer,
    method: string,
    headers: HTTPHeader[],
  ): BodyReader {
    const length = HTTPRequest.parseContentLength(headers)
    const encodings = HTTPRequest.parseTransferEncoding(headers)
    const chunked = encodings.includes("chunked")

    if (length >= 0) {
      return HTTPRequest.bodyReaderByLength(conn, buf, length)
    } else if (chunked) {
      return HTTPRequest.bodyReaderByChunk(conn, buf)
    } else if (method == "GET" || method == "HEAD") {
      return bufferReader(Buffer.alloc(0))
    } else {
      // for compatibility with HTTP/1.0 clients
      throw new HTTPError(501, "TODO: to read the rest of the connection")
    }
  }

  private static bodyReaderByLength(
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

  private static bodyReaderByChunk(
    conn: TCPConnection,
    buf: DynamicBuffer,
  ): BodyReader {
    return bufferGeneratorReader(HTTPRequest.chunkGenerator(conn, buf))
  }

  private static async *chunkGenerator(
    conn: TCPConnection,
    buf: DynamicBuffer,
  ): BufferGenerator {
    async function readChunkSize(): Promise<number> {
      while (buf.indexOf(CRLF) < 0) {
        const data = await conn.read()
        if (data == "END") {
          throw new HTTPError(400, "Unexpected EOF")
        }

        buf.push(data)
      }
      const num = buf.pop(buf.indexOf(CRLF)).toString()
      buf.pop(CRLF.length)
      return parseInt(num, 16)
    }

    for (;;) {
      const size = await readChunkSize()
      if (size == 0) {
        buf.pop(CRLF.length)
        return
      }

      let remaining = size
      while (remaining > 0) {
        if (buf.size() == 0) {
          const data = await conn.read()
          if (data == "END") {
            throw new HTTPError(400, "Unexpected EOF")
          }

          buf.push(data)
        }
        const toRead = Math.min(remaining, buf.size())
        remaining -= toRead
        yield buf.pop(toRead)
      }
      buf.pop(CRLF.length)
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
    return HTTPResponse.of(
      version,
      error.code,
      error.message,
      [],
      Buffer.alloc(0),
    )
  }

  static ok(
    version: string,
    headers: HTTPHeader[],
    data: BodyReader | Buffer | BufferGenerator,
  ): HTTPResponse {
    return HTTPResponse.of(version, 200, "OK", headers, data)
  }

  static of(
    version: string,
    code: number,
    reason: string,
    headers: HTTPHeader[],
    data: BodyReader | Buffer | BufferGenerator,
  ): HTTPResponse {
    let reader: BodyReader
    if (data instanceof Buffer) {
      reader = bufferReader(data)
    } else if (Symbol.asyncIterator in data) {
      reader = bufferGeneratorReader(data)
    } else {
      reader = data
    }

    const extraHeader =
      reader.length >= 0
        ? new HTTPHeader("Content-Length", reader.length.toString())
        : new HTTPHeader("Transfer-Encoding", "chunked")

    return new HTTPResponse(
      version,
      code,
      reason,
      [...headers, extraHeader],
      reader,
    )
  }

  async write(conn: TCPConnection) {
    await conn.write(Buffer.from(this.encodeStatusHeaders()))

    try {
      if (this.bodyReader.length < 0) {
        await this.writeChunkedBody(conn)
      } else {
        await this.writeNonChunkedBody(conn)
      }
    } finally {
      await this.bodyReader.close?.()
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

  private async writeChunkedBody(conn: TCPConnection) {
    for (;;) {
      const data = await this.bodyReader.read()
      if (data == "EOF") {
        await conn.write(Buffer.from("0" + CRLF2))
        break
      }
      const chunk = Buffer.from(
        data.length.toString(16) + CRLF + data.toString() + CRLF,
      )
      await conn.write(chunk)
    }
  }

  private async writeNonChunkedBody(conn: TCPConnection) {
    for (;;) {
      const data = await this.bodyReader.read()
      if (data == "EOF") break

      await conn.write(data)
    }
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
