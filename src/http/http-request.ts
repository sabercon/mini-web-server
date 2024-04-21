import ContentReader from "../base/content-reader"
import DynamicBuffer from "../base/dynamic-buffer"
import TCPConnection from "../tcp/tcp-connection"
import HTTPHeader from "./http-header"
import { CRLF, CRLF2, HTTPError } from "./common"

export default class HTTPRequest {
  constructor(
    public readonly head: RequestHead,
    public readonly body: ContentReader,
  ) {}

  static async read(
    conn: TCPConnection,
    buf: DynamicBuffer,
  ): Promise<HTTPRequest | "END"> {
    const head = await HTTPRequest.readHead(conn, buf)
    if (head == "END") return "END"

    const body = HTTPRequest.readBody(conn, buf, head)
    return new HTTPRequest(head, body)
  }

  private static async readHead(
    conn: TCPConnection,
    buf: DynamicBuffer,
  ): Promise<RequestHead | "END"> {
    let headStr: string
    try {
      headStr = await readUntilDelimiter(conn, buf, CRLF2)
    } catch (error) {
      if (error instanceof HTTPError && error.code == 400 && buf.size() == 0) {
        return "END"
      } else {
        throw error
      }
    }

    const [requestLine, ...headerLines] = headStr.split(CRLF)
    const [method, uri, version] = requestLine.split(" ").map((s) => s.trim())
    const headers = headerLines.map((header) => HTTPHeader.from(header))
    return { method, uri, version, headers }
  }

  private static readBody(
    conn: TCPConnection,
    buf: DynamicBuffer,
    head: RequestHead,
  ): ContentReader {
    const length = HTTPHeader.findContentLength(head.headers)
    const encodings = HTTPHeader.findTransferEncoding(head.headers)
    const chunked = encodings.includes("chunked")

    if (length >= 0) {
      return HTTPRequest.readBodyByLength(conn, buf, length)
    } else if (chunked) {
      return HTTPRequest.readBodyByChunk(conn, buf)
    } else if (head.method == "GET" || head.method == "HEAD") {
      return ContentReader.empty()
    } else {
      // for compatibility with HTTP/1.0 clients
      throw new HTTPError(501, "TODO: to read the rest of the connection")
    }
  }

  private static readBodyByLength(
    conn: TCPConnection,
    buf: DynamicBuffer,
    length: number,
  ): ContentReader {
    let remaining = length
    return new ContentReader(length, async () => {
      if (remaining == 0) return "EOF"

      const data = await readByRemaining(conn, buf, remaining)
      remaining -= data.length
      return data
    })
  }

  private static readBodyByChunk(
    conn: TCPConnection,
    buf: DynamicBuffer,
  ): ContentReader {
    return ContentReader.fromGenerator(HTTPRequest.chunkGenerator(conn, buf))
  }

  private static async *chunkGenerator(
    conn: TCPConnection,
    buf: DynamicBuffer,
  ): AsyncGenerator<Buffer, void, void> {
    for (;;) {
      const size = parseInt(await readUntilDelimiter(conn, buf, CRLF), 16)

      let remaining = size
      while (remaining > 0) {
        const data = await readByRemaining(conn, buf, remaining)
        remaining -= data.length
        yield data
      }
      buf.pop(CRLF.length)

      if (size == 0) return
    }
  }
}

export interface RequestHead {
  readonly method: string
  readonly uri: string
  readonly version: string
  readonly headers: HTTPHeader[]
}

async function readToBuffer(conn: TCPConnection, buf: DynamicBuffer) {
  const data = await conn.read()
  if (data == "END") {
    throw new HTTPError(400, "Unexpected EOF")
  }

  buf.push(data)
}

async function readUntilDelimiter(
  conn: TCPConnection,
  buf: DynamicBuffer,
  delimiter: string,
): Promise<string> {
  while (buf.indexOf(delimiter) < 0) {
    await readToBuffer(conn, buf)
  }
  const data = buf.pop(buf.indexOf(delimiter)).toString()
  buf.pop(delimiter.length)
  return data
}

async function readByRemaining(
  conn: TCPConnection,
  buf: DynamicBuffer,
  remaining: number,
): Promise<Buffer> {
  if (buf.size() == 0) {
    await readToBuffer(conn, buf)
  }
  const toRead = Math.min(remaining, buf.size())
  return buf.pop(toRead)
}
