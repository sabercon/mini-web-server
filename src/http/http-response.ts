import ContentReader from "../base/content-reader"
import TCPConnection from "../tcp/tcp-connection"
import HTTPHeader from "./http-header"
import { CRLF, CRLF2, HTTPError } from "./common"
import { RequestHead } from "./http-request"

export default class HTTPResponse {
  constructor(
    public readonly head: ResponseHead,
    public readonly body: ContentReader,
    public readonly chunked = false,
    public readonly compressed = false,
    public readonly bodyIgnored = false,
  ) {}

  static error(error: HTTPError): HTTPResponse {
    const head = {
      version: "HTTP/1.1",
      code: error.code,
      reason: error.message,
      headers: [],
    }
    const body = ContentReader.empty()
    return new HTTPResponse(head, body)
  }

  static ok(
    requestHead: RequestHead,
    headers: HTTPHeader[],
    body: ContentReader,
  ): HTTPResponse {
    const head = {
      version: requestHead.version,
      code: 200,
      reason: "OK",
      headers,
    }
    return HTTPResponse.of(requestHead, head, body)
  }

  static of(
    requestHead: RequestHead,
    head: ResponseHead,
    body: ContentReader,
  ): HTTPResponse {
    const extraHeaders = []

    const encodings = HTTPHeader.findAcceptEncoding(requestHead.headers)
    const compressed = encodings.some((v) => v.split(";")[0] == "gzip")
    if (compressed) {
      body = body.withGzip()
      extraHeaders.push(HTTPHeader.contentEncoding("gzip"))
    }

    const chunked = body.size == null
    if (chunked) {
      extraHeaders.push(HTTPHeader.transferEncoding("chunked"))
    } else {
      extraHeaders.push(HTTPHeader.contentLength(body.size!))
    }

    const bodyIgnored = requestHead.method == "HEAD"

    head = { ...head, headers: [...head.headers, ...extraHeaders] }
    return new HTTPResponse(head, body, chunked, compressed, bodyIgnored)
  }

  async write(conn: TCPConnection) {
    const statusLine = `${this.head.version} ${this.head.code} ${this.head.reason}`
    const headers = this.head.headers.map((h) => h.toString()).join(CRLF)
    await conn.write(Buffer.from(`${statusLine}${CRLF}${headers}${CRLF2}`))

    try {
      if (this.bodyIgnored) return

      if (this.chunked) {
        await this.writeChunkedBody(conn)
      } else {
        await this.writeNonChunkedBody(conn)
      }
    } finally {
      await this.body.close?.()
    }
  }

  private async writeChunkedBody(conn: TCPConnection) {
    for (;;) {
      const data = await this.body.read()
      if (data == "EOF") {
        await conn.write(Buffer.from("0" + CRLF2))
        break
      }

      const size = Buffer.from(data.length.toString(16))
      const crlf = Buffer.from(CRLF)
      await conn.write(Buffer.concat([size, crlf, data, crlf]))
    }
  }

  private async writeNonChunkedBody(conn: TCPConnection) {
    for (;;) {
      const data = await this.body.read()
      if (data == "EOF") break

      await conn.write(data)
    }
  }
}

export interface ResponseHead {
  readonly version: string
  readonly code: number
  readonly reason: string
  readonly headers: HTTPHeader[]
}
